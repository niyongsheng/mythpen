const express = require('express');
const Sentry = require('../instrument');
const db = require('../db');
const { TOOL_REGISTRY, getToolsForRequest, executeTool } = require('../tools');
const { createAIAdapter, requiresReasoningEcho } = require('../ai-adapter');
const { getAiConfig, needsApiKey } = require('../ai-config');
const { buildWritingPrompt, buildContinuePrompt } = require('../prompts/writing');
const { buildTaskPrompt } = require('../prompts/task');
const { stripToolMarkup } = require('../tool-markup');
const { buildCollabPrompt } = require('../prompts/collab');
const { stripLeadingChapterHeading } = require('../titles');

const router = express.Router();

const NOT_CONFIGURED = {
  code: 'AI_NOT_CONFIGURED',
  message: '请先在设置中配置 API Key',
  recoverable: true,
};

// Provider failures used to reach the author as a bare "API Error: 401",
// which says nothing about what to do. Map the common ones to actionable
// text and keep the provider's own message for diagnosis.
function describeAIError(err) {
  const status = err?.status;
  let detail = String(err?.detail || '').replace(/\s+/g, ' ').trim();
  // OpenAI-compatible providers return a JSON error envelope as the body;
  // show the human-readable message instead of the raw JSON on one line.
  try {
    const parsed = JSON.parse(detail);
    detail = String(parsed?.error?.message || parsed?.message || detail);
  } catch {
    /* plain text or empty */
  }
  detail = detail.slice(0, 200);
  const suffix = detail ? `：${detail}` : '';
  switch (status) {
    case 401:
      return `API Key 无效或已过期，请在设置中检查${suffix}（HTTP 401）`;
    case 402:
      return `API 账户余额不足，请充值后重试${suffix}（HTTP 402）`;
    case 403:
      return `API 访问被拒绝，请检查 Key 的权限${suffix}（HTTP 403）`;
    case 404:
      return `模型或接口不存在，请检查设置中的模型名和 Base URL${suffix}（HTTP 404）`;
    case 429:
      return '请求过于频繁，请稍后重试（HTTP 429）';
    default:
      if (status >= 500) return `AI 服务商暂时不可用（HTTP ${status}），请稍后重试`;
      return err?.message || 'AI 请求失败';
  }
}

// ─── AI Chat Completion (non-streaming) ───
router.post('/ai/chat', async (req, res) => {
  try {
    const { messages, project } = req.body;
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
    if (needsApiKey(aiConfig)) {
      return res.status(400).json({ error: NOT_CONFIGURED });
    }
    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    // Page-level AI calls send their task contract as a system message; the
    // adapter merges system roles into the top-level prompt (Claude rejects
    // system roles inside `messages`, and some OpenAI-compatible providers only
    // accept a single system message).
    const result = await adapter.complete(buildTaskPrompt(project), messages, null);

    // Record token usage
    if (result.usage.inputTokens || result.usage.outputTokens) {
      db.recordTokenUsage(project, 'chat', result.usage, aiConfig.apiModel);
    }

    // A thinking model can spend the whole budget on reasoning and return an
    // empty final message. Do not pretend that was a successful task.
    if (!result.content && result.toolCalls.length === 0) {
      const exhausted = result.finishReason === 'length' || result.finishReason === 'max_tokens';
      return res.status(502).json({
        error: {
          code: exhausted ? 'AI_OUTPUT_EXHAUSTED' : 'AI_EMPTY_OUTPUT',
          message: exhausted
            ? '模型把本次输出预算全部用于思考，没有生成正文。请在设置中调大「最大输出 Token」后重试。'
            : '模型没有返回任何内容，请重试。',
          recoverable: true,
        },
      });
    }

    res.json({
      choices: [{ message: { content: result.content, role: 'assistant' } }],
      usage: { prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens },
    });
  } catch (err) {
    console.error('AI chat error:', err);
    Sentry.captureException(err, { tags: { area: 'ai_chat' } });
    res.status(500).json({ error: { code: 'AI_ERROR', message: err.message, recoverable: true } });
  }
});

