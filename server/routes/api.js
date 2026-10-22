const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { chapterHeading, volumeHeading } = require('../titles');

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
        const wordCount = parseInt(meta.word_count || '0');
        const iconMap = { 'sci-fi': 'Rocket', 'fantasy': 'Wand', 'romance': 'Heart', 'history': 'Landmark', 'urban': 'Building', 'power-fantasy': 'Zap', 'biography': 'BookOpen', 'other': 'Scroll' };
        const iconName = genres.map(g => iconMap[g] || 'BookOpen').join(' ');
        const genreLabels = { 'sci-fi': '科幻', 'fantasy': '玄幻', 'romance': '言情', 'history': '历史', 'urban': '都市', 'power-fantasy': '爽文', 'biography': '传记', 'other': '其他' };
        return {
          id: r.id, name: r.name, iconName: iconName || 'BookOpen',
          genres: genres.map(g => genreLabels[g] || g),
          wordCount, chapterCount: chCount, lastOpened: r.last_opened,
          mode: meta.mode || 'medium-novel',
          status: wordCount > 30000 ? 'writing' : wordCount > 5000 ? 'inProgress' : 'new',
        };
      } catch (e) {
        return { id: r.id, name: r.name, iconName: 'BookOpen', genres: [], wordCount: r.word_count || 0, chapterCount: 0, lastOpened: r.last_opened, mode: 'medium-novel', status: 'unknown' };
      }
    })
    .filter(Boolean);
  res.json(projects);
});

router.post('/projects', (req, res) => {
  const { name, mode = 'medium-novel', language = 'zh', genres = ['other'] } = req.body || {};
  const nameError = db.validateProjectName(name);
  if (nameError) {
    return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: nameError, recoverable: true } });
  }

  if (db.dbGet('SELECT 1 AS x FROM recent_projects WHERE name = ?', [name])) {
    return res.status(409).json({ error: { code: 'PROJECT_ALREADY_EXISTS', message: `项目"${name}"已存在`, recoverable: true } });
  }

  // Create new project DB. The file name is opaque; the display name is the
  // registry key, so renaming/relocating does not depend on the path.
  const filePath = db.newProjectFilePath();
  const pdb = db.openProjectDb(filePath);
  db.registerRecentProject(name, filePath);
  try {
    db.initProjectMeta(name, { mode, language });
    db.initProjectGenres(name, genres);

    // Default volume
    pdb.prepare("INSERT INTO volumes (id, sort_order, title, summary) VALUES (1, 1, '第一卷', '')").run();
  } catch (err) {
    db.closeProjectDb(filePath);
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    db.dbExecute('DELETE FROM recent_projects WHERE name = ?', [name]);
    throw err;
  }

  res.json({ name, filePath, mode, language, genres });
});

router.get('/projects/:name', (req, res) => {
  const { name } = req.params;
  let filePath;
  let pdb;
  try {
    filePath = db.getProjectDbPath(name);
    pdb = db.getProjectDb(name);
  } catch {
    return res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `项目"${name}"不存在`, recoverable: true } });
  }
  const meta = {};
  pdb.prepare('SELECT key, value FROM project_meta').all().forEach(m => meta[m.key] = m.value);
  const genres = pdb.prepare('SELECT genre FROM project_genres').all().map(g => g.genre);
  res.json({ ...meta, genres, filePath });
});

router.delete('/projects/:name', (req, res) => {
  const { name } = req.params;
  let filePath;
  try {
    filePath = db.getProjectDbPath(name);
  } catch {
    return res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `项目"${name}"不存在`, recoverable: true } });
  }
  db.closeProjectDb(filePath);
  try { fs.unlinkSync(filePath); } catch(e) {}
  db.dbExecute('DELETE FROM recent_projects WHERE name = ?', [name]);
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// CHAPTERS
// ═══════════════════════════════════════════

// Chapter metadata without the body — structure views and validators only need
// these fields, and imported books can hold tens of megabytes of content.
const SLIM_CHAPTER_COLS =
  'c.id, c.volume_id, c.num, c.title, c.outline, c.summary, c.word_count, c.status, c.cognitive_frame, c.emotional_anchor, c.world_texture, c.concrete_mystery, c.interpersonal_tension, c.created_at, c.updated_at';

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
  const { title, content, outline, status, cognitive_frame, emotional_anchor, world_texture, concrete_mystery, interpersonal_tension } = req.body || {};
  const fields = [];
  const params = [];
  if (title !== undefined) { fields.push('title = ?'); params.push(title); }
  if (content !== undefined) { fields.push('content = ?'); params.push(content); }
  if (outline !== undefined) { fields.push('outline = ?'); params.push(outline); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }
  if (cognitive_frame !== undefined) { fields.push('cognitive_frame = ?'); params.push(cognitive_frame); }
  if (emotional_anchor !== undefined) { fields.push('emotional_anchor = ?'); params.push(emotional_anchor); }
  if (world_texture !== undefined) { fields.push('world_texture = ?'); params.push(world_texture); }
  if (concrete_mystery !== undefined) { fields.push('concrete_mystery = ?'); params.push(concrete_mystery); }
  if (interpersonal_tension !== undefined) { fields.push('interpersonal_tension = ?'); params.push(interpersonal_tension); }

  if (content !== undefined) {
    // Update word count for Chinese text
    const wc = db.countWords(content);
    fields.push('word_count = ?');
    params.push(wc);
  }

  fields.push("updated_at = datetime('now')");
  params.push(parseInt(num));

  const sql = `UPDATE chapters SET ${fields.join(', ')} WHERE num = ?`;
  db.projectExecute(project(req.params.project), sql, params);
  db.recalculateWordCount(project(req.params.project));

  const updated = db.projectGet(project(req.params.project),
    'SELECT * FROM chapters WHERE num = ?', [parseInt(num)]
  );
  res.json(updated);
});

