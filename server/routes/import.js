const express = require('express');
const fs = require('fs');
const db = require('../db');
const { createAIAdapter } = require('../ai-adapter');
const { getAiConfig } = require('../ai-config');
const { IMPORT_ANALYSIS_SYSTEM_PROMPT } = require('../prompts/import');
const { chapterHeading, volumeHeading } = require('../titles');
const { executeTool } = require('../tools');

const router = express.Router();

const MAX_CHAPTERS = 5000;
const MAX_TEXT_LENGTH = 20_000_000; // ~20M chars

function sanitizeTitle(value, fallback) {
  const text = typeof value === 'string' ? value.trim().slice(0, 200) : '';
  return text || fallback;
}

function stripHtml(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}

// POST /api/projects/import — create a project and fill it with imported volumes/chapters.
router.post('/projects/import', (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nameError = db.validateProjectName(name);
  if (nameError) {
    return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: nameError, recoverable: true } });
  }

  const mode = body.mode || 'medium-novel';
  const language = body.language || 'zh';
  const genres = Array.isArray(body.genres) && body.genres.length > 0 ? body.genres : ['other'];
  const source = body.source || {};
  const format = source.format === 'epub' ? 'epub' : 'txt';

  // Normalize and validate volumes/chapters before touching the filesystem.
  const rawVolumes = Array.isArray(body.volumes) ? body.volumes : [];
  const volumes = [];
  let totalChapters = 0;
  let totalChars = 0;
  for (let vi = 0; vi < rawVolumes.length; vi++) {
    const rv = rawVolumes[vi] || {};
    const chapters = [];
    const rawChapters = Array.isArray(rv.chapters) ? rv.chapters : [];
    for (const rc of rawChapters) {
      const title = sanitizeTitle(rc && rc.title, `第${totalChapters + 1}章`);
      const content = typeof (rc && rc.content) === 'string' ? rc.content : '';
      if (!content.trim()) continue; // drop empty chapters
      totalChars += content.length;
      if (totalChars > MAX_TEXT_LENGTH) {
        return res.status(400).json({
          error: { code: 'FILE_TOO_LARGE', message: '正文内容过大，请拆分后分项目导入', recoverable: true },
        });
      }
      chapters.push({ title, content });
      totalChapters += 1;
    }
    if (chapters.length === 0) continue;
    volumes.push({
      title: sanitizeTitle(rv.title, `第${volumes.length + 1}卷`),
      chapters,
    });
    if (totalChapters > MAX_CHAPTERS) {
      return res.status(400).json({
        error: { code: 'TOO_MANY_CHAPTERS', message: `章节数超过上限（${MAX_CHAPTERS} 章）`, recoverable: true },
      });
    }
  }

  if (volumes.length === 0 || totalChapters === 0) {
    return res.status(400).json({
      error: { code: 'EMPTY_IMPORT', message: '没有解析到可导入的正文', recoverable: true },
    });
  }

  if (db.dbGet('SELECT 1 AS x FROM recent_projects WHERE name = ?', [name])) {
    return res.status(409).json({
      error: { code: 'PROJECT_ALREADY_EXISTS', message: `项目"${name}"已存在`, recoverable: true },
    });
  }
  const filePath = db.newProjectFilePath();

  const now = new Date().toISOString();
  const description = stripHtml(source.description);
  const author = sanitizeTitle(source.author, '佚名');
  const bookTitle = sanitizeTitle(source.title, name);

  try {
    // Create the project database and metadata.
    const pdb = db.openProjectDb(filePath);
    db.registerRecentProject(name, filePath);
    db.initProjectMeta(name, {
      description,
      mode,
      language,
      author_name: author,
      workflow_phase: 'writing',
      book_title: bookTitle,
      import_source_file: sanitizeTitle(source.fileName, ''),
      import_source_format: format,
      import_source_title: bookTitle,
      import_volume_count: String(volumes.length),
      import_chapter_count: String(totalChapters),
      imported_at: now,
      ai_analysis_status: 'none',
    });
    db.initProjectGenres(name, genres);

    // Insert volumes + chapters atomically. Chapter numbers are global (1..N)
    // so the num-only chapter APIs remain unambiguous across volumes.
    let chapterNum = 0;
    let wordCount = 0;
    db.projectTransaction(name, () => {
      const insertVolume = pdb.prepare(
        'INSERT INTO volumes (id, sort_order, title, summary, created_at) VALUES (?, ?, ?, \'\', datetime(\'now\'))',
      );
      const insertChapter = pdb.prepare(
        `INSERT INTO chapters
          (volume_id, num, title, content, word_count, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'accepted', datetime('now'), datetime('now'))`,
      );
      const setMeta = pdb.prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)');

      volumes.forEach((volume, index) => {
        const volumeId = index + 1;
        insertVolume.run(volumeId, index + 1, volume.title);
        for (const chapter of volume.chapters) {
          chapterNum += 1;
          const chapterWordCount = db.countWords(chapter.content);
          wordCount += chapterWordCount;
          insertChapter.run(volumeId, chapterNum, chapter.title, chapter.content, chapterWordCount);
        }
      });

      setMeta.run('import_chapter_count', String(chapterNum));
    });
    db.recalculateWordCount(name);

    // Register in the global recent projects list.
    db.registerRecentProject(name, filePath, wordCount);

    return res.status(201).json({ name, volumes: volumes.length, chapters: chapterNum, wordCount });
  } catch (err) {
    // Best-effort cleanup so a failed import does not leave a half-created project.
    try {
      db.closeProjectDb(filePath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    try {
      db.dbExecute('DELETE FROM recent_projects WHERE name = ?', [name]);
    } catch {
      /* ignore */
    }
    console.error('[Import] Failed:', err);
    return res.status(500).json({
      error: { code: 'IMPORT_FAILED', message: err.message || '导入失败', recoverable: true },
    });
  }
});