// ─── AI Streaming Chat with Tool Calling (SSE) ───
router.post('/ai/chat/stream', async (req, res) => {
  // Set when the client disconnects mid-stream (user pressed "stop").
  let clientClosed = false;
  try {
    const { messages, project, mode = 'writing' } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: { code: 'INVALID_PARAMS', message: 'messages is required', recoverable: true },
      });
    }

    const aiConfig = getAiConfig();
    if (needsApiKey(aiConfig)) {
      return res.status(400).json({ error: NOT_CONFIGURED });
    }
    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    const systemPrompt = mode === 'collab' ? buildCollabPrompt(project) : buildWritingPrompt(project);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.write(':ok\n\n');

    // A user "stop" aborts the fetch and closes the response. Without this,
    // the tool loop would keep running (and keep executing tools against the
    // project database) for up to MAX_TOOL_ROUNDS after the UI stopped.
    res.on('close', () => {
      if (!res.writableEnded) clientClosed = true;
    });
    res.on('error', () => {
      clientClosed = true;
    });

    const send = (event, payload) => {
      if (clientClosed || res.writableEnded) return false;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
      return true;
    };

    const conversation = [...messages]; // system is passed separately to adapter
    // Send only the schemas that apply to this project and request. This keeps
    // the fixed per-round input small and hides destructive tools unless the
    // author explicitly asked to delete something.
    const tools = getToolsForRequest(project, mode, conversation);
    console.log(`[AI Stream] tools: ${tools.length}`);
    let fullContent = '';
    let totalReasoning = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const echoReasoning = requiresReasoningEcho(aiConfig);
    const MAX_TOOL_ROUNDS = 120;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (clientClosed) break;
      console.log(`[AI Stream] Round ${round}, messages: ${conversation.length}`);

      const roundStart = totalReasoning.length;
      let roundReasoning = '';
      let result;
      try {
        result = await adapter.complete(systemPrompt, conversation, tools, {
          onEvent: (event) => {
            if (event.type === 'reasoning') {
              roundReasoning += event.text;
              totalReasoning += event.text;
              send('thinking_chunk', { text: event.text });
            } else if (event.type === 'reset') {
              // A retry restarts this round; keep earlier rounds' reasoning.
              roundReasoning = '';
              totalReasoning = totalReasoning.slice(0, roundStart);
              send('thinking_reset', { keep: roundStart });
            }
          },
        });
      } catch (err) {
        Sentry.captureException(err, {
          tags: {
            area: 'ai_stream',
            mode,
            error_code: err.code || (err.status ? 'api_error' : 'unknown'),
          },
        });
        send('error', { error: describeAIError(err), detail: err.detail });
        if (!clientClosed) res.end();
        return;
      }

      inputTokens += result.usage.inputTokens;
      outputTokens += result.usage.outputTokens;

      if (clientClosed) break;

      // Thinking models bill reasoning against `max_tokens`; with a small
      // budget the round can end with no prose and no tool call. Treating
      // that as `task_end` made the UI report success with zero output
      // (GitHub issue #9), so surface an actionable error instead.
      if (!result.content && result.toolCalls.length === 0) {
        const exhausted = result.finishReason === 'length' || result.finishReason === 'max_tokens';
        const code = exhausted ? 'AI_OUTPUT_EXHAUSTED' : 'AI_EMPTY_OUTPUT';
        const message = exhausted
          ? '模型把本次输出预算全部用于思考，没有生成正文。请在设置中调大「最大输出 Token」（建议 65536 以上）后重试。'
          : '模型没有返回任何内容，请重试。';
        console.warn(`[AI Stream] Empty round (${code}), finishReason=${result.finishReason}`);
        Sentry.captureException(Object.assign(new Error(message), { code }), {
          tags: { area: 'ai_stream', mode, error_code: code },
        });
        send('error', { error: message });
        if (!clientClosed) res.end();
        return;
      }

      console.log(`[AI Stream] Round ${round} result:`, {
        hasContent: !!result.content,
        contentLen: result.content?.length || 0,
        hasToolCalls: result.toolCalls.length > 0,
        toolCallNames: result.toolCalls.map(tc => tc.name) || [],
      });

      if (result.toolCalls.length > 0) {
        // Add assistant message with tool calls to conversation. GLM/Zhipu
        // require the reasoning of this round to be echoed for interleaved
        // thinking; other providers reject the unknown field.
        const assistantMessage = {
          role: 'assistant',
          content: result.content || '',
          tool_calls: result.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        };
        if (echoReasoning && roundReasoning) {
          assistantMessage.reasoning_content = roundReasoning;
        }
        conversation.push(assistantMessage);

        // Execute each tool
        for (const tc of result.toolCalls) {
          if (clientClosed) break;

          const tool = TOOL_REGISTRY[tc.name];
          const entities = tool?.entities || [];
          const chapterTree = tool?.chapterTree === true;

          // Notify frontend: tool call started. Entities are sent here too so
          // a run cut short before the result still refreshes the right pages.
          send('tool_call', { id: tc.id, name: tc.name, arguments: tc.args, entities, chapterTree });

          // Execute tool against project database
          let toolResult;
          try {
            toolResult = executeTool(project, tc.name, tc.args);
          } catch (e) {
            toolResult = { error: e.message };
          }

          console.log(`[AI Stream] Tool ${tc.name}:`, JSON.stringify(toolResult).slice(0, 200));

          // Notify frontend: tool result
          send('tool_result', {
            id: tc.id,
            name: tc.name,
            entities,
            chapterTree,
            result: toolResult,
          });

          // Add tool result to conversation for next round (OpenAI format — adapter handles conversion)
          conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult) });
        }
        if (clientClosed) break;
        // Continue loop
      } else if (result.content) {
        // Got text without tool calls — send as content
        fullContent = result.content;
        send('content_chunk', { text: result.content, position: result.content.length });
        break;
      } else {
        console.log('[AI Stream] No content and no tool calls — ending');
        break;
      }
    }

    db.recordTokenUsage(project, 'stream_chat', { inputTokens, outputTokens }, aiConfig.apiModel);

    if (!clientClosed) {
      send('task_end', {
        success: true,
        content: fullContent,
        inputTokens,
        outputTokens,
        reasoning: totalReasoning,
      });
      res.end();
    }

  } catch (err) {
    console.error('AI stream error:', err);
    Sentry.captureException(err, { tags: { area: 'ai_stream_outer' } });
    if (clientClosed) return;
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
    const { chapterNum, context, style = '悬疑', project, mode = 'continue' } = req.body;
    const polishing = mode === 'polish';

    const chapter = db.projectGet(project, 'SELECT * FROM chapters WHERE num = ?', [chapterNum]);

    const aiConfig = getAiConfig();
    if (needsApiKey(aiConfig)) {
      return res.status(400).json({ error: NOT_CONFIGURED });
    }

    if (polishing) {
      if (!chapter?.content?.trim()) {
        return res.status(400).json({
          error: { code: 'EMPTY_CHAPTER', message: '当前章节还没有正文，无法润色。', recoverable: true },
        });
      }
      // A full rewrite longer than the output budget would be truncated and
      // silently replace the chapter with a partial version.
      const maxPolishChars = Math.floor((aiConfig.maxOutputTokens || 393216) * 0.8);
      if (chapter.content.length > maxPolishChars) {
        return res.status(400).json({
          error: {
            code: 'CHAPTER_TOO_LONG',
            message: `章节过长（${chapter.content.length} 字），整章润色可能被输出上限截断。请分段润色，或在设置中调大「最大输出 Token」。`,
            recoverable: true,
          },
        });
      }
    }

    const userMessage = polishing
      ? `请润色以下章节正文。保持情节、人物和叙事视角不变，只提升语言、节奏与细节。\n\n## 章节\n第${chapterNum}章「${chapter?.title || '未知'}」\n\n## 正文\n\n${chapter.content}\n\n## 用户额外要求\n${context || '无'}\n\n只输出润色后的完整正文，不要输出解释或前后缀。`
      : `请续写以下小说的第${chapterNum}章「${chapter?.title || '未知'}」。保持${style}氛围，延续已有的文风和叙事视角。\n\n## 当前内容\n\n${chapter?.content?.slice(-1500) || '（新章节开头）'}\n\n## 用户额外要求\n${context || '请自然续写，保持文学质感。'}\n\n请直接开始续写，不要加任何前缀说明。`;

    const messages = [{ role: 'user', content: userMessage }];

    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    // This endpoint streams prose without registering tools — use a prompt that
    // never mentions them, otherwise models emit tool-call markup as text.
    const systemPrompt = buildContinuePrompt(project);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // Flush headers immediately so browser sees SSE connection is live
    res.write(':ok\n\n');

    let rawContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const event of adapter.stream(systemPrompt, messages)) {
        if (event.type === 'chunk') {
          // Buffer the whole response: tool-call markup can straddle chunk
          // boundaries, so it can only be stripped reliably once complete.
          rawContent += event.text;
        }
        if (event.type === 'usage') {
          inputTokens = event.inputTokens || 0;
          outputTokens = event.outputTokens || 0;
        }
      }
    } catch (err) {
      console.error('Continue stream error:', err);
      Sentry.captureException(err, { tags: { area: polishing ? 'ai_polish' : 'ai_continue' } });
      res.write(`event: error\ndata: ${JSON.stringify({ error: describeAIError(err) })}\n\n`);
      res.end();
      return;
    }

    const fullContent = stripToolMarkup(rawContent);

    // A thinking model can return only reasoning and no prose. Do not report
    // an empty continuation/polish as a successful task.
    if (!fullContent.trim()) {
      db.recordTokenUsage(project, polishing ? 'polish' : 'continue', { inputTokens, outputTokens }, aiConfig.apiModel);
      res.write(`event: error\ndata: ${JSON.stringify({
        error: polishing
          ? '润色结果为空，章节未修改。请调大「最大输出 Token」或稍后重试。'
          : '模型没有生成正文，请调大「最大输出 Token」或稍后重试。',
      })}\n\n`);
      res.end();
      return;
    }

    // Save to chapter. Polish replaces the chapter; a suspiciously short
    // rewrite is rejected rather than overwriting the author's text.
    if (polishing) {
      const minLength = Math.max(20, Math.floor(chapter.content.length * 0.5));
      if (fullContent.length < minLength) {
        db.recordTokenUsage(project, 'polish', { inputTokens, outputTokens }, aiConfig.apiModel);
        res.write(`event: error\ndata: ${JSON.stringify({ error: '润色结果异常（输出过短），章节未修改，请重试。' })}\n\n`);
        res.end();
        return;
      }
      // The author may have kept editing while the model was working — never
      // overwrite those changes with the rewrite of an older snapshot.
      const current = db.projectGet(project, 'SELECT content FROM chapters WHERE num = ?', [chapterNum]);
      if ((current?.content || '') !== chapter.content) {
        db.recordTokenUsage(project, 'polish', { inputTokens, outputTokens }, aiConfig.apiModel);
        res.write(`event: error\ndata: ${JSON.stringify({ error: '章节在润色期间被修改，已取消替换，请重试。' })}\n\n`);
        res.end();
        return;
      }
      try {
        const cleaned = stripLeadingChapterHeading(fullContent, { title: chapter?.title });
        const wc = db.countWords(cleaned);
        db.projectExecute(project,
          "UPDATE chapters SET content = ?, word_count = ?, status = 'writing', updated_at = datetime('now') WHERE num = ?",
          [cleaned, wc, chapterNum]
        );
        db.recalculateWordCount(project);
      } catch(e) {
        console.error('Save error:', e);
        Sentry.captureException(e, { tags: { area: 'chapter_save' } });
      }
    } else if (fullContent.length > 10) {
      try {
        const existing = db.projectGet(project, 'SELECT content FROM chapters WHERE num = ?', [chapterNum]);
        // Only strip the heading when appending to an empty chapter; inside an
        // existing chapter a heading line can be intentional.
        const addition = (existing?.content || '').trim()
          ? fullContent
          : stripLeadingChapterHeading(fullContent, { title: chapter?.title });
        const newContent = (existing?.content || '') + '\n\n' + addition;
        const wc = db.countWords(newContent);
        db.projectExecute(project,
          "UPDATE chapters SET content = ?, word_count = ?, status = 'writing', updated_at = datetime('now') WHERE num = ?",
          [newContent, wc, chapterNum]
        );
        db.recalculateWordCount(project);
      } catch(e) {
        console.error('Save error:', e);
        Sentry.captureException(e, { tags: { area: 'chapter_save' } });
      }
    }

    if (fullContent) {
      res.write(`event: content_chunk\ndata: ${JSON.stringify({ text: fullContent, position: fullContent.length })}\n\n`);
    }

    db.recordTokenUsage(project, polishing ? 'polish' : 'continue', { inputTokens, outputTokens }, aiConfig.apiModel);

    res.write(`event: task_end\ndata: ${JSON.stringify({ success: true, content: fullContent })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Continue error:', err);
    Sentry.captureException(err, { tags: { area: 'ai_continue_outer' } });
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'AI_ERROR', message: err.message, recoverable: true } });
    } else {
      res.write(`event: task_error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
