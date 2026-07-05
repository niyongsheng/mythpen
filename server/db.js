const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(require('os').homedir(), '.mythpen');
const CONFIG_DB = path.join(DB_DIR, 'config.db');
const PROJECTS_DIR = path.join(DB_DIR, 'projects');

// ─── Ensure directories ───
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

// ─── Config DB ───
let configDb;

function getConfigDb() {
  if (!configDb) {
    configDb = new Database(CONFIG_DB);
    configDb.pragma('journal_mode = WAL');
    configDb.pragma('foreign_keys = ON');
    migrateConfig(configDb);
  }
  return configDb;
}

function migrateConfig(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recent_projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      file_path   TEXT NOT NULL UNIQUE,
      last_opened TEXT NOT NULL DEFAULT (datetime('now')),
      word_count  INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS editor_snapshots (
      project_path TEXT PRIMARY KEY,
      chapter_num  INTEGER NOT NULL,
      content      TEXT NOT NULL,
      cursor_pos   INTEGER,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Seed default settings if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM app_settings').get().c;
  if (count === 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)');
    const defaults = [
      ['api_key', ''],
      ['api_base_url', 'https://api.deepseek.com/v1'],
      ['api_model', 'deepseek-chat'],
      ['ui_language', 'zh'],
      ['theme', 'dark'],
      ['editor_font_size', '17'],
      ['editor_font_family', "'Noto Serif SC', 'Source Han Serif SC', 'STSong', Georgia, serif"],
      ['auto_save_interval', '30'],
      ['backup_enabled', 'true'],
      ['accent_color', '#c9a96e'],
    ];
    const tx = db.transaction(() => {
      for (const [k, v] of defaults) insert.run(k, v);
    });
    tx();
  }
}

// ─── Project DB Management ───
const projectConnections = new Map();

function getProjectDbPath(name) {
  return path.join(PROJECTS_DIR, `${name}.mythpen.db`);
}

