const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { saveAuthorNotes } = require('../author-notes');
const { ALLOWED_GENRES, normalizeGenre } = require('../genres');
const { ALLOWED_STYLES } = require('../styles');
const { normalizeLanguageCode } = require('../languages');
const { chapterHeading, volumeHeading, stripLeadingChapterHeading } = require('../titles');

function project(name) {
  // Ensure project DB is accessible
  try { db.getProjectDb(name); } catch(e) { /* will be created on first use */ }
  return name;
}

// ─── Shared helpers ───
function updateRecord(projectName, table, id, body, allowedFields, addUpdatedAt) {
  const fields = []; const params = [];
  const data = body || {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(data[key]); }
  }
  if (fields.length === 0) return null;
  if (addUpdatedAt) fields.push("updated_at = datetime('now')");
  params.push(id);
  const changes = db.projectExecute(projectName, `UPDATE ${table} SET ${fields.join(', ')} WHERE id = ?`, params);
  return changes;
}

// ═══════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════

router.get('/projects', (req, res) => {
  const rows = db.dbQuery('SELECT * FROM recent_projects ORDER BY last_opened DESC');
  const projects = rows
    .map((r) => {
      try {
        // Never recreate a registered project whose file was removed externally.
        // A freshly created project may still be only in memory.
        if (!fs.existsSync(r.file_path) && !db.isProjectOpen(r.file_path)) return null;
        const db2 = db.openProjectDb(r.file_path);
        const meta = {};
        db2.prepare('SELECT key, value FROM project_meta').all().forEach(m => meta[m.key] = m.value);
        const chCount = db2.prepare('SELECT COUNT(*) as c FROM chapters').get().c;
        const genres = db2.prepare('SELECT genre FROM project_genres').all().map(g => g.genre);
        const styles = db2.prepare('SELECT style FROM project_styles').all().map(s => s.style);
        const wordCount = parseInt(meta.word_count || '0');
        // Older projects predate the analytics id; assign one lazily so every
        // project can be followed across days without using its name.
        let analyticsId = meta.analytics_id;
        if (!analyticsId) {
          analyticsId = randomUUID();
          db2.prepare("INSERT OR REPLACE INTO project_meta (key, value) VALUES ('analytics_id', ?)").run(analyticsId);
        }
        const iconMap = { 'sci-fi': 'Rocket', 'fantasy': 'Wand', 'xianxia': 'Mountain', 'wuxia': 'Swords', 'romance': 'Heart', 'history': 'Landmark', 'urban': 'Building', 'mystery': 'Fingerprint', 'game': 'Gamepad2', 'biography': 'BookOpen', 'other': 'Scroll' };
        // A project can carry several genres; the icon shows the first one.
        const iconName = iconMap[genres[0]] || 'BookOpen';
        return {
          id: r.id, name: r.name, iconName,
          genres,
          styles,
          powerFantasy: styles.includes('power-fantasy'),
          wordCount, chapterCount: chCount, lastOpened: r.last_opened,
          mode: meta.mode || 'medium-novel',
          analyticsId,
          createdAt: meta.created_at || null,
          status: wordCount > 30000 ? 'writing' : wordCount > 5000 ? 'inProgress' : 'new',
        };
      } catch (e) {
        return {
          id: r.id,
          name: r.name,
          iconName: 'BookOpen',
          genres: [],
          styles: [],
          wordCount: r.word_count || 0,
          chapterCount: 0,
          lastOpened: r.last_opened,
          mode: 'medium-novel',
          status: e?.code === 'PROJECT_SCHEMA_TOO_NEW' ? 'incompatible' : 'unknown',
          analyticsId: null,
          createdAt: null,
          incompatible: e?.code === 'PROJECT_SCHEMA_TOO_NEW',
        };
      }
    })
    .filter(Boolean);
  res.json(projects);
});

router.post('/projects', (req, res) => {
  const {
    name,
    mode = 'medium-novel',
    language = 'zh',
    genres: rawGenres = ['other'],
    styles: rawStyles = [],
    powerFantasy,
  } = req.body || {};
  const genreList = Array.isArray(rawGenres) ? rawGenres : ['other'];
  // Store canonical slugs only; legacy clients may still send labels.
  const genres = [...new Set(genreList.map(normalizeGenre).filter((genre) => ALLOWED_GENRES.has(genre)))];
  const styles = [...new Set((Array.isArray(rawStyles) ? rawStyles : []).filter((style) => ALLOWED_STYLES.has(style)))];
  // 爽文 is a writing style now; accept the legacy genre/flag values.
  const wantsPowerFantasy = powerFantasy === true
    || genreList.includes('power-fantasy')
    || genreList.some((genre) => normalizeGenre(genre) === 'power-fantasy');
  if (wantsPowerFantasy && !styles.includes('power-fantasy')) {
    styles.push('power-fantasy');
  }
  const writingLanguage = normalizeLanguageCode(language);
  const nameError = db.validateProjectName(name);
  if (nameError) {
    return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: nameError, recoverable: true } });
  }

  if (db.dbGet('SELECT 1 AS x FROM recent_projects WHERE name = ?', [name])) {
    return res.status(409).json({ error: { code: 'PROJECT_ALREADY_EXISTS', message: `项目"${name}"已存在`, recoverable: true } });
  }

  const filePath = db.newProjectFilePath();

  let pdb;
  try {
    pdb = db.openProjectDb(filePath);
    db.registerRecentProject(name, filePath);
    db.initProjectMeta(name, {
      mode,
      language: writingLanguage,
      power_fantasy: styles.includes('power-fantasy') ? '1' : '0',
    });
    db.initProjectGenres(name, genres);
    db.initProjectStyles(name, styles);

    // Default volume
    pdb.prepare("INSERT INTO volumes (id, sort_order, title, summary) VALUES (1, 1, '第一卷', '')").run();
    // Fail the request now if the chosen location is not writable, instead of
    // returning success and losing the project on exit.
    pdb.flush();
  } catch (err) {
    if (pdb) {
      db.closeProjectDb(filePath);
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      db.dbExecute('DELETE FROM recent_projects WHERE name = ?', [name]);
    }
    throw err;
  }

  const analyticsId = pdb.prepare("SELECT value FROM project_meta WHERE key = 'analytics_id'").get()?.value || null;
  res.json({
    name,
    mode,
    language: writingLanguage,
    genres,
    styles,
    analyticsId,
  });
});

router.get('/projects/:name', (req, res) => {
  const { name } = req.params;
  let pdb;
  try {
    pdb = db.getProjectDb(name);
  } catch {
    return res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `项目"${name}"不存在`, recoverable: true } });
  }
  const meta = {};
  pdb.prepare('SELECT key, value FROM project_meta').all().forEach(m => meta[m.key] = m.value);
  const genres = pdb.prepare('SELECT genre FROM project_genres').all().map(g => g.genre);
  const styles = pdb.prepare('SELECT style FROM project_styles').all().map(s => s.style);
  res.json({ ...meta, genres, styles });
});