router.post('/:project/chapters', (req, res) => {
  const pn = project(req.params.project);
  const { title, outline = '', status = 'pending', chapter_num } = req.body || {};

  // Default to the last volume so continuation chapters land at the end of
  // multi-volume (including imported) projects rather than in volume 1.
  const volumeId = req.body?.volume_id ?? db.lastVolumeId(pn);

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
  const { name, age = '', gender = '', appearance = '', personality = '', background = '', motivation = '', arc = '', ext_markers = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '角色名不能为空', recoverable: true } });
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO characters (id, name, age, gender, appearance, personality, background, motivation, arc, ext_markers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, age, gender, appearance, personality, background, motivation, arc, ext_markers]
  );
  res.status(201).json({ id, name });
});

router.put('/:project/characters/:id', (req, res) => {
  const { id } = req.params;
  const fields = []; const params = [];
  for (const key of ['name', 'age', 'gender', 'appearance', 'personality', 'background', 'motivation', 'arc', 'ext_markers', 'notes']) {
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
  const rows = db.projectQuery(project(req.params.project), 'SELECT * FROM science_entries ORDER BY label, name');
  res.json(rows);
});

router.post('/:project/science', (req, res) => {
  const { label, name, description = '', references = '' } = req.body || {};
  const id = randomUUID();
  db.projectExecute(project(req.params.project),
    'INSERT INTO science_entries (id, label, name, description, "references") VALUES (?, ?, ?, ?, ?)',
    [id, label, name, description, references]
  );
  res.status(201).json({ id, name });
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
  const rows = db.dbQuery('SELECT key, value FROM app_settings');
  const settings = { ...db.DEFAULT_APP_SETTINGS };
  for (const r of rows) settings[r.key] = r.value;
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
  const coverDir = db.getCoverDir(pn);
  if (!fs.existsSync(coverDir)) fs.mkdirSync(coverDir, { recursive: true });
  const ext = db.MIME_TO_EXT[mime || 'image/png'] || 'png';
  const coverPath = path.join(coverDir, `cover.${ext}`);
  fs.writeFileSync(coverPath, Buffer.from(data, 'base64'));
  db.projectExecute(pn, "INSERT OR REPLACE INTO project_meta (key, value) VALUES ('cover_mime', ?)", [mime || 'image/png']);
  db.projectExecute(pn, "INSERT OR REPLACE INTO project_meta (key, value) VALUES ('cover_ext', ?)", [ext]);
  res.json({ success: true, ext, mime: mime || 'image/png' });
});

router.get('/:project/cover', (req, res) => {
  const pn = project(req.params.project);
  const coverPath = db.findCoverPath(pn);
  if (coverPath) {
    const ext = path.extname(coverPath).slice(1);
    res.setHeader('Content-Type', db.EXT_TO_MIME[ext] || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    return res.end(fs.readFileSync(coverPath));
  }
  res.status(404).json({ error: { message: '未上传封面' } });
});

router.delete('/:project/cover', (req, res) => {
  const pn = project(req.params.project);
  const coverPath = db.findCoverPath(pn);
  if (coverPath) {
    fs.unlinkSync(coverPath);
    db.projectExecute(pn, "DELETE FROM project_meta WHERE key IN ('cover_mime', 'cover_ext')");
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

function textToHtmlParagraphs(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
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

router.get('/:project/export', async (req, res) => {
  const { format = 'txt' } = req.query;
  const pn = project(req.params.project);
  const chapters = db.projectQuery(pn, "SELECT num, title, content, volume_id FROM chapters WHERE content != '' ORDER BY num");
  const volumes = db.projectQuery(pn, 'SELECT * FROM volumes ORDER BY sort_order');
  const meta = {};
  db.projectQuery(pn, 'SELECT key, value FROM project_meta').forEach(m => meta[m.key] = m.value);

  const totalWords = chapters.reduce((s, c) => s + db.countWords(c.content), 0);
  const EXPORT_DIR = path.join(require('os').homedir(), '.mythpen', 'exports', pn);
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

  // Find cover image
  const coverPath = db.findCoverPath(pn);
  const coverBase64 = coverPath ? fs.readFileSync(coverPath).toString('base64') : null;
  const coverMime = coverPath ? (db.EXT_TO_MIME[path.extname(coverPath).slice(1)] || 'image/png') : null;

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
          data: `<h1>${escapeHtml(chapterHeading(ch))}</h1>${textToHtmlParagraphs(ch.content)}`,
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
          .map((ch) => `<div class="chapter"><h1>${escapeHtml(chapterHeading(ch))}</h1>${textToHtmlParagraphs(ch.content)}</div>`)
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
  .chapter h1, .chapter h2, .chapter h3, .chapter h4 { text-indent: 0; }
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
        output += `\n${chapterHeading(ch)}\n${'-'.repeat(20)}\n\n${ch.content.replace(/^#+/gm, '').trim()}\n`;
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