function openProjectDb(filePath) {
  if (projectConnections.has(filePath)) {
    return projectConnections.get(filePath);
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrateProject(db);
  projectConnections.set(filePath, db);
  return db;
}

function closeProjectDb(filePath) {
  if (projectConnections.has(filePath)) {
    projectConnections.get(filePath).close();
    projectConnections.delete(filePath);
  }
}

function getProjectDb(name) {
  return openProjectDb(getProjectDbPath(name));
}

function migrateProject(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS volumes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      sort_order INTEGER NOT NULL,
      title     TEXT NOT NULL,
      summary   TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chapters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      volume_id   INTEGER REFERENCES volumes(id) ON DELETE CASCADE,
      num         INTEGER NOT NULL,
      title       TEXT NOT NULL,
      outline     TEXT DEFAULT '',
      content     TEXT DEFAULT '',
      summary     TEXT DEFAULT '',
      word_count  INTEGER DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','writing','review','accepted')),
      cognitive_frame   TEXT DEFAULT '',
      emotional_anchor  TEXT DEFAULT '',
      world_texture     TEXT DEFAULT '',
      concrete_mystery  TEXT DEFAULT '',
      interpersonal_tension TEXT DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(volume_id, num)
    );
    CREATE TABLE IF NOT EXISTS characters (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      age         TEXT DEFAULT '',
      gender      TEXT DEFAULT '',
      appearance  TEXT DEFAULT '',
      personality TEXT DEFAULT '',
      background  TEXT DEFAULT '',
      motivation  TEXT DEFAULT '',
      arc         TEXT DEFAULT '',
      ext_markers TEXT DEFAULT '',
      avatar      TEXT DEFAULT '',
      notes       TEXT DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chapter_characters (
      chapter_id  INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
      character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
      role        TEXT DEFAULT 'appears' CHECK (role IN ('appears','speaks','pov','mentioned')),
      PRIMARY KEY (chapter_id, character_id)
    );
    CREATE TABLE IF NOT EXISTS world_entries (
      id          TEXT PRIMARY KEY,
      category    TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags        TEXT DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS project_genres (
      genre TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS sidebar_items (
      id          TEXT PRIMARY KEY,
      label_key   TEXT NOT NULL,
      icon        TEXT NOT NULL,
      category    TEXT NOT NULL CHECK (category IN ('universal','genre','optional')),
      genres      TEXT DEFAULT '',
      sort_order  INTEGER NOT NULL,
      route       TEXT NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS foreshadows (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      description     TEXT DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'planted' CHECK (status IN ('planted','progressing','resolved','abandoned')),
      planted_chapter_id    INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
      expected_resolve_chapter INTEGER,
      resolved_chapter_id   INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
      priority        TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS memories (
      id          TEXT PRIMARY KEY,
      category    TEXT NOT NULL CHECK (category IN ('character','location','item','event','promise','other')),
      content     TEXT NOT NULL,
      source_chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS character_relations (
      id              TEXT PRIMARY KEY,
      character_a_id  TEXT REFERENCES characters(id) ON DELETE CASCADE,
      character_b_id  TEXT REFERENCES characters(id) ON DELETE CASCADE,
      relation_type   TEXT NOT NULL,
      description     TEXT DEFAULT '',
      intensity       INTEGER DEFAULT 3,
      started_at      TEXT DEFAULT '',
      ended_at        TEXT DEFAULT '',
      layout_x        REAL,
      layout_y        REAL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS science_entries (
      id          TEXT PRIMARY KEY,
      label       TEXT NOT NULL CHECK (label IN ('known','extrapolation','hypothesis')),
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      "references"  TEXT DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS timeline_events (
      id          TEXT PRIMARY KEY,
      year        TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      importance  INTEGER DEFAULT 3,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS clue_board (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      description     TEXT DEFAULT '',
      kind            TEXT DEFAULT '' CHECK (kind IN ('clue','red-herring','deduction','question')),
      related_chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
      resolved        INTEGER NOT NULL DEFAULT 0,
      resolved_at     TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS setting_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id   TEXT NOT NULL,
      field_name  TEXT NOT NULL,
      old_value   TEXT,
      new_value   TEXT,
      changed_by  TEXT DEFAULT 'user',
      changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS token_usage (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      task_name       TEXT NOT NULL,
      chapter_num     INTEGER,
      input_tokens    INTEGER NOT NULL DEFAULT 0,
      output_tokens   INTEGER NOT NULL DEFAULT 0,
      context_tokens  INTEGER,
      model           TEXT DEFAULT '',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT '新对话',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK (role IN ('user', 'ai', 'system')),
      content     TEXT NOT NULL,
      tool_calls  TEXT DEFAULT '[]',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(status);
    CREATE INDEX IF NOT EXISTS idx_chapters_volume ON chapters(volume_id, num);
    CREATE INDEX IF NOT EXISTS idx_chapters_order ON chapters(num);
    CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
    CREATE INDEX IF NOT EXISTS idx_foreshadows_status ON foreshadows(status);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  `);

  // Migrate existing chat_messages: add session_id column if missing
  try {
    db.exec("ALTER TABLE chat_messages ADD COLUMN session_id TEXT NOT NULL DEFAULT '' REFERENCES chat_sessions(id) ON DELETE CASCADE");
  } catch(e) {
    // column already exists — ignore
  }
  // Index on session_id (must be after ALTER TABLE for existing DBs)
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)");
  } catch(e) {
    // ignore
  }
}

// ─── Helpers ───
function rowToObject(row) {
  if (!row) return null;
  return { ...row };
}

function rowsToArray(rows) {
  return rows || [];
}

// ─── Query wrappers ───
function dbQuery(sql, params = []) {
  const db = getConfigDb();
  const rows = db.prepare(sql).all(...params);
  return rows;
}

function dbGet(sql, params = []) {
  const db = getConfigDb();
  return db.prepare(sql).get(...params) || null;
}

function dbExecute(sql, params = []) {
  const db = getConfigDb();
  const result = db.prepare(sql).run(...params);
  return result.changes;
}

// ─── Project-specific queries ───
function projectQuery(projectName, sql, params = []) {
  const db = getProjectDb(projectName);
  return db.prepare(sql).all(...params);
}

function projectGet(projectName, sql, params = []) {
  const db = getProjectDb(projectName);
  return db.prepare(sql).get(...params) || null;
}

function projectExecute(projectName, sql, params = []) {
  const db = getProjectDb(projectName);
  const result = db.prepare(sql).run(...params);
  return result.changes;
}

function projectTransaction(projectName, fn) {
  const db = getProjectDb(projectName);
  return db.transaction(fn)();
}

module.exports = {
  getConfigDb,
  getProjectDb,
  getProjectDbPath,
  openProjectDb,
  closeProjectDb,
  dbQuery,
  dbGet,
  dbExecute,
  projectQuery,
  projectGet,
  projectExecute,
  projectTransaction,
};