router.delete('/projects/:name', (req, res) => {
  const { name } = req.params;
  let filePath;
  try {
    filePath = db.getProjectDbPath(name);
  } catch {
    return res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `项目"${name}"不存在`, recoverable: true } });
  }

  // Flush/close first so a pending editor write is not lost.
  db.closeProjectDb(filePath);

  // Only delete files the app manages. A project registered at an external
  // path by an older build is merely removed from the recent list, so the
  // user's file is never deleted without an explicit choice.
  if (db.isManagedProjectPath(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Keep the registry row: the user must not be told the file is gone.
        return res.status(500).json({
          error: { code: 'PROJECT_DELETE_FAILED', message: `删除项目文件失败：${err.message}`, recoverable: true },
        });
      }
    }
  }

  db.dbExecute('DELETE FROM recent_projects WHERE name = ?', [name]);
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// CHAPTERS
// ═══════════════════════════════════════════

// Chapter metadata without the body — structure views and validators only need
// these fields, and imported books can hold tens of megabytes of content.
const SLIM_CHAPTER_COLS =
  'c.id, c.volume_id, c.num, c.title, c.outline, c.summary, c.word_count, c.status, c.cognitive_frame, c.emotional_anchor, c.world_texture, c.concrete_mystery, c.interpersonal_tension, c.genre_beat, c.created_at, c.updated_at';

router.get('/:project/chapters', (req, res) => {
  const slim = req.query.slim === '1' || req.query.slim === 'true';
  const cols = slim ? SLIM_CHAPTER_COLS : 'c.*';
  const rows = db.projectQuery(project(req.params.project),
    `SELECT ${cols}, v.title as volume_title FROM chapters c JOIN volumes v ON c.volume_id = v.id ORDER BY c.num`
  );
  res.json(rows);
});

router.get('/:project/chapters/:num', (req, res) => {
  const volId = req.query.volume_id ? parseInt(req.query.volume_id) : null;
  const sql = volId
    ? 'SELECT c.*, v.title as volume_title FROM chapters c JOIN volumes v ON c.volume_id = v.id WHERE c.num = ? AND c.volume_id = ?'
    : 'SELECT c.*, v.title as volume_title FROM chapters c JOIN volumes v ON c.volume_id = v.id WHERE c.num = ?';
  const params = volId ? [parseInt(req.params.num), volId] : [parseInt(req.params.num)];
  const row = db.projectGet(project(req.params.project), sql, params);
  if (!row) return res.status(404).json({ error: { code: 'DB_NOT_FOUND', message: `章节 ${req.params.num} 不存在`, recoverable: true } });

  // Callers that only need a preview (e.g. outline generation) can avoid
  // shipping a multi-megabyte imported chapter over the wire.
  const preview = Math.min(parseInt(req.query.preview, 10) || 0, 10000);
  if (preview > 0 && typeof row.content === 'string') row.content = row.content.slice(0, preview);

  res.json(row);
});

router.put('/:project/chapters/:num', (req, res) => {
  const { num } = req.params;
  const { title, content, outline, status, cognitive_frame, emotional_anchor, world_texture, concrete_mystery, interpersonal_tension, genre_beat } = req.body || {};
  const fields = [];
  const params = [];
  if (title !== undefined) { fields.push('title = ?'); params.push(title); }
  if (content !== undefined) {
    // Drop a heading that repeats the chapter title — the UI renders the title
    // separately, so keeping it in the body would show it twice.
    const row = db.projectGet(project(req.params.project), 'SELECT title FROM chapters WHERE num = ?', [parseInt(num)]);
    const cleanContent = stripLeadingChapterHeading(content, {
      title: title !== undefined ? title : row?.title || '',
    });
    fields.push('content = ?');
    params.push(cleanContent);
    // Update word count for Chinese text
    const wc = db.countWords(cleanContent);
    fields.push('word_count = ?');
    params.push(wc);
  }
  if (outline !== undefined) { fields.push('outline = ?'); params.push(outline); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }
  if (cognitive_frame !== undefined) { fields.push('cognitive_frame = ?'); params.push(cognitive_frame); }
  if (emotional_anchor !== undefined) { fields.push('emotional_anchor = ?'); params.push(emotional_anchor); }
  if (world_texture !== undefined) { fields.push('world_texture = ?'); params.push(world_texture); }
  if (concrete_mystery !== undefined) { fields.push('concrete_mystery = ?'); params.push(concrete_mystery); }
  if (interpersonal_tension !== undefined) { fields.push('interpersonal_tension = ?'); params.push(interpersonal_tension); }
  if (genre_beat !== undefined) { fields.push('genre_beat = ?'); params.push(genre_beat); }

  fields.push("updated_at = datetime('now')");
  params.push(parseInt(num));

  const sql = `UPDATE chapters SET ${fields.join(', ')} WHERE num = ?`;
  const changes = db.projectExecute(project(req.params.project), sql, params);
  if (changes === 0) {
    return res.status(404).json({ error: { message: `章节 ${num} 不存在，可能已被删除` } });
  }
  db.recalculateWordCount(project(req.params.project));

  const updated = db.projectGet(project(req.params.project),
    'SELECT * FROM chapters WHERE num = ?', [parseInt(num)]
  );
  res.json(updated);
});

router.post('/:project/chapters', (req, res) => {
  const pn = project(req.params.project);
  const { title, outline = '', status = 'pending', chapter_num } = req.body || {};

  // A chapter without a volume is exactly the bug that filed new chapters
  // under the book's last volume. Require the caller to be explicit.
  const volumeId = req.body?.volume_id;
  if (volumeId === undefined || volumeId === null) {
    return res.status(400).json({
      error: { code: 'INVALID_PARAMS', message: '创建章节必须指定 volume_id', recoverable: true },
    });
  }
  if (!db.projectGet(pn, 'SELECT id FROM volumes WHERE id = ?', [volumeId])) {
    return res.status(400).json({
      error: { code: 'INVALID_PARAMS', message: `卷 ${volumeId} 不存在`, recoverable: true },
    });
  }

  // Global numbering keeps chapter numbers unique across volumes, which the
  // num-only GET/PUT/DELETE chapter endpoints rely on.
  const num = chapter_num !== undefined ? chapter_num : db.nextChapterNumber(pn);
  db.projectExecute(pn,
    'INSERT INTO chapters (volume_id, num, title, outline, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
    [volumeId, num, title, outline, status]
  );
  const created = db.projectGet(pn, 'SELECT * FROM chapters WHERE num = ?', [num]);
  res.status(201).json(created);
});

router.delete('/:project/chapters/:num', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM chapters WHERE num = ?', [parseInt(req.params.num)]);
  if (changes === 0) return res.status(404).json({ error: { message: `章节 ${req.params.num} 不存在` } });
  db.recalculateWordCount(project(req.params.project));
  res.json({ success: true, deleted_num: parseInt(req.params.num) });
});

router.get('/:project/volumes', (req, res) => {
  const pn = project(req.params.project);
  const slim = req.query.slim === '1' || req.query.slim === 'true';
  const rows = db.projectQuery(pn, 'SELECT * FROM volumes ORDER BY sort_order');
  const byVolume = new Map(rows.map((v) => [v.id, []]));
  const chapters = db.projectQuery(
    pn,
    `SELECT ${slim ? SLIM_CHAPTER_COLS : '*'} FROM chapters c ORDER BY num`,
  );
  for (const ch of chapters) {
    if (!byVolume.has(ch.volume_id)) byVolume.set(ch.volume_id, []);
    byVolume.get(ch.volume_id).push(ch);
  }
  for (const v of rows) v.chapters = byVolume.get(v.id) || [];
  res.json(rows);
});

