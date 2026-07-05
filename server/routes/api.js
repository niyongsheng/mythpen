const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../db');

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
  const projects = rows.map(r => {
    let status = '刚起步';
    try {
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
        status: r.word_count > 30000 ? '写作中' : r.word_count > 5000 ? '进行中' : '刚起步',
      };
    } catch (e) {
      return { id: r.id, name: r.name, iconName: 'BookOpen', genres: [], wordCount: r.word_count || 0, chapterCount: 0, lastOpened: r.last_opened, mode: 'medium-novel', status: '未知' };
    }
  });
  res.json(projects);
});

router.post('/projects', (req, res) => {
  const { name, mode = 'medium-novel', language = 'zh', genres = ['other'] } = req.body || {};
  if (!name) return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '项目名称不能为空', recoverable: true } });

  const filePath = db.getProjectDbPath(name);
  if (require('fs').existsSync(filePath)) {
    return res.status(409).json({ error: { code: 'PROJECT_ALREADY_EXISTS', message: `项目"${name}"已存在`, recoverable: true } });
  }

  // Create new project DB
  const pdb = db.openProjectDb(filePath);
  const metaInsert = pdb.prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)');
  const meta = { name, description: '', mode, language, version: '1', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), word_count: '0', author_name: '佚名', workflow_phase: 'idea' };
  for (const [k, v] of Object.entries(meta)) metaInsert.run(k, v);

  // Default volume
  pdb.prepare("INSERT INTO volumes (id, sort_order, title, summary) VALUES (1, 1, '第一卷', '')").run();

  // Genres
  for (const g of genres) {
    pdb.prepare('INSERT OR IGNORE INTO project_genres (genre) VALUES (?)').run(g);
  }

  // Config
  const config = db.getConfigDb();
  config.prepare('INSERT OR REPLACE INTO recent_projects (id, name, file_path, last_opened, word_count) VALUES (?, ?, ?, ?, ?)').run(name, name, filePath, new Date().toISOString(), 0);

  res.json({ name, filePath, mode, language, genres });
});

router.get('/projects/:name', (req, res) => {
  const { name } = req.params;
  const filePath = db.getProjectDbPath(name);
  if (!require('fs').existsSync(filePath)) {
    return res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `项目"${name}"不存在`, recoverable: true } });
  }
  const pdb = db.openProjectDb(filePath);
  const meta = {};
  pdb.prepare('SELECT key, value FROM project_meta').all().forEach(m => meta[m.key] = m.value);
  const genres = pdb.prepare('SELECT genre FROM project_genres').all().map(g => g.genre);
  res.json({ ...meta, genres, filePath });
});