/* ─── Analyse an imported work (optional post-import step) ─── */

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

router.post('/ai/analyze-import', async (req, res) => {
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
  const volumes = db.projectQuery(project, 'SELECT id, title, sort_order FROM volumes ORDER BY sort_order LIMIT 6');

  const seen = new Set();
  const parts = [];
  for (const ch of firstChapters) {
    seen.add(ch.num);
    parts.push(`【${chapterHeading(ch)}】\n${String(ch.content).slice(0, 2500)}`);
  }
  for (const vol of volumes) {
    const ch = db.projectGet(
      project,
      "SELECT num, title, content FROM chapters WHERE volume_id = ? AND content != '' ORDER BY num LIMIT 1",
      [vol.id],
    );
    if (ch && !seen.has(ch.num)) {
      seen.add(ch.num);
      parts.push(`【${volumeHeading(vol)} 开篇 · ${chapterHeading(ch)}】\n${String(ch.content).slice(0, 800)}`);
    }
  }
  for (const ch of lastChapters) {
    if (seen.has(ch.num)) continue;
    seen.add(ch.num);
    parts.push(`【${chapterHeading(ch)}（结尾）】\n${String(ch.content).slice(-2500)}`);
  }

  const titles = db.projectQuery(project, 'SELECT num, title FROM chapters ORDER BY num LIMIT 200');
  const titleList = titles.map(chapterHeading).join('\n');
  const titleNote =
    totalChapters > titles.length ? `（共 ${totalChapters} 章，以下仅前 ${titles.length} 章）` : `（共 ${totalChapters} 章）`;
  const sample = `<book_content>\n章节列表${titleNote}：\n${titleList}\n\n正文采样：\n${parts.join('\n\n')}\n</book_content>`;

  const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);

  let inputTokens = 0;
  let outputTokens = 0;
  let parsed = null;
  let lastError = null;

  try {
    const messages = [{ role: 'user', content: sample }];
    // Retry once with an explicit correction message when the model returns
    // something other than a JSON object.
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const result = await withTimeout(
        adapter.complete(IMPORT_ANALYSIS_SYSTEM_PROMPT, messages, null, attempt === 0 ? 0.3 : 0.2),
        120000,
        'AI 分析超时',
      );
      inputTokens += result.usage?.inputTokens || 0;
      outputTokens += result.usage?.outputTokens || 0;
      parsed = extractJsonObject(result.content);
      if (!parsed) {
        messages.push(
          { role: 'assistant', content: result.content || '' },
          { role: 'user', content: '你上面的输出不是合法 JSON。请重新输出，只输出 JSON 对象，不要代码块或解释。' },
        );
      }
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
      const findCharacter = pdb.prepare('SELECT id FROM characters WHERE name = ? LIMIT 1');
      for (const ch of characters) {
        const name = typeof ch?.name === 'string' ? ch.name.trim().slice(0, 100) : '';
        if (!name || findCharacter.get(name)) continue;
        executeTool(project, 'create_character', {
          name,
          age: String(ch.age || '未知').slice(0, 50),
          gender: String(ch.gender || '未知').slice(0, 20),
          personality: String(ch.personality || '').slice(0, 500),
          background: String(ch.background || '').slice(0, 1000),
          motivation: String(ch.motivation || '').slice(0, 500),
          arc: String(ch.arc || '').slice(0, 500),
        });
        insertedCharacters += 1;
      }

      const findWorld = pdb.prepare('SELECT id FROM world_entries WHERE name = ? LIMIT 1');
      for (const entry of world) {
        const name = typeof entry?.name === 'string' ? entry.name.trim().slice(0, 100) : '';
        if (!name || findWorld.get(name)) continue;
        executeTool(project, 'create_world_entry', {
          category: allowedCategories.has(entry.category) ? entry.category : 'concept',
          name,
          description: String(entry.description || '').slice(0, 1000),
          tags: '[]',
        });
        insertedWorld += 1;
      }

      if (synopsis) {
        executeTool(project, 'create_memory', { category: 'other', content: `【原著梗概】${synopsis}` });
      }

      const setMetaStmt = pdb.prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)');
      if (synopsis) {
        setMetaStmt.run('ai_synopsis', synopsis);
        if (!existingDescription) setMetaStmt.run('description', synopsis);
      }
      setMetaStmt.run('ai_analysis_status', 'done');
    });

    db.recordTokenUsage(project, 'import_analysis', { inputTokens, outputTokens }, aiConfig.apiModel);

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

module.exports = router;