router.post('/:project/volumes', (req, res) => {
  const { title, summary = '' } = req.body || {};
  const pdb = db.getProjectDb(project(req.params.project));
  const max = pdb.prepare('SELECT COALESCE(MAX(sort_order), 0) as mx FROM volumes').get();
  const sortOrder = (max?.mx || 0) + 1;
  const result = pdb.prepare("INSERT INTO volumes (sort_order, title, summary, created_at) VALUES (?, ?, ?, datetime('now'))").run(sortOrder, title, summary);
  res.status(201).json({ id: result.lastInsertRowid, title });
});

router.put('/:project/volumes/:id', (req, res) => {
  const changes = updateRecord(project(req.params.project), 'volumes', req.params.id, req.body, ['title', 'summary'], false);
  if (changes === null) return res.status(400).json({ error: { message: '没有要更新的字段' } });
  if (changes === 0) return res.status(404).json({ error: { message: '卷不存在' } });
  res.json({ success: true });
});

router.delete('/:project/volumes/:id', (req, res) => {
  const { id } = req.params;
  db.projectExecute(project(req.params.project), 'DELETE FROM chapters WHERE volume_id = ?', [id]);
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM volumes WHERE id = ?', [id]);
  if (changes === 0) return res.status(404).json({ error: { message: '卷不存在' } });
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// CHARACTERS
// ═══════════════════════════════════════════

const CHARACTER_ROLES = ['', 'major', 'minor', 'extra'];

router.get('/:project/characters', (req, res) => {
  const chars = db.projectQuery(
    project(req.params.project),
    `SELECT c.*, COUNT(cc.character_id) as chapterCount
     FROM characters c
     LEFT JOIN chapter_characters cc ON cc.character_id = c.id
     GROUP BY c.id
     ORDER BY c.name`,
  );
  res.json(chars);
});

router.get('/:project/characters/:id', (req, res) => {
  const row = db.projectGet(project(req.params.project), 'SELECT * FROM characters WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: { code: 'DB_NOT_FOUND', message: '角色不存在', recoverable: true } });
  res.json(row);
});

router.post('/:project/characters', (req, res) => {
  const {
    name,
    age = '',
    gender = '',
    species = '',
    appearance = '',
    personality = '',
    background = '',
    motivation = '',
    arc = '',
    notes = '',
    role = '',
    ext_markers = '',
  } = req.body || {};
  if (!name) return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '角色名不能为空', recoverable: true } });
  if (!CHARACTER_ROLES.includes(role)) {
    return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '无效的角色定位', recoverable: true } });
  }
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO characters (id, name, age, gender, species, appearance, personality, background, motivation, arc, notes, role, ext_markers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, age, gender, species, appearance, personality, background, motivation, arc, notes, role, ext_markers]
  );
  res.status(201).json({ id, name });
});

router.put('/:project/characters/:id', (req, res) => {
  const { id } = req.params;
  if (req.body.role !== undefined && !CHARACTER_ROLES.includes(req.body.role)) {
    return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '无效的角色定位', recoverable: true } });
  }
  const fields = []; const params = [];
  for (const key of ['name', 'age', 'gender', 'species', 'appearance', 'personality', 'background', 'motivation', 'arc', 'ext_markers', 'notes', 'role']) {
    if (req.body[key] !== undefined) { fields.push(`${key} = ?`); params.push(req.body[key]); }
  }
  if (fields.length === 0) return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '没有要更新的字段', recoverable: true } });
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.projectExecute(project(req.params.project), `UPDATE characters SET ${fields.join(', ')} WHERE id = ?`, params);
  res.json({ success: true });
});

router.delete('/:project/characters/:id', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM characters WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: { message: '角色不存在' } });
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// WORLD ENTRIES
// ═══════════════════════════════════════════

router.get('/:project/world', (req, res) => {
  const rows = db.projectQuery(project(req.params.project), 'SELECT * FROM world_entries ORDER BY category, name');
  res.json(rows);
});

router.post('/:project/world', (req, res) => {
  const { category, name, description = '', tags = '[]' } = req.body || {};
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO world_entries (id, category, name, description, tags) VALUES (?, ?, ?, ?, ?)',
    [id, category, name, description, tags]
  );
  res.status(201).json({ id, name });
});

router.put('/:project/world/:id', (req, res) => {
  const changes = updateRecord(project(req.params.project), 'world_entries', req.params.id, req.body, ['category', 'name', 'description', 'tags'], true);
  if (changes === null) return res.status(400).json({ error: { message: '没有要更新的字段' } });
  if (changes === 0) return res.status(404).json({ error: { message: '条目不存在' } });
  res.json({ success: true });
});

router.delete('/:project/world/:id', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM world_entries WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: { message: '条目不存在' } });
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// SCIENCE ENTRIES
// ═══════════════════════════════════════════

router.get('/:project/science', (req, res) => {
  const rows = db.projectQuery(
    project(req.params.project),
    'SELECT * FROM science_entries ORDER BY sort_order, category, label, name',
  );
  res.json(rows);
});

// Categories are either a built-in preset key or a user-defined name, so the
// API only trims and length-limits them instead of rejecting unknown values.
function normalizeScienceCategory(value) {
  return typeof value === 'string' ? value.trim().slice(0, 40) : '';
}