router.delete('/projects/:name', (req, res) => {
  const { name } = req.params;
  const filePath = db.getProjectDbPath(name);
  db.closeProjectDb(filePath);
  try { require('fs').unlinkSync(filePath); } catch(e) {}
  db.dbExecute('DELETE FROM recent_projects WHERE name = ?', [name]);
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// CHAPTERS
// ═══════════════════════════════════════════

router.get('/:project/chapters', (req, res) => {
  const rows = db.projectQuery(project(req.params.project),
    'SELECT c.*, v.title as volume_title FROM chapters c JOIN volumes v ON c.volume_id = v.id ORDER BY c.num'
  );
  res.json(rows);
});

router.get('/:project/chapters/:num', (req, res) => {
  const row = db.projectGet(project(req.params.project),
    'SELECT c.*, v.title as volume_title FROM chapters c JOIN volumes v ON c.volume_id = v.id WHERE c.num = ?', [parseInt(req.params.num)]
  );
  if (!row) return res.status(404).json({ error: { code: 'DB_NOT_FOUND', message: `章节 ${req.params.num} 不存在`, recoverable: true } });
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
    const wc = content.replace(/\s/g, '').length;
    fields.push('word_count = ?');
    params.push(wc);
  }

  fields.push("updated_at = datetime('now')");
  params.push(parseInt(num));

  const sql = `UPDATE chapters SET ${fields.join(', ')} WHERE num = ?`;
  db.projectExecute(project(req.params.project), sql, params);

  // Update project total word count
  const totalWc = db.projectGet(project(req.params.project), 'SELECT SUM(word_count) as total FROM chapters').total || 0;
  const pdb = db.getProjectDb(project(req.params.project));
  pdb.prepare("UPDATE project_meta SET value = ? WHERE key = 'word_count'").run(String(totalWc));
  pdb.prepare("UPDATE project_meta SET value = ? WHERE key = 'updated_at'").run(new Date().toISOString());

  const updated = db.projectGet(project(req.params.project),
    'SELECT * FROM chapters WHERE num = ?', [parseInt(num)]
  );
  res.json(updated);
});

router.post('/:project/chapters', (req, res) => {
  const { title, volume_id = 1, outline = '', status = 'pending', chapter_num } = req.body || {};
  let num;
  if (chapter_num !== undefined) {
    num = chapter_num;
  } else {
    const maxNum = db.projectGet(project(req.params.project), 'SELECT MAX(num) as mx FROM chapters WHERE volume_id = ?', [volume_id]);
    num = (maxNum?.mx || 0) + 1;
  }
  db.projectExecute(project(req.params.project),
    'INSERT INTO chapters (volume_id, num, title, outline, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
    [volume_id, num, title, outline, status]
  );
  const created = db.projectGet(project(req.params.project), 'SELECT * FROM chapters WHERE num = ?', [num]);
  res.status(201).json(created);
});

router.delete('/:project/chapters/:num', (req, res) => {
  const changes = db.projectExecute(project(req.params.project), 'DELETE FROM chapters WHERE num = ?', [parseInt(req.params.num)]);
  if (changes === 0) return res.status(404).json({ error: { message: `章节 ${req.params.num} 不存在` } });
  res.json({ success: true, deleted_num: parseInt(req.params.num) });
});

router.get('/:project/volumes', (req, res) => {
  const rows = db.projectQuery(project(req.params.project), 'SELECT * FROM volumes ORDER BY sort_order');
  for (const v of rows) {
    v.chapters = db.projectQuery(project(req.params.project),
      'SELECT * FROM chapters WHERE volume_id = ? ORDER BY num', [v.id]
    );
  }
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
  const chars = db.projectQuery(project(req.params.project), 'SELECT * FROM characters ORDER BY name');
  // Add chapter count
  for (const c of chars) {
    const cc = db.projectGet(project(req.params.project),
      'SELECT COUNT(*) as cnt FROM chapter_characters WHERE character_id = ?', [c.id]
    );
    c.chapterCount = cc?.cnt || 0;
  }
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
  const id = uuidv4();
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
  const id = uuidv4();
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
  const id = uuidv4();
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
  const id = uuidv4();
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
  const id = uuidv4();
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
  const id = uuidv4();
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

// ═══════════════════════════════════════════
// TIMELINE
// ═══════════════════════════════════════════

router.get('/:project/timeline', (req, res) => {
  const rows = db.projectQuery(project(req.params.project), 'SELECT * FROM timeline_events ORDER BY year');
  res.json(rows);
});

router.post('/:project/timeline', (req, res) => {
  const { year, title, description = '', importance = 3 } = req.body || {};
  const id = uuidv4();
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
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  // Fill in effective API key from env/fallback if DB entry is empty
  if (!settings.api_key) {
    settings.api_key = process.env.DEEPSEEK_KEY || '';
  }
  if (!settings.api_base_url) {
    settings.api_base_url = 'https://api.deepseek.com/v1';
  }
  if (!settings.api_model) {
    settings.api_model = 'deepseek-v4-flash';
  }
  res.json(settings);
});

router.put('/settings', (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '缺少key', recoverable: true } });
  db.dbExecute('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, String(value)]);
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
  const totalWords = db.projectGet(pn, 'SELECT SUM(word_count) as total FROM chapters')?.total || 0;
  const chCount = db.projectGet(pn, 'SELECT COUNT(*) as cnt FROM chapters')?.cnt || 0;
  const acceptedCount = db.projectGet(pn, "SELECT COUNT(*) as cnt FROM chapters WHERE status = 'accepted'")?.cnt || 0;
  const charCount = db.projectGet(pn, 'SELECT COUNT(*) as cnt FROM characters')?.cnt || 0;
  const foreshadowCount = db.projectGet(pn, 'SELECT COUNT(*) as cnt FROM foreshadows')?.cnt || 0;
  const resolvedForeshadow = db.projectGet(pn, "SELECT COUNT(*) as cnt FROM foreshadows WHERE status = 'resolved'")?.cnt || 0;
  const overdueForeshadow = db.projectGet(pn, "SELECT COUNT(*) as cnt FROM foreshadows WHERE status = 'planted' AND expected_resolve_chapter < (SELECT COALESCE(MAX(num), 0) FROM chapters)")?.cnt || 0;
  const worldCount = db.projectGet(pn, 'SELECT COUNT(*) as cnt FROM world_entries')?.cnt || 0;
  const sciCount = db.projectGet(pn, 'SELECT COUNT(*) as cnt FROM science_entries')?.cnt || 0;
  const tokenUsage = db.projectGet(pn, 'SELECT COALESCE(SUM(input_tokens), 0) as input, COALESCE(SUM(output_tokens), 0) as output FROM token_usage') || { input: 0, output: 0 };

  res.json({
    totalWords, chapterCount: chCount, acceptedCount, characterCount: charCount,
    foreshadowCount, resolvedForeshadow, overdueForeshadow, worldCount, sciCount,
    tokenInput: tokenUsage.input || 0, tokenOutput: tokenUsage.output || 0,
    currentChapter: db.projectGet(pn, "SELECT * FROM chapters WHERE status = 'writing' ORDER BY num LIMIT 1"),
    chapters: db.projectQuery(pn, 'SELECT id, num, title, word_count, status FROM chapters ORDER BY num'),
  });
});

// ═══════════════════════════════════════════
// TOKEN USAGE
// ═══════════════════════════════════════════

router.get('/:project/tokens', (req, res) => {
  const rows = db.projectQuery(project(req.params.project), 'SELECT * FROM token_usage ORDER BY created_at DESC LIMIT 50');
  res.json(rows);
});

// ═══════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════

router.get('/:project/export', (req, res) => {
  const { format = 'txt' } = req.query;
  const pn = project(req.params.project);
  const chapters = db.projectQuery(pn, "SELECT num, title, content FROM chapters WHERE content != '' ORDER BY num");
  const meta = {};
  db.projectQuery(pn, 'SELECT key, value FROM project_meta').forEach(m => meta[m.key] = m.value);

  let output;
  let ext = 'txt';
  let mime = 'text/plain; charset=utf-8';

  if (format === 'md' || format === 'markdown') {
    ext = 'md';
    mime = 'text/markdown; charset=utf-8';
    output = `# ${meta.name || pn}\n\n${meta.description ? `> ${meta.description}\n\n` : ''}`;
    for (const ch of chapters) {
      output += `\n---\n\n## 第${ch.num}章 ${ch.title}\n\n${ch.content}\n`;
    }
  } else {
    // TXT
    output = `${meta.name || pn}\n${'='.repeat(meta.name?.length || 10)}\n\n`;
    if (meta.description) output += `${meta.description}\n\n`;
    for (const ch of chapters) {
      output += `\n第${ch.num}章 ${ch.title}\n${'-'.repeat(20)}\n\n${ch.content.replace(/^#+/gm, '').trim()}\n`;
    }
  }

  const totalWords = chapters.reduce((s, c) => s + (c.content?.replace(/\s/g, '').length || 0), 0);
  output += `\n\n---\n共 ${chapters.length} 章 · ${totalWords} 字\n`;

  // Save to exports dir
  const EXPORT_DIR = path.join(require('os').homedir(), '.mythpen', 'exports', pn);
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const filename = `${pn}-第1章.${ext}`;
  const filePath = path.join(EXPORT_DIR, filename);
  fs.writeFileSync(filePath, output, 'utf-8');

  // Record in exports table
  try {
    db.projectExecute(pn,
      'INSERT OR REPLACE INTO exports (id, format, file_path, word_count, exported_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
      [uuidv4(), ext, filePath, totalWords]
    );
  } catch(e) {}

  // If download=1, send the file directly
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
    preview: output.slice(0, 2000),
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
  const id = uuidv4();
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
  const id = uuidv4();
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
