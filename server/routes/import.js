const express = require('express');
const fs = require('fs');
const db = require('../db');

const router = express.Router();

const MAX_CHAPTERS = 5000;
const MAX_TEXT_LENGTH = 20_000_000; // ~20M chars
const INVALID_NAME_RE = /[\\/:*?"<>|\u0000-\u001f]/;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

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

function validateName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return '项目名称不能为空';
  if (trimmed.length > 80) return '项目名称不能超过 80 个字符';
  if (trimmed === '.' || trimmed === '..') return '项目名称不合法';
  if (trimmed.startsWith('.')) return '项目名称不能以点开头';
  if (INVALID_NAME_RE.test(trimmed)) return '项目名称不能包含 \\ / : * ? " < > | 等字符';
  if (WINDOWS_RESERVED_RE.test(trimmed)) return '项目名称不能使用系统保留名';
  return null;
}

// POST /api/projects/import — create a project and fill it with imported volumes/chapters.
router.post('/projects/import', (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nameError = validateName(name);
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

  const filePath = db.getProjectDbPath(name);
  if (fs.existsSync(filePath)) {
    return res.status(409).json({
      error: { code: 'PROJECT_ALREADY_EXISTS', message: `项目"${name}"已存在`, recoverable: true },
    });
  }

  const now = new Date().toISOString();
  const description = stripHtml(source.description);
  const author = sanitizeTitle(source.author, '佚名');
  const bookTitle = sanitizeTitle(source.title, name);

  try {
    // Create the project database and metadata.
    const pdb = db.openProjectDb(filePath);
    const metaInsert = pdb.prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)');
    const meta = {
      name,
      description,
      mode,
      language,
      version: '1',
      created_at: now,
      updated_at: now,
      word_count: '0',
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
    };
    for (const [key, value] of Object.entries(meta)) metaInsert.run(key, value);

    for (const genre of genres) {
      pdb.prepare('INSERT OR IGNORE INTO project_genres (genre) VALUES (?)').run(genre);
    }

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
          const chapterWordCount = chapter.content.replace(/\s/g, '').length;
          wordCount += chapterWordCount;
          insertChapter.run(volumeId, chapterNum, chapter.title, chapter.content, chapterWordCount);
        }
      });

      setMeta.run('word_count', String(wordCount));
      setMeta.run('updated_at', new Date().toISOString());
      setMeta.run('import_chapter_count', String(chapterNum));
    });

    // Register in the global recent projects list.
    db.dbExecute(
      'INSERT OR REPLACE INTO recent_projects (id, name, file_path, last_opened, word_count) VALUES (?, ?, ?, ?, ?)',
      [name, name, filePath, new Date().toISOString(), wordCount],
    );

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

module.exports = router;