router.post('/:project/science', (req, res) => {
  const { label = 'known', name, description = '', references = '', category = '', sort_order = 0 } = req.body || {};
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    `INSERT INTO science_entries (id, label, name, description, "references", category, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      label,
      name,
      description,
      references,
      normalizeScienceCategory(category),
      Number(sort_order) || 0,
    ]
  );
  res.status(201).json({ id, name });
});

router.put('/:project/science/:id', (req, res) => {
  const body = { ...(req.body || {}) };
  if (body.category !== undefined) body.category = normalizeScienceCategory(body.category);
  if (body.sort_order !== undefined) body.sort_order = Number(body.sort_order) || 0;
  const changes = updateRecord(
    project(req.params.project),
    'science_entries',
    req.params.id,
    body,
    ['label', 'name', 'description', 'references', 'category', 'sort_order'],
    true,
  );
  if (changes === null) return res.status(400).json({ error: { message: '没有要更新的字段' } });
  if (changes === 0) return res.status(404).json({ error: { message: '条目不存在' } });
  res.json({ success: true });
});

router.delete('/:project/science/:id', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM science_entries WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: { message: '条目不存在' } });
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// FORESHADOWS
// ═══════════════════════════════════════════

router.get('/:project/foreshadows', (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM foreshadows';
  const params = [];
  if (status) { sql += ' WHERE status = ?'; params.push(status); }
  sql += ' ORDER BY created_at';
  const rows = db.projectQuery(project(req.params.project), sql, params);
  res.json(rows);
});

router.post('/:project/foreshadows', (req, res) => {
  const { title, description = '', status = 'planted', priority = 'normal', expected_resolve_chapter = 0 } = req.body || {};
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO foreshadows (id, title, description, status, priority, expected_resolve_chapter) VALUES (?, ?, ?, ?, ?, ?)',
    [id, title, description, status, priority, expected_resolve_chapter]
  );
  res.status(201).json({ id, title });
});

router.put('/:project/foreshadows/:id', (req, res) => {
  const changes = updateRecord(
    project(req.params.project),
    'foreshadows',
    req.params.id,
    req.body,
    ['title', 'description', 'status', 'priority', 'expected_resolve_chapter'],
    true,
  );
  if (changes === null) return res.status(400).json({ error: { message: '没有要更新的字段' } });
  if (changes === 0) return res.status(404).json({ error: { message: '伏笔不存在' } });
  res.json({ success: true });
});

router.delete('/:project/foreshadows/:id', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM foreshadows WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: { message: '伏笔不存在' } });
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// PAYOFF POINTS (爽点)
// ═══════════════════════════════════════════

router.get('/:project/payoffs', (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM payoff_points';
  const params = [];
  if (status) { sql += ' WHERE status = ?'; params.push(status); }
  // Order by release chapter so the board reveals the payoff rhythm at a glance.
  sql += ' ORDER BY COALESCE(NULLIF(payoff_chapter, 0), 999999), created_at';
  res.json(db.projectQuery(project(req.params.project), sql, params));
});

const PAYOFF_TYPES = ['face-slap', 'flex', 'comeback', 'reveal', 'reward', 'revenge', 'breakthrough', 'other'];
const PAYOFF_STATUSES = ['planned', 'building', 'released', 'abandoned'];

router.post('/:project/payoffs', (req, res) => {
  const {
    title,
    type = 'other',
    description = '',
    status = 'planned',
    intensity = 3,
    setup_chapter = 0,
    payoff_chapter = 0,
  } = req.body || {};
  if (!title) return res.status(400).json({ error: { message: '爽点标题不能为空' } });
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO payoff_points (id, title, type, description, status, intensity, setup_chapter, payoff_chapter) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      title,
      PAYOFF_TYPES.includes(type) ? type : 'other',
      description,
      PAYOFF_STATUSES.includes(status) ? status : 'planned',
      Math.max(1, Math.min(5, Number(intensity) || 3)),
      setup_chapter || 0,
      payoff_chapter || 0,
    ]
  );
  res.status(201).json({ id, title });
});

router.put('/:project/payoffs/:id', (req, res) => {
  const changes = updateRecord(project(req.params.project), 'payoff_points', req.params.id, req.body, ['title', 'type', 'description', 'status', 'intensity', 'setup_chapter', 'payoff_chapter'], true);
  if (changes === null) return res.status(400).json({ error: { message: '没有要更新的字段' } });
  if (changes === 0) return res.status(404).json({ error: { message: '爽点不存在' } });
  res.json({ success: true });
});

router.delete('/:project/payoffs/:id', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM payoff_points WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: { message: '爽点不存在' } });
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// CLUE BOARD (线索板)
// ═══════════════════════════════════════════

const CLUE_KINDS = ['clue', 'red-herring', 'deduction', 'question'];

function chapterIdByNum(projectName, num) {
  const value = Number(num);
  if (!Number.isFinite(value) || value <= 0) return null;
  return db.projectGet(projectName, 'SELECT id FROM chapters WHERE num = ?', [value])?.id ?? null;
}

router.get('/:project/clues', (req, res) => {
  const { status } = req.query;
  let sql = `SELECT c.*, ch.num AS related_chapter_num
             FROM clue_board c
             LEFT JOIN chapters ch ON ch.id = c.related_chapter_id`;
  if (status === 'unresolved') sql += ' WHERE c.resolved = 0';
  else if (status === 'resolved') sql += ' WHERE c.resolved = 1';
  sql += ' ORDER BY c.resolved, c.created_at DESC';
  res.json(db.projectQuery(project(req.params.project), sql));
});

router.post('/:project/clues', (req, res) => {
  const { title, description = '', kind = 'clue', related_chapter_num, resolved = false } = req.body || {};
  if (!title) return res.status(400).json({ error: { message: '线索标题不能为空' } });
  const id = randomUUID();
  const resolvedFlag = resolved ? 1 : 0;
  db.projectExecute(project(req.params.project),
    `INSERT INTO clue_board (id, title, description, kind, related_chapter_id, resolved, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ${resolvedFlag ? "datetime('now')" : 'NULL'})`,
    [
      id,
      title,
      description,
      CLUE_KINDS.includes(kind) ? kind : 'clue',
      chapterIdByNum(project(req.params.project), related_chapter_num),
      resolvedFlag,
    ]
  );
  res.status(201).json({ id, title });
});

router.put('/:project/clues/:id', (req, res) => {
  const pn = project(req.params.project);
  const { title, description, kind, related_chapter_num, resolved } = req.body || {};
  const fields = [];
  const params = [];
  if (title !== undefined) { fields.push('title = ?'); params.push(title); }
  if (description !== undefined) { fields.push('description = ?'); params.push(description); }
  if (kind !== undefined) { fields.push('kind = ?'); params.push(CLUE_KINDS.includes(kind) ? kind : 'clue'); }
  if (related_chapter_num !== undefined) {
    fields.push('related_chapter_id = ?');
    params.push(chapterIdByNum(pn, related_chapter_num));
  }
  if (resolved !== undefined) {
    fields.push('resolved = ?', resolved ? "resolved_at = datetime('now')" : 'resolved_at = NULL');
    params.push(resolved ? 1 : 0);
  }
  if (fields.length === 0) return res.status(400).json({ error: { message: '没有要更新的字段' } });
  params.push(req.params.id);
  const changes = db.projectExecute(pn, `UPDATE clue_board SET ${fields.join(', ')} WHERE id = ?`, params);
  if (changes === 0) return res.status(404).json({ error: { message: '线索不存在' } });
  res.json({ success: true });
});

router.delete('/:project/clues/:id', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM clue_board WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: { message: '线索不存在' } });
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// CHARACTER RELATIONS
// ═══════════════════════════════════════════

router.get('/:project/relations', (req, res) => {
  const rows = db.projectQuery(project(req.params.project), 'SELECT * FROM character_relations');
  res.json(rows);
});

router.post('/:project/relations', (req, res) => {
  const { character_a_id, character_b_id, relation_type, description = '', intensity = 3 } = req.body || {};
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO character_relations (id, character_a_id, character_b_id, relation_type, description, intensity) VALUES (?, ?, ?, ?, ?, ?)',
    [id, character_a_id, character_b_id, relation_type, description, intensity]
  );
  res.status(201).json({ id });
});

router.put('/:project/relations/:id', (req, res) => {
  const changes = updateRecord(project(req.params.project), 'character_relations', req.params.id, req.body, ['relation_type', 'description', 'intensity'], false);
  if (changes === null) return res.status(400).json({ error: { message: '没有要更新的字段' } });
  if (changes === 0) return res.status(404).json({ error: { message: '关系不存在' } });
  res.json({ success: true });
});

router.delete('/:project/relations/:id', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM character_relations WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: { message: '关系不存在' } });
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// MEMORIES
// ═══════════════════════════════════════════

router.get('/:project/memories', (req, res) => {
  const rows = db.projectQuery(project(req.params.project), 'SELECT * FROM memories ORDER BY created_at DESC');
  res.json(rows);
});

router.post('/:project/memories', (req, res) => {
  const { category, content, source_chapter_id } = req.body || {};
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO memories (id, category, content, source_chapter_id) VALUES (?, ?, ?, ?)',
    [id, category, content, source_chapter_id || null]
  );
  res.status(201).json({ id });
});

router.put('/:project/memories/:id', (req, res) => {
  const changes = updateRecord(project(req.params.project), 'memories', req.params.id, req.body, ['category', 'content'], false);
  if (changes === null) return res.status(400).json({ error: { message: '没有要更新的字段' } });
  if (changes === 0) return res.status(404).json({ error: { message: '记忆不存在' } });
  res.json({ success: true });
});

router.delete('/:project/memories/:id', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM memories WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: { message: '记忆不存在' } });
  res.json({ success: true });
});

// ─── Memory Search ───
router.post('/:project/memories/search', (req, res) => {
  const pn = project(req.params.project);
  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: { message: '缺少搜索关键词' } });
  const rows = db.projectQuery(pn,
    "SELECT * FROM memories WHERE content LIKE ? ORDER BY created_at DESC LIMIT 20",
    [`%${query}%`]
  );
  res.json(rows);
});

// ═══════════════════════════════════════════
// TIMELINE
// ═══════════════════════════════════════════

router.get('/:project/timeline', (req, res) => {
  const rows = db.projectQuery(project(req.params.project), 'SELECT * FROM timeline_events ORDER BY year');
  res.json(rows);
});

router.post('/:project/timeline', (req, res) => {
  const { year, title, description = '', importance = 3 } = req.body || {};
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO timeline_events (id, year, title, description, importance) VALUES (?, ?, ?, ?, ?)',
    [id, year, title, description, importance]
  );
  res.status(201).json({ id, title });
});

router.put('/:project/timeline/:id', (req, res) => {
  const changes = updateRecord(project(req.params.project), 'timeline_events', req.params.id, req.body, ['year', 'title', 'description', 'importance'], false);
  if (changes === null) return res.status(400).json({ error: { message: '没有要更新的字段' } });
  if (changes === 0) return res.status(404).json({ error: { message: '事件不存在' } });
  res.json({ success: true });
});

router.delete('/:project/timeline/:id', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM timeline_events WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: { message: '事件不存在' } });
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// SETTINGS (global)
// ═══════════════════════════════════════════

router.get('/settings', (req, res) => {
  const stored = {};
  for (const r of db.dbQuery('SELECT key, value FROM app_settings')) stored[r.key] = r.value;
  const settings = { ...db.DEFAULT_APP_SETTINGS, ...stored };
  // Show the budget the server will actually use for this model; an absent
  // stored value falls through to the model-aware default.
  settings.max_output_tokens = String(
    db.resolveMaxOutputTokens(stored.max_output_tokens, settings.api_model),
  );
  // Fill in effective API key from env if the DB entry is empty
  if (!settings.api_key) settings.api_key = process.env.DEEPSEEK_KEY || '';
  res.json(settings);
});

router.put('/settings', (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '缺少key', recoverable: true } });
  const normalized = db.normalizeSetting(key, value);
  if (normalized === undefined) {
    return res.status(400).json({
      error: { code: 'INVALID_PARAMS', message: `无效的设置项或值: ${key}`, recoverable: true },
    });
  }
  db.dbExecute('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, normalized]);
  // Invalidate AI config cache so next AI request picks up the change
  if (db.invalidateAiConfigCache) db.invalidateAiConfigCache();
  // Privacy: apply the anonymous-statistics opt-out to server-side Sentry.
  if (key === 'anonymous_stats') {
    const Sentry = require('../instrument');
    Sentry.setAnonymousStats(normalized === 'true');
  }
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// PROJECT META
// ═══════════════════════════════════════════

router.get('/:project/meta', (req, res) => {
  const rows = db.projectQuery(project(req.params.project), 'SELECT key, value FROM project_meta');
  const meta = {};
  for (const r of rows) meta[r.key] = r.value;
  meta.genres = db.projectQuery(project(req.params.project), 'SELECT genre FROM project_genres').map(g => g.genre);
  res.json(meta);
});

// User-authored writing rules injected into every AI system prompt.
router.put('/:project/author-notes', (req, res) => {
  const { authorNotes } = req.body || {};
  if (typeof authorNotes !== 'string') {
    return res.status(400).json({ error: { message: 'authorNotes 必须是字符串' } });
  }
  try {
    const notes = saveAuthorNotes(db.getProjectDb(project(req.params.project)), authorNotes);
    res.json({ success: true, authorNotes: notes });
  } catch (e) {
    res.status(400).json({ error: { message: e.message } });
  }
});

// ═══════════════════════════════════════════
// WORKFLOW PHASE
// ═══════════════════════════════════════════

router.get('/:project/workflow/phase', (req, res) => {
  const row = db.projectGet(project(req.params.project),
    "SELECT value FROM project_meta WHERE key = 'workflow_phase'"
  );
  res.json({ phase: row?.value || 'idea' });
});

router.put('/:project/workflow/phase', (req, res) => {
  const { phase } = req.body || {};
  const valid = ['idea', 'setting', 'outline', 'writing', 'review', 'consistency', 'export'];
  if (!phase || !valid.includes(phase)) {
    return res.status(400).json({ error: { message: `Invalid phase. Must be one of: ${valid.join(', ')}` } });
  }
  db.projectExecute(project(req.params.project),
    "INSERT OR REPLACE INTO project_meta (key, value) VALUES ('workflow_phase', ?)", [phase]
  );
  res.json({ success: true, phase });
});

// ═══════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════

router.get('/:project/stats', (req, res) => {
  const pn = project(req.params.project);
  // One statement for all scalar counts — this endpoint is polled by the
  // status bar and read by the sidebar and dashboard.
  const stats = db.projectGet(pn, `
    SELECT
      (SELECT COALESCE(SUM(word_count), 0) FROM chapters) AS totalWords,
      (SELECT COUNT(*) FROM chapters) AS chapterCount,
      (SELECT COUNT(*) FROM chapters WHERE status = 'accepted') AS acceptedCount,
      (SELECT COUNT(*) FROM characters) AS characterCount,
      (SELECT COUNT(*) FROM foreshadows) AS foreshadowCount,
      (SELECT COUNT(*) FROM foreshadows WHERE status = 'resolved') AS resolvedForeshadow,
      (SELECT COUNT(*) FROM foreshadows WHERE status = 'planted' AND expected_resolve_chapter < (SELECT COALESCE(MAX(num), 0) FROM chapters)) AS overdueForeshadow,
      (SELECT COUNT(*) FROM world_entries) AS worldCount,
      (SELECT COUNT(*) FROM science_entries) AS sciCount,
      (SELECT COUNT(*) FROM character_relations) AS relationCount,
      (SELECT COUNT(*) FROM memories) AS memoryCount,
      (SELECT COUNT(*) FROM timeline_events) AS timelineCount,
      (SELECT COUNT(*) FROM volumes) AS volumeCount,
      (SELECT COUNT(*) FROM clue_board WHERE resolved = 0) AS clueUnresolved,
      (SELECT COUNT(*) FROM clue_board WHERE resolved = 1) AS clueResolved,
      (SELECT COALESCE(SUM(input_tokens), 0) FROM token_usage) AS tokenInput,
      (SELECT COALESCE(SUM(output_tokens), 0) FROM token_usage) AS tokenOutput
  `) || {};
  const genres = db.projectQuery(pn, 'SELECT genre FROM project_genres').map(g => g.genre);
  const styles = db.projectQuery(pn, 'SELECT style FROM project_styles').map(s => s.style);

  // Target words: custom override or fallback to project mode default
  const metaRows = db.projectQuery(pn, "SELECT key, value FROM project_meta WHERE key IN ('mode', 'target_words')");
  const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
  const projectMode = meta.mode || 'medium-novel';
  const TARGET_WORDS = { 'short-story': 30000, 'medium-novel': 100000, 'long-novel': 200000 };
  const customTarget = meta.target_words;
  const targetWords = customTarget ? parseInt(customTarget) : (TARGET_WORDS[projectMode] || 100000);

  // Volume structure summary
  const volumes = db.projectQuery(pn, 'SELECT id, title, sort_order, (SELECT COUNT(*) FROM chapters WHERE volume_id = volumes.id) as chapter_count, (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE volume_id = volumes.id) as word_count FROM volumes ORDER BY sort_order');

  // Daily word counts for sparkline (last 7 days)
  const rawDaily = db.projectQuery(pn,
    "SELECT date(updated_at) as day, SUM(word_count) as words FROM chapters WHERE updated_at >= date('now', '-6 days') GROUP BY date(updated_at) ORDER BY day"
  );
  const dailyMap = {};
  for (const r of rawDaily) dailyMap[r.day] = r.words;
  const dailyWords = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyWords.push(dailyMap[key] || 0);
  }

  res.json({
    ...stats,
    volumes,
    genres,
    styles,
    powerFantasy: styles.includes('power-fantasy'),
    targetWords,
    chapters: db.projectQuery(pn, 'SELECT id, num, title, word_count, status FROM chapters ORDER BY num'),
    dailyWords,
  });
});

// ─── Target words ───

router.put('/:project/target-words', (req, res) => {
  const pn = project(req.params.project);
  const { targetWords } = req.body;
  if (typeof targetWords !== 'number' || targetWords < 1000) {
    return res.status(400).json({ error: { message: 'targetWords must be a number ≥ 1000' } });
  }
  db.projectExecute(pn,
    "INSERT OR REPLACE INTO project_meta (key, value) VALUES ('target_words', ?)", [String(targetWords)]
  );
  res.json({ success: true, targetWords });
});

router.delete('/:project/target-words', (req, res) => {
  const pn = project(req.params.project);
  db.projectExecute(pn, "DELETE FROM project_meta WHERE key = 'target_words'");
  // Return the mode-based default
  const projectMode = db.projectGet(pn, "SELECT value FROM project_meta WHERE key = 'mode'")?.value || 'medium-novel';
  const TARGET_WORDS = { 'short-story': 30000, 'medium-novel': 100000, 'long-novel': 200000 };
  res.json({ success: true, targetWords: TARGET_WORDS[projectMode] || 100000 });
});

// ═══════════════════════════════════════════
// TOKEN USAGE
// ═══════════════════════════════════════════

router.get('/:project/tokens', (req, res) => {
  const rows = db.projectQuery(project(req.params.project), 'SELECT * FROM token_usage ORDER BY created_at DESC LIMIT 50');
  res.json(rows);
});

// ═══════════════════════════════════════════
// COVER IMAGE
// ═══════════════════════════════════════════

router.post('/:project/cover', (req, res) => {
  const pn = project(req.params.project);
  const { data, mime } = req.body || {};
  if (!data) return res.status(400).json({ error: { message: '缺少图片数据' } });
  const stored = db.writeProjectCover(pn, mime || 'image/png', Buffer.from(data, 'base64'));
  // Surface an unwritable document instead of reporting a saved cover that is
  // only in memory.
  try {
    db.getProjectDb(pn).flush();
  } catch (err) {
    return res.status(err.status || 500).json({
      error: { code: err.code || 'COVER_SAVE_FAILED', message: err.message, recoverable: true },
    });
  }
  res.json({ success: true, ext: stored.ext, mime: stored.mime });
});

router.get('/:project/cover', (req, res) => {
  const pn = project(req.params.project);
  const cover = db.getProjectCover(pn);
  if (cover) {
    res.setHeader('Content-Type', cover.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    return res.end(cover.data);
  }
  res.status(404).json({ error: { message: '未上传封面' } });
});

router.delete('/:project/cover', (req, res) => {
  const pn = project(req.params.project);
  const cover = db.getProjectCover(pn);
  if (cover) {
    db.deleteProjectCover(pn);
    try {
      db.getProjectDb(pn).flush();
    } catch (err) {
      return res.status(err.status || 500).json({
        error: { code: err.code || 'COVER_SAVE_FAILED', message: err.message, recoverable: true },
      });
    }
    res.json({ success: true });
  } else {
    res.status(404).json({ error: { message: '未上传封面' } });
  }
});

// ═══════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Ordered inline Markdown rules shared by the HTML and TXT exporters. Each
// renderer maps a construct to its output, so the two formats agree on what
// counts as inline markup; only the rendering differs.
const INLINE_IMAGE_RE = /!\[([^\]]*)\]\(((?:[^()\s]|\([^)]*\))+)\)/g;
const INLINE_LINK_RE = /\[([^\]]+)\]\(((?:[^()\s]|\([^)]*\))+)\)/g;
const INLINE_BOLD_ITALIC_RE = /(\*\*\*|___)(?=\S)([^\n]*?\S)\1/g;
const INLINE_BOLD_RE = /(\*\*|__)(?=\S)([^\n]*?\S)\1/g;
const INLINE_STRIKE_RE = /~~(?=\S)([^\n]*?\S)~~/g;
// Italic: keep intraword asterisks (e.g. "2*3*4") untouched.
const INLINE_ITALIC_RE = /(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;

function applyInlineMarkdown(text, render) {
  return text
    .replace(INLINE_IMAGE_RE, (match, alt, src) => render.image(alt, src))
    .replace(INLINE_LINK_RE, (match, label, href) => render.link(label, href))
    .replace(INLINE_BOLD_ITALIC_RE, (match, marker, inner) => render.boldItalic(inner))
    .replace(INLINE_BOLD_RE, (match, marker, inner) => render.bold(inner))
    .replace(INLINE_STRIKE_RE, (match, inner) => render.strike(inner))
    .replace(INLINE_ITALIC_RE, (match, inner) => render.italic(inner))
    .replace(INLINE_CODE_RE, (match, code) => render.code(code));
}

// The text is escaped first, so only the tags generated here can appear.
const HTML_INLINE = {
  image: (alt, src) => (/^(?:https?:|data:image\/)/i.test(src) ? `<img src="${src}" alt="${alt}">` : alt),
  link: (label, href) => (/^(?:https?:|mailto:)/i.test(href) ? `<a href="${href}">${label}</a>` : label),
  boldItalic: (inner) => `<strong><em>${inner}</em></strong>`,
  bold: (inner) => `<strong>${inner}</strong>`,
  strike: (inner) => `<del>${inner}</del>`,
  italic: (inner) => `<em>${inner}</em>`,
  code: (code) => `<code>${code}</code>`,
};

// TXT export is plain prose: drop the inline markers, keep the text.
const TEXT_INLINE = {
  image: (alt) => alt,
  link: (label) => label,
  boldItalic: (inner) => inner,
  bold: (inner) => inner,
  strike: (inner) => inner,
  italic: (inner) => inner,
  code: (code) => code,
};

/** Inline Markdown → HTML for chapter bodies. */
function inlineMarkdownToHtml(text) {
  return applyInlineMarkdown(escapeHtml(text), HTML_INLINE);
}

/**
 * Render chapter content for HTML/EPUB export. Plain prose stays one <p> per
 * line (matching how chapters are written); common Markdown block syntax is
 * upgraded to its HTML equivalent.
 */
function markdownToHtmlParagraphs(text) {
  const out = [];
  let listType = null;
  let listItems = [];
  let quoteLines = [];
  let codeLines = [];
  let inFence = false;

  const flushList = () => {
    if (!listType) return;
    out.push(`<${listType}>${listItems.map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`).join('')}</${listType}>`);
    listType = null;
    listItems = [];
  };
  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    out.push(`<blockquote><p>${quoteLines.map(inlineMarkdownToHtml).join('<br>')}</p></blockquote>`);
    quoteLines = [];
  };
  const flushCode = () => {
    if (codeLines.length === 0) return;
    out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    codeLines = [];
  };

  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (/^(?:`{3,}|~{3,})/.test(line)) {
      flushList();
      flushQuote();
      if (inFence) flushCode();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      codeLines.push(raw);
      continue;
    }
    if (!line) {
      flushList();
      flushQuote();
      continue;
    }
    // Thematic break / scene separator.
    if (/^(?:[-*_]\s*){3,}$/.test(line)) {
      flushList();
      flushQuote();
      out.push('<hr>');
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushList();
      flushQuote();
      const level = Math.min(heading[1].length + 1, 6);
      out.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushList();
      quoteLines.push(quote[1]);
      continue;
    }
    flushQuote();
    const unordered = line.match(/^[-*+]\s+(.*)$/);
    const ordered = unordered ? null : line.match(/^\d+[.)]\s+(.*)$/);
    if (unordered || ordered) {
      const type = unordered ? 'ul' : 'ol';
      if (listType && listType !== type) flushList();
      listType = type;
      listItems.push((unordered || ordered)[1]);
      continue;
    }
    flushList();
    out.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
  }
  flushList();
  flushQuote();
  flushCode();
  return out.join('');
}

function groupChaptersByVolume(chapters, volumes) {
  const known = new Set(volumes.map((v) => v.id));
  const groups = [];
  for (const vol of volumes) {
    const list = chapters.filter((ch) => (ch.volume_id || 1) === vol.id);
    if (list.length > 0) groups.push({ volume: vol, chapters: list });
  }
  const orphans = chapters.filter((ch) => !known.has(ch.volume_id || 1));
  if (orphans.length > 0) groups.push({ volume: null, chapters: orphans });
  return groups;
}

// TXT export is meant to be read as plain prose, so inline Markdown markers
// are stripped. Lines made only of -, * or _ are kept: novelists use them as
// intentional scene breaks. List markers are left alone for the same reason
// (a leading dash can be meaningful in dialogue).
function stripMarkdownForTxt(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (/^\s*(?:(?:[-*_])\s*){3,}$/.test(line)) return line;
      return applyInlineMarkdown(
        line
          .replace(/^\s{0,3}#{1,6}\s*/, '') // ATX headings
          .replace(/^\s*(?:`{3,}|~{3,})[^\n]*$/, '') // fenced code markers
          .replace(/^\s{0,3}>\s?/, ''), // blockquotes
        TEXT_INLINE,
      );
    })
    .join('\n');
}

