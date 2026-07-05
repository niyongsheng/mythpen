const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');
const { TOOLS, executeTool } = require('./tools');
const { createAIAdapter } = require('./ai-adapter');

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

[章节写作工作流]
写一章的标准流程如下。每一步使用对应工具完成，不要跳过：

第一步 · 了解项目
  使用 list_characters、list_foreshadows、list_volumes 等工具了解当前项目的角色、伏笔、章节结构。

第二步 · 阅读大纲
  使用 get_chapter 阅读当前章节的大纲（outline 字段）和前文内容，理解这段要写什么。
  ⚠️ 如果该章节没有大纲（outline 为空），则不能直接写正文。
  先执行【写大纲】步骤，用 update_chapter 的 outline 参数填入大纲，然后再继续。

第三步 · 创作
  根据大纲和前文，使用 update_chapter 的 content 参数写入正文，同时将章节 status 设为 writing。
  ⚠️ 严格遵守大纲范围：大纲写到哪里，内容就写到哪里。不能超越大纲进度、不能提前推进到大纲未涉及的情节。
  注意：
  - 与上一章结尾无缝衔接
  - 推动主线或支线情节
  - 所有角色行为符合其性格设定
  - 字数 500-2000 字，根据大纲复杂度调整

第四步 · 润色
  重新读取已写内容，检查语言流畅度、用词准确性、节奏感。使用 update_chapter 更新润色后的版本。

第五步 · 审稿
  对照约束规则检查：
  - □ 是否使用目标语言
  - □ 所有角色行为符合设定
  - □ 没有提前泄露未发生的剧情
  - □ 伏笔铺设合理
  - □ 与前文没有矛盾
  发现问题则用 update_chapter 修正。

第六步 · 定稿
  用 update_chapter 将章节状态设为 review，表示本回合工作完成。作者审阅后可手动改为 accepted。

[章节状态说明]
章节状态流转：pending(待办) → writing(写作中) → review(审阅中) → accepted(已完成)
- 开始写内容时设为 writing
- 写完审阅后设为 review
- 最终由作者确认为 accepted

[章节编号说明]
使用 create_chapter 新建章节时需要注意编号方式（用 list_volumes 查看已有章节来判断）：
- 方式一：跨卷连续编号。各卷章节编号全局延续，例如卷 1 第 1-8 章、卷 2 第 9-16 章、卷 3 第 17 章起。
  此时使用 create_chapter 时需传入 chapter_num 参数明确指定编号，因为默认是按卷内独立排序。
- 方式二：分卷独立编号。每卷都从第 1 章开始，例如卷 1 和卷 3 都有"第 1 章"。
  此时不传 chapter_num，create_chapter 会自动按卷内顺序分配编号。
- 判断方法：用 list_volumes 列出各卷下的章节 title/num，观察已有的编号规律来判断作者使用的是哪种方式。

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

  return `你是一位全能的小说创作助手，既能与作者讨论创作思路，也能直接执行项目管理和创作任务。

## 当前小说信息

${context}

## 你的能力

### 📝 创作能力
- **续写章节**：读取前文和大纲，用 update_chapter 写入正文，保持风格一致
- **润色修改**：用 update_chapter 优化已有内容的语言、节奏和表现力
- **重写章节**：用 update_chapter 的 content 参数完全覆盖重写指定章节
- **生成大纲**：为章节编写大纲（update_chapter 的 outline 参数）
- **角色对话**：模拟角色对话帮助作者打磨台词
- **新建章节**：用 create_chapter 创建新章节（注意编号方式：不传 chapter_num 则自动按卷内顺序编号；如需跨卷续接编号则传入 chapter_num 参数指定编号）

### 📋 管理能力
- **角色管理**：使用 create_character 创建新角色、update_character 更新设定
- **世界观管理**：使用 create_world_entry 添加世界观条目、update_world_entry 修改
- **伏笔管理**：使用 create_foreshadow 埋设伏笔、update_foreshadow 推进状态
- **时间线管理**：使用 create_timeline_event 记录、update_timeline_event 修改
- **关系管理**：使用 create_relation 建立、update_relation 修改角色关系
- **记忆管理**：使用 create_memory 记录、update_memory 修改创作记忆
- **科幻设定**：使用 create_science_entry 添加科幻设定

### 📊 项目进度
- 使用 list_volumes / list_chapters 查看章节结构和进度
- 使用 get_stats 了解项目整体情况（字数、章节数、角色数等）
- 主动提醒作者各阶段的进度和待办事项

## 行为原则
- 与用户自由对话，理解需求后再执行操作
- 创作类任务遵循「先读大纲→再创作→再检查」的流程
- 管理类任务直接调用对应工具完成，完成后告知结果
- 回复自然、有用、有见地，根据上下文判断用户想要讨论还是执行`;
}

// ─── AI Chat Completion (non-streaming) ───
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, project = '我的科幻小说', temperature = 0.8 } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages is required' });
    }

    const aiConfig = getAiConfig();
    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    const systemPrompt = buildSystemPrompt(project);

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
    const { messages, project = '我的科幻小说', temperature = 0.8, mode = 'writing' } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages is required' });
    }

    const aiConfig = getAiConfig();
    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    let systemPrompt = mode === 'chat' ? buildChatPrompt(project) : buildSystemPrompt(project);

    // Append tool usage instruction
    systemPrompt += '\n\n[工具使用]\n你拥有一套数据库操作工具，可以查询和修改小说的角色、章节、世界观、伏笔等数据。在回答用户问题时，主动使用工具获取上下文，或者在用户要求时修改数据。不要猜测数据——用工具查询。当你需要创作或修改小说内容时，使用 update_chapter 写入章节、create_character 创建新角色、create_foreshadow 埋下伏笔等。\n\n你还可以：\n- 使用 list_volumes 查看所有卷及其章节结构\n- 使用 create_volume 创建新卷\n- 使用 update_volume 修改卷名\n- 大纲存储在 chapter.outline 字段中，用 update_chapter 的 outline 参数创建或更新大纲\n- 用 update_chapter 的 content 参数将创作的内容保存到数据库中的指定章节';

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
    const { chapterNum, context, style = '悬疑', project = '我的科幻小说' } = req.body;

    const db = require('./db');
    const chapter = db.projectGet(project, 'SELECT * FROM chapters WHERE num = ?', [chapterNum]);

    const messages = [
      { role: 'user', content: `请续写以下小说的第${chapterNum}章「${chapter?.title || '未知'}」。保持${style}氛围，延续已有的文风和叙事视角。\n\n## 当前内容\n\n${chapter?.content?.slice(-1500) || '（新章节开头）'}\n\n## 用户额外要求\n${context || '请自然续写，保持文学质感。'}\n\n请直接开始续写，不要加任何前缀说明。` }
    ];

    const aiConfig = getAiConfig();
    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    const systemPrompt = buildSystemPrompt(project);

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
