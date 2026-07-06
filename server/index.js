const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');
const { TOOLS, executeTool } = require('./tools');
const { createAIAdapter } = require('./ai-adapter');
const { buildWritingPrompt } = require('./prompts/writing');
const { buildCollabPrompt } = require('./prompts/collab');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Request logging ───
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.path.startsWith('/api/ai')) return; // don't log AI streaming
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ─── API Routes ───
app.use('/api', apiRoutes);

// ═══════════════════════════════════════════
// AI CONFIG — read from config.db
// ═══════════════════════════════════════════

function getAiConfig() {
  const DEFAULTS = {
    apiBaseUrl: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_KEY || '',
    apiModel: 'deepseek-chat',
    apiType: '',
  };
  try {
    const db = require('./db');
    const rows = db.dbQuery('SELECT key, value FROM app_settings');
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    return {
      apiBaseUrl: map.api_base_url || DEFAULTS.apiBaseUrl,
      apiKey: map.api_key || DEFAULTS.apiKey,
      apiModel: map.api_model || DEFAULTS.apiModel,
      apiType: map.api_type || DEFAULTS.apiType,
    };
  } catch (e) {
    return { ...DEFAULTS };
  }
}


// ─── AI Chat Completion (non-streaming) ───
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, project, temperature = 0.8 } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages is required' });
    }

    const aiConfig = getAiConfig();
    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    const systemPrompt = buildWritingPrompt(project);

    const result = await adapter.complete(systemPrompt, messages, null, temperature);

    // Record token usage
    if (result.usage.inputTokens || result.usage.outputTokens) {
      try {
        const db = require('./db');
        db.projectExecute(project,
          'INSERT INTO token_usage (task_name, input_tokens, output_tokens, model) VALUES (?, ?, ?, ?)',
          ['chat', result.usage.inputTokens, result.usage.outputTokens, aiConfig.apiModel]
        );
      } catch(e) {}
    }

    res.json({
      choices: [{ message: { content: result.content, role: 'assistant' } }],
      usage: { prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens },
    });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ─── AI Streaming Chat with Tool Calling (SSE) ───
app.post('/api/ai/chat/stream', async (req, res) => {
  try {
    const { messages, project, temperature = 0.8, mode = 'writing' } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages is required' });
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
    const MAX_TOOL_ROUNDS = 8;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
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
          } catch(e) {
            toolResult = { error: e.message };
          }

          console.log(`[AI Stream] Tool ${tc.name}:`, JSON.stringify(toolResult).slice(0, 200));

          // Notify frontend: tool result
          res.write(`event: tool_result\ndata: ${JSON.stringify({ id: tc.id, name: tc.name, result: toolResult })}\n\n`);

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

    // Record token usage
    try {
      const db = require('./db');
      db.projectExecute(project,
        'INSERT INTO token_usage (task_name, input_tokens, output_tokens, model) VALUES (?, ?, ?, ?)',
        ['stream_chat', inputTokens, outputTokens, aiConfig.apiModel]
      );
    } catch(e) {}

    res.write(`event: task_end\ndata: ${JSON.stringify({ success: true, content: fullContent, inputTokens, outputTokens })}\n\n`);
    res.end();

  } catch (err) {
    console.error('AI stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: task_error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// ─── AI Continue Writing (streaming) ───
app.post('/api/ai/continue', async (req, res) => {
  try {
    const { chapterNum, context, style = '悬疑', project } = req.body;

    const db = require('./db');
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
        const wc = newContent.replace(/\s/g, '').length;
        db.projectExecute(project,
          "UPDATE chapters SET content = ?, word_count = ?, status = 'writing', updated_at = datetime('now') WHERE num = ?",
          [newContent, wc, chapterNum]
        );
        // Recalculate project word count
        const total = db.projectGet(project, 'SELECT SUM(word_count) as total FROM chapters')?.total || 0;
        db.projectExecute(project, "UPDATE project_meta SET value = ? WHERE key = 'word_count'", [String(total)]);
      } catch(e) { console.error('Save error:', e); }
    }

    // Record token usage
    try {
      db.projectExecute(project,
        'INSERT INTO token_usage (task_name, input_tokens, output_tokens, model) VALUES (?, ?, ?, ?)',
        ['continue', inputTokens, outputTokens, aiConfig.apiModel]
      );
    } catch(e) {}

    res.write(`event: task_end\ndata: ${JSON.stringify({ success: true, content: fullContent })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Continue error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: task_error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// ─── Health check ───
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: 'connected',
    version: '0.1.0',
    mode: 'development',
  });
});

// ─── Start ───
app.listen(PORT, () => {
  const cfg = getAiConfig();
  console.log(`\n  🖋️  Mythpen API Server`);
  console.log(`  ─────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/api/health`);
  console.log(`  AI:      ${cfg.apiModel} @ ${cfg.apiBaseUrl}`);
  console.log(`\n  Ready.\n`);
});
