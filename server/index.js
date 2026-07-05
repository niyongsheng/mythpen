const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');
const { TOOLS, executeTool } = require('./tools');

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
  try {
    const db = require('./db');
    const rows = db.dbQuery('SELECT key, value FROM app_settings');
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    const baseUrl = map.api_base_url || 'https://api.deepseek.com/v1';
    return {
      apiBaseUrl: baseUrl,
      chatUrl: baseUrl.replace(/\/?$/, '') + (baseUrl.endsWith('/chat/completions') ? '' : '/chat/completions'),
      apiKey: map.api_key || process.env.DEEPSEEK_KEY || '',
      apiModel: map.api_model || 'deepseek-chat',
    };
  } catch (e) {
    const baseUrl = 'https://api.deepseek.com/v1';
    return {
      apiBaseUrl: baseUrl,
      chatUrl: baseUrl + '/chat/completions',
      apiKey: process.env.DEEPSEEK_KEY || '',
      apiModel: 'deepseek-chat',
    };
  }
}

// System prompt for novel writing
function buildSystemPrompt(projectName) {
  let context = '';
  try {
    const db = require('./db');
    const pdb = db.getProjectDb(projectName);
    const meta = {};
    pdb.prepare('SELECT key, value FROM project_meta').all().forEach(m => meta[m.key] = m.value);
    const chars = pdb.prepare('SELECT * FROM characters').all();
    const chapters = pdb.prepare('SELECT num, title, outline, status FROM chapters ORDER BY num').all();
    const foreshadows = pdb.prepare("SELECT * FROM foreshadows WHERE status IN ('planted','progressing')").all();

    context = `
项目: ${meta.name || projectName}
模式: ${meta.mode || 'medium-novel'}
写作语言: ${meta.language || 'zh'}
当前总字数: ${meta.word_count || '0'}

角色列表:
${chars.map(c => `- ${c.name}（${c.age}岁，${c.gender}）：${c.personality || ''} ${c.background || ''}`).join('\n')}

章节概览:
${chapters.map(ch => `  [${ch.status}] 第${ch.num}章 ${ch.title} - ${ch.outline || '（暂无大纲）'}`).join('\n')}

活跃伏笔:
${foreshadows.map(f => `  [${f.priority}] ${f.title}：${f.description || ''}`).join('\n')}
`;
  } catch(e) {
    context = `项目: ${projectName}\n`;
  }

  return `你是一位专业的小说创作助手，帮助作者完成从选题到完稿的全流程。

${context}

[约束规则]
- 严格遵循目标语言（中文）写作，不要混入其他语言
- 禁止提前使用尚未发生的情节
- 角色行为符合其设定档案
- 保持悬疑氛围和文学质感
- 每次回复在100-500字之间，除非用户要求更长

[写作风格]
- 语言优美但不浮夸
- 细节描写服务于叙事节奏
- 对话自然，符合角色性格
- 段落长度适中，避免大段独白`;
}

// System prompt for AI chat (conversational mode)
function buildChatPrompt(projectName) {
  let context = '';
  try {
    const db = require('./db');
    const pdb = db.getProjectDb(projectName);
    const meta = {};
    pdb.prepare('SELECT key, value FROM project_meta').all().forEach(m => meta[m.key] = m.value);
    const chars = pdb.prepare('SELECT * FROM characters').all();
    const chapters = pdb.prepare('SELECT num, title, outline, status FROM chapters ORDER BY num').all();
    const foreshadows = pdb.prepare("SELECT * FROM foreshadows WHERE status IN ('planted','progressing')").all();

    context = `
项目: ${meta.name || projectName}
模式: ${meta.mode || 'medium-novel'}
写作语言: ${meta.language || 'zh'}
当前总字数: ${meta.word_count || '0'}

角色列表:
${chars.map(c => `- ${c.name}（${c.age}岁，${c.gender}）：${c.personality || ''} ${c.background || ''}`).join('\n')}

章节概览:
${chapters.map(ch => `  [${ch.status}] 第${ch.num}章 ${ch.title} - ${ch.outline || '（暂无大纲）'}`).join('\n')}

活跃伏笔:
${foreshadows.map(f => `  [${f.priority}] ${f.title}：${f.description || ''}`).join('\n')}
`;
  } catch(e) {
    context = `项目: ${projectName}\n`;
  }

  return `你是一位熟悉这部小说的 AI 助手，帮助作者讨论创作思路、分析设定和回答各种问题。

## 当前小说信息

${context}

## 你的角色
- 与用户自由对话，讨论小说的任何方面：情节发展、角色塑造、世界设定等
- 根据用户的问题提供建议、分析和灵感
- 除非用户明确要求，否则不要直接续写小说内容
- 回复自然、有用、有见地`;
}

