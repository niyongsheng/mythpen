const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');
const importRoutes = require('./routes/import');
const { TOOLS, executeTool } = require('./tools');
const { createAIAdapter } = require('./ai-adapter');
const { buildWritingPrompt } = require('./prompts/writing');
const { buildCollabPrompt } = require('./prompts/collab');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───
app.use(cors());
app.use(express.json({ limit: '64mb' }));

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
app.use('/api', importRoutes);
app.use('/api', apiRoutes);

// ═══════════════════════════════════════════
// AI CONFIG — read from config.db
// ═══════════════════════════════════════════

// ─── AI Config cache (invalidated when settings are updated) ───
let aiConfigCache = null;

function invalidateAiConfigCache() {
  aiConfigCache = null;
}

function getAiConfig() {
  if (aiConfigCache) return aiConfigCache;

  const DEFAULTS = {
    apiBaseUrl: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_KEY || '',
    apiModel: 'deepseek-flash',
    apiType: '',
    maxOutputTokens: 8192,
    sendTemperature: true,
  };
  try {
    const db = require('./db');
    const rows = db.dbQuery('SELECT key, value FROM app_settings');
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    aiConfigCache = {
      apiBaseUrl: map.api_base_url || DEFAULTS.apiBaseUrl,
      apiKey: map.api_key || DEFAULTS.apiKey,
      apiModel: map.api_model || DEFAULTS.apiModel,
      apiType: map.api_type || DEFAULTS.apiType,
      maxOutputTokens: Number(map.max_output_tokens) || DEFAULTS.maxOutputTokens,
      sendTemperature: map.send_temperature !== 'false',
    };
    return aiConfigCache;
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
      try {
        const db = require('./db');
        db.projectExecute(project,
          'INSERT INTO token_usage (task_name, input_tokens, output_tokens, model) VALUES (?, ?, ?, ?)',
          ['chat', result.usage.inputTokens, result.usage.outputTokens, aiConfig.apiModel]
        );
      } catch(e) {
          console.warn('[AI Chat] Failed to record token usage:', e.message);
        }
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
        } catch(e) {
          console.warn('[AI Stream] Failed to record token usage:', e.message);
        }

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
      } catch(e) {
        console.warn('[AI Continue] Failed to record token usage:', e.message);
      }

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

