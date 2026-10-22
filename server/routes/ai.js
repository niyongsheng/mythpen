const express = require('express');
const db = require('../db');
const { TOOLS, TOOL_REGISTRY, executeTool } = require('../tools');
const { createAIAdapter } = require('../ai-adapter');
const { getAiConfig } = require('../ai-config');
const { buildWritingPrompt } = require('../prompts/writing');
const { buildCollabPrompt } = require('../prompts/collab');

const router = express.Router();

// ─── AI Chat Completion (non-streaming) ───
router.post('/ai/chat', async (req, res) => {
  try {
    const { messages, project, temperature = 0.8 } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: { code: 'INVALID_PARAMS', message: 'messages is required', recoverable: true },
      });
    }

    // Clone so per-request overrides (e.g. "test connection") do not mutate
    // the shared cached config.
    const aiConfig = { ...getAiConfig() };
    // 测试连接时允许前端传入 API key/baseUrl/model 覆盖数据库配置
    if (req.body.apiKey !== undefined) {
      aiConfig.apiKey = req.body.apiKey;
    }
    if (req.body.apiBaseUrl !== undefined) {
      aiConfig.apiBaseUrl = req.body.apiBaseUrl;
    }
    if (req.body.apiModel !== undefined) {
      aiConfig.apiModel = req.body.apiModel;
    }
    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    const systemPrompt = buildWritingPrompt(project);

    const result = await adapter.complete(systemPrompt, messages, null, temperature);

    // Record token usage
    if (result.usage.inputTokens || result.usage.outputTokens) {
      db.recordTokenUsage(project, 'chat', result.usage, aiConfig.apiModel);
    }

    res.json({
      choices: [{ message: { content: result.content, role: 'assistant' } }],
      usage: { prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens },
    });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: { code: 'AI_ERROR', message: err.message, recoverable: true } });
  }
});

// ─── AI Streaming Chat with Tool Calling (SSE) ───
router.post('/ai/chat/stream', async (req, res) => {
  try {
    const { messages, project, temperature = 0.8, mode = 'writing' } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: { code: 'INVALID_PARAMS', message: 'messages is required', recoverable: true },
      });
    }

    const aiConfig = getAiConfig();
    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    const systemPrompt = mode === 'collab' ? buildCollabPrompt(project) : buildWritingPrompt(project);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.write(':ok\n\n');

    const conversation = [...messages]; // system is passed separately to adapter
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const MAX_TOOL_ROUNDS = 120;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      console.log(`[AI Stream] Round ${round}, messages: ${conversation.length}`);

      let result;
      try {
        result = await adapter.complete(systemPrompt, conversation, TOOLS, temperature);
      } catch (err) {
        if (err.status) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: `API Error: ${err.status}`, detail: err.detail })}\n\n`);
        } else {
          res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
        }
        res.end();
        return;
      }

      inputTokens += result.usage.inputTokens;
      outputTokens += result.usage.outputTokens;

      console.log(`[AI Stream] Round ${round} result:`, {
        hasContent: !!result.content,
        contentLen: result.content?.length || 0,
        hasToolCalls: result.toolCalls.length > 0,
        toolCallNames: result.toolCalls.map(tc => tc.name) || [],
      });

      if (result.toolCalls.length > 0) {
        // Add assistant message with tool calls to conversation
        conversation.push({
          role: 'assistant',
          content: result.content,
          tool_calls: result.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        });

        // Execute each tool
        for (const tc of result.toolCalls) {
          // Notify frontend: tool call started
          res.write(`event: tool_call\ndata: ${JSON.stringify({ id: tc.id, name: tc.name, arguments: tc.args })}\n\n`);

          // Execute tool against project database
          let toolResult;
          try {
            toolResult = executeTool(project, tc.name, tc.args);
          } catch (e) {
            toolResult = { error: e.message };
          }

          console.log(`[AI Stream] Tool ${tc.name}:`, JSON.stringify(toolResult).slice(0, 200));

          // Notify frontend: tool result
          res.write(
            `event: tool_result\ndata: ${JSON.stringify({ id: tc.id, name: tc.name, entity: TOOL_REGISTRY[tc.name]?.entity || null, result: toolResult })}\n\n`,
          );

          // Add tool result to conversation for next round (OpenAI format — adapter handles conversion)
          conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult) });
        }
        // Continue loop
      } else if (result.content) {
        // Got text without tool calls — send as content
        fullContent = result.content;
        res.write(`event: content_chunk\ndata: ${JSON.stringify({ text: result.content, position: result.content.length })}\n\n`);
        break;
      } else {
        console.log('[AI Stream] No content and no tool calls — ending');
        break;
      }
    }

    db.recordTokenUsage(project, 'stream_chat', { inputTokens, outputTokens }, aiConfig.apiModel);

    res.write(`event: task_end\ndata: ${JSON.stringify({ success: true, content: fullContent, inputTokens, outputTokens })}\n\n`);
    res.end();

  } catch (err) {
    console.error('AI stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'AI_ERROR', message: err.message, recoverable: true } });
    } else {
      res.write(`event: task_error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// ─── AI Continue Writing (streaming) ───
router.post('/ai/continue', async (req, res) => {
  try {
    const { chapterNum, context, style = '悬疑', project } = req.body;

    const chapter = db.projectGet(project, 'SELECT * FROM chapters WHERE num = ?', [chapterNum]);

    const messages = [
      { role: 'user', content: `请续写以下小说的第${chapterNum}章「${chapter?.title || '未知'}」。保持${style}氛围，延续已有的文风和叙事视角。\n\n## 当前内容\n\n${chapter?.content?.slice(-1500) || '（新章节开头）'}\n\n## 用户额外要求\n${context || '请自然续写，保持文学质感。'}\n\n请直接开始续写，不要加任何前缀说明。` }
    ];

    const aiConfig = getAiConfig();
    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    const systemPrompt = buildWritingPrompt(project);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // Flush headers immediately so browser sees SSE connection is live
    res.write(':ok\n\n');

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of adapter.stream(systemPrompt, messages, 0.85)) {
        if (event.type === 'chunk') {
          fullContent += event.text;
          res.write(`event: content_chunk\ndata: ${JSON.stringify({ text: event.text, position: fullContent.length })}\n\n`);
        }
        if (event.type === 'usage') {
          inputTokens = event.inputTokens || 0;
          outputTokens = event.outputTokens || 0;
        }
      }
    } catch (err) {
      console.error('Continue stream error:', err);
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
      return;
    }

    // Save to chapter
    if (fullContent.length > 10) {
      try {
        const existing = db.projectGet(project, 'SELECT content FROM chapters WHERE num = ?', [chapterNum]);
        const newContent = (existing?.content || '') + '\n\n' + fullContent;
        const wc = db.countWords(newContent);
        db.projectExecute(project,
          "UPDATE chapters SET content = ?, word_count = ?, status = 'writing', updated_at = datetime('now') WHERE num = ?",
          [newContent, wc, chapterNum]
        );
        db.recalculateWordCount(project);
      } catch(e) { console.error('Save error:', e); }
    }

    db.recordTokenUsage(project, 'continue', { inputTokens, outputTokens }, aiConfig.apiModel);

    res.write(`event: task_end\ndata: ${JSON.stringify({ success: true, content: fullContent })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Continue error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'AI_ERROR', message: err.message, recoverable: true } });
    } else {
      res.write(`event: task_error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