// ─── AI Chat Completion (non-streaming) ───
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, project = '我的科幻小说', temperature = 0.8 } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages is required' });
    }

    const aiConfig = getAiConfig();
    const systemPrompt = buildSystemPrompt(project);
    const body = {
      model: aiConfig.apiModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature,
      max_tokens: 4096,
      stream: false,
    };

    const response = await fetch(aiConfig.chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI API error:', response.status, errText);
      return res.status(response.status).json({ error: `API Error: ${response.status}` });
    }

    const data = await response.json();

    // Record token usage
    if (data.usage) {
      try {
        const db = require('./db');
        db.projectExecute(project,
          'INSERT INTO token_usage (task_name, input_tokens, output_tokens, model) VALUES (?, ?, ?, ?)',
          ['chat', data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0, aiConfig.apiModel]
        );
      } catch(e) {}
    }

    res.json(data);
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Streaming Chat with Tool Calling (SSE) ───
app.post('/api/ai/chat/stream', async (req, res) => {
  try {
    const { messages, project = '我的科幻小说', temperature = 0.8, mode = 'writing' } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages is required' });
    }

    const aiConfig = getAiConfig();
    let systemPrompt = mode === 'chat' ? buildChatPrompt(project) : buildSystemPrompt(project);

    // Append tool usage instruction
    systemPrompt += '\n\n[工具使用]\n你拥有一套数据库操作工具，可以查询和修改小说的角色、章节、世界观、伏笔等数据。在回答用户问题时，主动使用工具获取上下文，或者在用户要求时修改数据。不要猜测数据——用工具查询。当你需要创作或修改小说内容时，使用 update_chapter 写入章节、create_character 创建新角色、create_foreshadow 埋下伏笔等。\n\n你还可以：\n- 使用 list_volumes 查看所有卷及其章节结构\n- 使用 create_volume 创建新卷\n- 使用 update_volume 修改卷名\n- 大纲存储在 chapter.outline 字段中，用 update_chapter 的 outline 参数创建或更新大纲\n- 用 update_chapter 的 content 参数将创作的内容保存到数据库中的指定章节';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.write(':ok\n\n');

    const conversation = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const MAX_TOOL_ROUNDS = 8;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      console.log(`[AI Stream] Round ${round}, messages: ${conversation.length}`);

      const body = {
        model: aiConfig.apiModel,
        messages: conversation,
        tools: TOOLS,
        temperature,
        max_tokens: 4096,
        stream: false, // Always non-streaming for reliable tool-call detection
      };

      const response = await fetch(aiConfig.chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.apiKey}` },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[AI Stream] API error:', response.status, errText.slice(0, 500));
        res.write(`event: error\ndata: ${JSON.stringify({ error: `API Error: ${response.status}`, detail: errText.slice(0, 200) })}\n\n`);
        res.end();
        return;
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (data.usage) {
        inputTokens += data.usage.prompt_tokens || 0;
        outputTokens += data.usage.completion_tokens || 0;
      }

      console.log(`[AI Stream] Round ${round} result:`, {
        hasContent: !!msg?.content,
        contentLen: msg?.content?.length || 0,
        hasToolCalls: !!(msg?.tool_calls && msg.tool_calls.length > 0),
        toolCallNames: msg?.tool_calls?.map(tc => tc.function.name) || [],
        finishReason: choice?.finish_reason,
      });

      if (msg?.tool_calls && msg.tool_calls.length > 0) {
        // Add assistant message with tool calls to conversation
        conversation.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });

        // Execute each tool
        for (const tc of msg.tool_calls) {
          let args;
          try { args = JSON.parse(tc.function.arguments); } catch(e) { args = {}; }

          // Notify frontend: tool call started
          res.write(`event: tool_call\ndata: ${JSON.stringify({ id: tc.id, name: tc.function.name, arguments: args })}\n\n`);

          // Execute tool against project database
          let result;
          try {
            result = executeTool(project, tc.function.name, args);
          } catch(e) {
            result = { error: e.message };
          }

          console.log(`[AI Stream] Tool ${tc.function.name}:`, JSON.stringify(result).slice(0, 200));

          // Notify frontend: tool result
          res.write(`event: tool_result\ndata: ${JSON.stringify({ id: tc.id, name: tc.function.name, result })}\n\n`);

          // Add tool result to conversation for next round
          conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        // Continue loop
      } else if (msg?.content) {
        // Got text without tool calls — send as content
        fullContent = msg.content;
        res.write(`event: content_chunk\ndata: ${JSON.stringify({ text: msg.content, position: msg.content.length })}\n\n`);
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
    const { chapterNum, context, style = '悬疑', project = '我的科幻小说' } = req.body;

    const db = require('./db');
    const chapter = db.projectGet(project, 'SELECT * FROM chapters WHERE num = ?', [chapterNum]);

    const messages = [
      { role: 'user', content: `请续写以下小说的第${chapterNum}章「${chapter?.title || '未知'}」。保持${style}氛围，延续已有的文风和叙事视角。\n\n## 当前内容\n\n${chapter?.content?.slice(-1500) || '（新章节开头）'}\n\n## 用户额外要求\n${context || '请自然续写，保持文学质感。'}\n\n请直接开始续写，不要加任何前缀说明。` }
    ];

    // Reuse the streaming endpoint logic
    req.body = { messages, project, temperature: 0.85 };
    // Forward to stream handler
    const aiConfig = getAiConfig();
    const systemPrompt = buildSystemPrompt(project);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // Flush headers immediately so browser sees SSE connection is live
    res.write(':ok\n\n');

    const body = {
      model: aiConfig.apiModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.85,
      max_tokens: 4096,
      stream: true,
    };

    const response = await fetch(aiConfig.chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.write(`event: error\ndata: ${JSON.stringify({ error: `API Error: ${response.status}` })}\n\n`);
      res.end();
      return;
    }

    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            res.write(`event: content_chunk\ndata: ${JSON.stringify({ text: delta.content, position: fullContent.length })}\n\n`);
          }
        } catch(e) {}
      }
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
      } catch(e) { console.error('Save error:', e); }
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
  console.log(`  AI:      ${cfg.apiModel} @ ${cfg.chatUrl}`);
  console.log(`\n  Ready.\n`);
});