// ─── Analyse an imported work (optional post-import step) ───
function extractJsonObject(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

app.post('/api/ai/analyze-import', async (req, res) => {
  const project = req.body?.project;
  if (!project) {
    return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'project is required' } });
  }

  const aiConfig = getAiConfig();
  if (!aiConfig.apiKey) {
    return res.status(400).json({
      error: { code: 'AI_NOT_CONFIGURED', message: '请先在设置中配置 API Key', recoverable: true },
    });
  }

  const db = require('./db');
  try {
    db.getProjectDb(project);
  } catch {
    return res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `项目"${project}"不存在` } });
  }

  const totalChapters = db.projectGet(project, 'SELECT COUNT(*) as c FROM chapters')?.c || 0;
  if (totalChapters === 0) {
    return res.status(400).json({ error: { code: 'NO_CONTENT', message: '项目中没有章节内容' } });
  }

  // Build a bounded sample: first 3 chapters, the first chapter of each volume
  // (up to 6 volumes), and the last 2 chapters.
  const firstChapters = db.projectQuery(
    project,
    "SELECT num, title, content FROM chapters WHERE content != '' ORDER BY num LIMIT 3",
  );
  const lastChapters = db.projectQuery(
    project,
    "SELECT num, title, content FROM chapters WHERE content != '' ORDER BY num DESC LIMIT 2",
  ).reverse();
  const volumes = db.projectQuery(project, 'SELECT id, title FROM volumes ORDER BY sort_order LIMIT 6');

  const seen = new Set();
  const parts = [];
  for (const ch of firstChapters) {
    seen.add(ch.num);
    parts.push(`【第${ch.num}章 ${ch.title}】\n${String(ch.content).slice(0, 2500)}`);
  }
  for (const vol of volumes) {
    const ch = db.projectGet(
      project,
      "SELECT num, title, content FROM chapters WHERE volume_id = ? AND content != '' ORDER BY num LIMIT 1",
      [vol.id],
    );
    if (ch && !seen.has(ch.num)) {
      seen.add(ch.num);
      parts.push(`【${vol.title} 开篇 · 第${ch.num}章 ${ch.title}】\n${String(ch.content).slice(0, 800)}`);
    }
  }
  for (const ch of lastChapters) {
    if (seen.has(ch.num)) continue;
    seen.add(ch.num);
    parts.push(`【第${ch.num}章 ${ch.title}（结尾）】\n${String(ch.content).slice(-2500)}`);
  }

  const titles = db.projectQuery(project, 'SELECT num, title FROM chapters ORDER BY num LIMIT 200');
  const titleList = titles.map((ch) => `第${ch.num}章 ${ch.title}`).join('\n');
  const titleNote = totalChapters > titles.length ? `（共 ${totalChapters} 章，以下仅前 ${titles.length} 章）` : `（共 ${totalChapters} 章）`;
  const sample = `<book_content>\n章节列表${titleNote}：\n${titleList}\n\n正文采样：\n${parts.join('\n\n')}\n</book_content>`;

  const { IMPORT_ANALYSIS_SYSTEM_PROMPT } = require('./prompts/import');
  const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);

  let inputTokens = 0;
  let outputTokens = 0;
  let parsed = null;
  let lastError = null;

  try {
    const first = await withTimeout(
      adapter.complete(IMPORT_ANALYSIS_SYSTEM_PROMPT, [{ role: 'user', content: sample }], null, 0.3),
      120000,
      'AI 分析超时',
    );
    inputTokens += first.usage?.inputTokens || 0;
    outputTokens += first.usage?.outputTokens || 0;
    parsed = extractJsonObject(first.content);

    if (!parsed) {
      // One retry with an explicit correction message.
      const retry = await withTimeout(
        adapter.complete(
          IMPORT_ANALYSIS_SYSTEM_PROMPT,
          [
            { role: 'user', content: sample },
            { role: 'assistant', content: first.content || '' },
            { role: 'user', content: '你上面的输出不是合法 JSON。请重新输出，只输出 JSON 对象，不要代码块或解释。' },
          ],
          null,
          0.2,
        ),
        120000,
        'AI 分析超时',
      );
      inputTokens += retry.usage?.inputTokens || 0;
      outputTokens += retry.usage?.outputTokens || 0;
      parsed = extractJsonObject(retry.content);
    }
  } catch (err) {
    lastError = err;
  }

  const metaRows = db.projectQuery(project, 'SELECT key, value FROM project_meta');
  const meta = {};
  for (const row of metaRows) meta[row.key] = row.value;
  const setMeta = (key, value) =>
    db.projectExecute(project, 'INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)', [key, value]);

  if (!parsed) {
    setMeta('ai_analysis_status', 'failed');
    console.error('[Import Analysis] Failed:', lastError?.message || 'invalid JSON');
    return res.status(502).json({
      error: {
        code: 'ANALYSIS_FAILED',
        message: lastError?.message || 'AI 返回内容无法解析为 JSON',
        recoverable: true,
      },
    });
  }

  const synopsis = typeof parsed.synopsis === 'string' ? parsed.synopsis.trim().slice(0, 1200) : '';
  const characters = Array.isArray(parsed.characters) ? parsed.characters.slice(0, 20) : [];
  const world = Array.isArray(parsed.world) ? parsed.world.slice(0, 20) : [];
  const allowedCategories = new Set(['location', 'organization', 'concept', 'event']);

  try {
    const pdb = db.getProjectDb(project);
    const existingDescription = meta.description || '';
    let insertedCharacters = 0;
    let insertedWorld = 0;

    db.projectTransaction(project, () => {
      const insertCharacter = pdb.prepare(
        `INSERT OR IGNORE INTO characters
          (id, name, age, gender, personality, background, motivation, arc, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      );
      for (const ch of characters) {
        const name = typeof ch?.name === 'string' ? ch.name.trim().slice(0, 100) : '';
        if (!name) continue;
        const info = insertCharacter.run(
          require('crypto').randomUUID(),
          name,
          String(ch.age || '未知').slice(0, 50),
          String(ch.gender || '未知').slice(0, 20),
          String(ch.personality || '').slice(0, 500),
          String(ch.background || '').slice(0, 1000),
          String(ch.motivation || '').slice(0, 500),
          String(ch.arc || '').slice(0, 500),
        );
        if (info.changes > 0) insertedCharacters += 1;
      }

      const findWorld = pdb.prepare('SELECT id FROM world_entries WHERE name = ? LIMIT 1');
      const insertWorld = pdb.prepare(
        'INSERT INTO world_entries (id, category, name, description, tags) VALUES (?, ?, ?, ?, ?)',
      );
      for (const entry of world) {
        const name = typeof entry?.name === 'string' ? entry.name.trim().slice(0, 100) : '';
        if (!name) continue;
        if (findWorld.get(name)) continue;
        const category = allowedCategories.has(entry.category) ? entry.category : 'concept';
        insertWorld.run(
          require('crypto').randomUUID(),
          category,
          name,
          String(entry.description || '').slice(0, 1000),
          '[]',
        );
        insertedWorld += 1;
      }

      if (synopsis) {
        pdb.prepare('INSERT INTO memories (id, category, content) VALUES (?, ?, ?)').run(
          require('crypto').randomUUID(),
          'other',
          `【原著梗概】${synopsis}`,
        );
      }

      const setMetaStmt = pdb.prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)');
      if (synopsis) {
        setMetaStmt.run('ai_synopsis', synopsis);
        if (!existingDescription) setMetaStmt.run('description', synopsis);
      }
      setMetaStmt.run('ai_analysis_status', 'done');
    });

    try {
      db.projectExecute(
        project,
        'INSERT INTO token_usage (task_name, input_tokens, output_tokens, model) VALUES (?, ?, ?, ?)',
        ['import_analysis', inputTokens, outputTokens, aiConfig.apiModel],
      );
    } catch (e) {
      console.warn('[Import Analysis] Failed to record token usage:', e.message);
    }

    return res.json({
      success: true,
      synopsis,
      characters: insertedCharacters,
      world: insertedWorld,
    });
  } catch (err) {
    console.error('[Import Analysis] Persist failed:', err);
    setMeta('ai_analysis_status', 'failed');
    return res.status(500).json({
      error: { code: 'ANALYSIS_PERSIST_FAILED', message: err.message || '分析结果写入失败', recoverable: true },
    });
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

// ─── Graceful shutdown ───
// Called by Tauri on app exit to avoid antivirus flagging SIGKILL/TerminateProcess
let serverInstance = null;

function gracefulShutdown() {
  console.log('\n  🛑 Shutting down Mythpen API Server gracefully...');
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('  ✓ Server closed.');
      process.exit(0);
    });
    // Force exit after 5s if close hangs
    setTimeout(() => {
      console.error('  ⚠️  Server close timed out, forcing exit.');
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
}

app.post('/api/shutdown', (req, res) => {
  res.json({ status: 'shutting_down' });
  setImmediate(() => gracefulShutdown());
});

// Handle SIGTERM from Tauri (sent before SIGKILL on some platforms)
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Share cache invalidation with routes (settings updates clear the cache)
const db = require('./db');
db.invalidateAiConfigCache = invalidateAiConfigCache;

// ─── Start (async — init DB then listen) ───
const { initDatabase } = require('./db');
const serverStartTime = Date.now();
console.log('[Server] Mythpen API Server starting...');
console.log('[Server] Port:', PORT);
initDatabase()
  .then(() => {
    serverInstance = app.listen(PORT, () => {
      const cfg = getAiConfig();
      const elapsed = Date.now() - serverStartTime;
      console.log(`\n  🖋️  Mythpen API Server`);
      console.log(`  ─────────────────────`);
      console.log(`  Local:   http://localhost:${PORT}`);
      console.log(`  Health:  http://localhost:${PORT}/api/health`);
      console.log(`  AI:      ${cfg.apiModel} @ ${cfg.apiBaseUrl}`);
      console.log(`  Startup: ${elapsed}ms`);
      console.log(`\n  Ready.\n`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to initialise database:', err);
    process.exit(1);
  });