router.get('/:project/export', async (req, res) => {
  const { format = 'txt' } = req.query;
  const pn = project(req.params.project);
  const chapters = db.projectQuery(pn, "SELECT num, title, content, volume_id FROM chapters WHERE content != '' ORDER BY num");
  // Legacy/AI content may still start with the chapter title; exports add the
  // heading themselves, so strip the duplicate here.
  for (const ch of chapters) ch.content = stripLeadingChapterHeading(ch.content, ch);
  const volumes = db.projectQuery(pn, 'SELECT * FROM volumes ORDER BY sort_order');
  const meta = {};
  db.projectQuery(pn, 'SELECT key, value FROM project_meta').forEach(m => meta[m.key] = m.value);

  const totalWords = chapters.reduce((s, c) => s + db.countWords(c.content), 0);
  const EXPORT_DIR = path.join(db.EXPORTS_DIR, pn);
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

  // Cover bytes come from the project DB (documents) or the legacy file.
  const cover = db.getProjectCover(pn);
  const coverBase64 = cover ? cover.data.toString('base64') : null;
  const coverMime = cover?.mime || null;
  let coverPath = null;
  if (cover) {
    const coverExt = db.MIME_TO_EXT[cover.mime] || 'png';
    coverPath = path.join(EXPORT_DIR, `cover.${coverExt}`);
    fs.writeFileSync(coverPath, cover.data);
  }

  let ext = 'txt';
  let mime = 'text/plain; charset=utf-8';
  let output;
  let filename;

  if (format === 'epub') {
    // ── EPUB with cover ──
    ext = 'epub';
    mime = 'application/epub+zip';
    filename = `${pn}.epub`;

    const EpubGen = require('epub-gen');

    // Build content grouped by volume
    const content = [];
    for (const group of groupChaptersByVolume(chapters, volumes)) {
      const vol = group.volume;
      if (vol && volumes.length > 1) {
        content.push({
          title: volumeHeading(vol),
          data: `<h2>${escapeHtml(volumeHeading(vol))}</h2>${vol.summary ? `<p>${escapeHtml(vol.summary)}</p>` : ''}`,
        });
      }
      for (const ch of group.chapters) {
        content.push({
          title: chapterHeading(ch),
          data: `<h1>${escapeHtml(chapterHeading(ch))}</h1>${markdownToHtmlParagraphs(ch.content)}`,
        });
      }
    }

    const epubPath = path.join(EXPORT_DIR, filename);
    const epubOptions = {
      title: meta.name || pn,
      author: meta.author_name || '佚名',
      publisher: 'Mythpen',
      cover: coverPath || undefined,
      output: epubPath,
      content,
    };
    await new EpubGen(epubOptions).promise;

    if (req.query.download === '1' || req.query.download === 'true') {
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      return res.end(fs.readFileSync(epubPath));
    }
    return res.json({ success: true, format: 'epub', filePath: epubPath, wordCount: totalWords, chapterCount: chapters.length, filename });

  } else if (format === 'html') {
    // ── HTML with cover (for save-as-PDF) ──
    ext = 'html';
    mime = 'text/html; charset=utf-8';
    filename = `${pn}.html`;

    let coverHtml = '';
    if (coverPath) {
      coverHtml = `<div class="cover-page"><img src="data:${coverMime};base64,${coverBase64}" alt="封面"></div>`;
    }

    const htmlGroups = groupChaptersByVolume(chapters, volumes);
    const tocHtml = htmlGroups
      .map((group) => {
        const volumeItem = volumes.length > 1 && group.volume
          ? `<li class="toc-volume">${escapeHtml(volumeHeading(group.volume))}</li>`
          : '';
        return volumeItem + group.chapters.map((ch) => `<li>${escapeHtml(chapterHeading(ch))}</li>`).join('');
      })
      .join('');
    const chaptersHtml = htmlGroups
      .map((group) => {
        const volumeHeadingHtml = volumes.length > 1 && group.volume
          ? `<div class="volume-heading"><h2>${escapeHtml(volumeHeading(group.volume))}</h2></div>`
          : '';
        return volumeHeadingHtml + group.chapters
          .map((ch) => `<div class="chapter"><h1>${escapeHtml(chapterHeading(ch))}</h1>${markdownToHtmlParagraphs(ch.content)}</div>`)
          .join('');
      })
      .join('');

    output = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${meta.name || pn}</title>
<style>
  @page { margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Noto Serif SC', 'Songti SC', serif; color: #333; background: #fff; line-height: 1.8; }
  .cover-page { page-break-after: always; text-align: center; padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .cover-page img { max-width: 100%; max-height: 90vh; object-fit: contain; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
  .toc-page { page-break-after: always; padding: 40px; }
  .toc-page h1 { text-align: center; font-size: 24px; margin-bottom: 30px; }
  .toc-page ul { list-style: none; padding: 0; max-width: 500px; margin: 0 auto; }
  .toc-page li { padding: 8px 0; border-bottom: 1px solid #eee; font-size: 16px; }
  .chapter { page-break-after: always; padding: 40px; max-width: 700px; margin: 0 auto; }
  .chapter h1 { font-size: 22px; text-align: center; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 2px solid #333; }
  .chapter p { text-indent: 2em; margin-bottom: 0.8em; font-size: 16px; }
  .chapter h1, .chapter h2, .chapter h3, .chapter h4, .chapter h5, .chapter h6 { text-indent: 0; }
  .chapter h2, .chapter h3, .chapter h4, .chapter h5, .chapter h6 { margin: 1.2em 0 0.6em; }
  .chapter blockquote { margin: 0.8em 0; padding-left: 1em; border-left: 3px solid #ddd; color: #666; }
  .chapter blockquote p { text-indent: 0; margin-bottom: 0; }
  .chapter ul, .chapter ol { margin: 0.8em 0 0.8em 1.8em; font-size: 16px; }
  .chapter li { margin-bottom: 0.3em; }
  .chapter hr { margin: 1.5em auto; width: 60%; border: none; border-top: 1px solid #ddd; }
  .chapter pre { margin: 0.8em 0; padding: 10px 12px; background: #f6f6f6; border-radius: 4px; white-space: pre-wrap; }
  .chapter code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  .chapter a { color: inherit; text-decoration: underline; }
  .volume-heading { page-break-after: always; padding: 40px; max-width: 700px; margin: 0 auto; text-align: center; }
  .volume-heading h2 { font-size: 26px; }
  .toc-volume { font-weight: 600; margin-top: 12px; }
</style>
</head>
<body>
${coverHtml}
<div class="toc-page">
  <h1>${escapeHtml(meta.name || pn)}</h1>
  <p style="text-align:center;color:#999;margin-bottom:30px;">${escapeHtml(meta.author_name || '佚名')} 著</p>
  <ul>${tocHtml}</ul>
</div>
${chaptersHtml}
</body>
</html>`;

    const filePath = path.join(EXPORT_DIR, filename);
    fs.writeFileSync(filePath, output, 'utf-8');

    if (req.query.download === '1' || req.query.download === 'true') {
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      return res.send(output);
    }
    return res.json({ success: true, format: 'html', filePath, wordCount: totalWords, chapterCount: chapters.length, filename });

  } else if (format === 'md' || format === 'markdown') {
    ext = 'md';
    mime = 'text/markdown; charset=utf-8';
    filename = `${pn}.md`;
    output = `# ${meta.name || pn}\n\n${meta.description ? `> ${meta.description}\n\n` : ''}`;
    if (coverPath) {
      output += `<img src="data:${coverMime};base64,${coverBase64}" alt="封面" style="max-width:100%;height:auto;">\n\n`;
    }
    const mdGroups = groupChaptersByVolume(chapters, volumes);
    const mdMultiVolume = volumes.length > 1;
    const chapterLevel = mdMultiVolume ? '###' : '##';
    for (const group of mdGroups) {
      if (mdMultiVolume && group.volume) output += `\n## ${volumeHeading(group.volume)}\n`;
      for (const ch of group.chapters) {
        output += `\n---\n\n${chapterLevel} ${chapterHeading(ch)}\n\n${ch.content}\n`;
      }
    }
  } else {
    // TXT
    ext = 'txt';
    mime = 'text/plain; charset=utf-8';
    filename = `${pn}.txt`;
    output = `${meta.name || pn}\n${'='.repeat(meta.name?.length || 10)}\n\n`;
    if (meta.description) output += `${meta.description}\n\n`;
    const txtGroups = groupChaptersByVolume(chapters, volumes);
    for (const group of txtGroups) {
      if (volumes.length > 1 && group.volume) {
        output += `\n${volumeHeading(group.volume)}\n${'='.repeat(20)}\n`;
      }
      for (const ch of group.chapters) {
        output += `\n${chapterHeading(ch)}\n${'-'.repeat(20)}\n\n${stripMarkdownForTxt(ch.content).trim()}\n`;
      }
    }
  }

  output += `\n\n---\n共 ${chapters.length} 章 · ${totalWords} 字\n`;

  // Save to exports dir
  const filePath = path.join(EXPORT_DIR, filename);
  fs.writeFileSync(filePath, output, 'utf-8');

  // Record in exports table
  try {
    db.projectExecute(pn,
      'INSERT OR REPLACE INTO exports (id, format, file_path, word_count, exported_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
      [randomUUID(), ext, filePath, totalWords]
    );
  } catch(e) {}

  if (req.query.download === '1' || req.query.download === 'true') {
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    return res.send(output);
  }

  res.json({
    success: true,
    format: ext,
    filePath,
    wordCount: totalWords,
    chapterCount: chapters.length,
    preview: (output || '').slice(0, 2000),
    filename,
  });
});

// ═══════════════════════════════════════════
// CHAT SESSIONS (per-project)
// ═══════════════════════════════════════════

router.get('/:project/chat/sessions', (req, res) => {
  const rows = db.projectQuery(project(req.params.project),
    'SELECT * FROM chat_sessions ORDER BY updated_at DESC'
  );
  res.json(rows);
});

router.post('/:project/chat/sessions', (req, res) => {
  const { title } = req.body || {};
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO chat_sessions (id, title) VALUES (?, ?)',
    [id, title || '新对话']
  );
  res.status(201).json({ id, title: title || '新对话', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
});

router.put('/:project/chat/sessions/:id', (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'title is required' } });
  db.projectExecute(project(req.params.project),
    "UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?",
    [title, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/:project/chat/sessions/:id', (req, res) => {
  db.projectExecute(project(req.params.project),
    'DELETE FROM chat_messages WHERE session_id = ?', [req.params.id]
  );
  db.projectExecute(project(req.params.project),
    'DELETE FROM chat_sessions WHERE id = ?', [req.params.id]
  );
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// CHAT MESSAGES (per-project)
// ═══════════════════════════════════════════

router.get('/:project/chat/messages', (req, res) => {
  const { session_id } = req.query;
  let sql = 'SELECT * FROM chat_messages';
  const params = [];
  if (session_id) {
    sql += ' WHERE session_id = ?';
    params.push(session_id);
  }
  sql += ' ORDER BY created_at ASC';
  const rows = db.projectQuery(project(req.params.project), sql, params);
  const messages = rows.map(r => ({
    id: r.id,
    role: r.role,
    content: r.content,
    toolCalls: JSON.parse(r.tool_calls || '[]'),
    createdAt: r.created_at,
  }));
  res.json(messages);
});

router.post('/:project/chat/messages', (req, res) => {
  const { role, content, toolCalls, session_id } = req.body || {};
  if (!role || !content || !session_id) {
    return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'role, content and session_id are required', recoverable: true } });
  }
  if (!['user', 'ai', 'system'].includes(role)) {
    return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'role must be user/ai/system', recoverable: true } });
  }
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO chat_messages (id, session_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)',
    [id, session_id, role, content, JSON.stringify(toolCalls || [])]
  );
  // Update session's updated_at
  db.projectExecute(project(req.params.project),
    "UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?", [session_id]
  );
  res.status(201).json({ id, role, content, toolCalls: toolCalls || [], session_id, createdAt: new Date().toISOString() });
});

module.exports = router;
