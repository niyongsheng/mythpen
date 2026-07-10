// ─── SQL.js-based database layer (replaces better-sqlite3) ───
// Uses sql.js (pure JS/WASM SQLite) instead of better-sqlite3 (native addon)
// so that bun build --compile can produce a standalone binary without native .node files.

const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(require('os').homedir(), '.mythpen');
const CONFIG_DB = path.join(DB_DIR, 'config.db');
const PROJECTS_DIR = path.join(DB_DIR, 'projects');

// ─── Ensure directories ───
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

let SQL;         // set by initDatabase()
let configDb;    // wrapped config database

// ═══════════════════════════════════════════════════════════════
// sql.js wrapper — provides a better-sqlite3-compatible API
// ═══════════════════════════════════════════════════════════════

function _loadDb(filePath) {
  if (fs.existsSync(filePath)) {
    const buf = fs.readFileSync(filePath);
    return new SQL.Database(buf);
  }
  return new SQL.Database();
}

function _flushDb(db, filePath) {
  const data = db.export();
  fs.writeFileSync(filePath, Buffer.from(data));
}

// ─── Named-param helper ───
// sql.js 1.13+ has a bug where binding named params via object (e.g. {id:1})
// doesn't work — values come through as NULL.
// We work around it by converting @param / :param / $param → ? at the JS level.
const NAMED_PARAM_RE = /[$@:](\w+)/g;

function _normalizeParams(params) {
  if (params.length === 0) return null;
  // Single plain object = named params (e.g. {id: 1, name: 'test'})
  if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
    return { named: true, values: params[0] };
  }
  return { named: false, values: params };
}

function _buildSql(sqlText, bindMeta) {
  if (!bindMeta) return { sql: sqlText, args: null };
  if (!bindMeta.named) {
    // Positional params — convert undefined → null for sql.js compatibility
    return { sql: sqlText, args: bindMeta.values.map(v => v === undefined ? null : v) };
  }
  // Named params — convert to positional ? and collect values in SQL order
  const args = [];
  const converted = sqlText.replace(NAMED_PARAM_RE, (_, name) => {
    if (bindMeta.values[name] !== undefined) {
      args.push(bindMeta.values[name] === undefined ? null : bindMeta.values[name]);
      return '?';
    }
    // Keep unknown named params as-is (unbound → SQLite treats as NULL)
    return '@' + name;
  });
  return { sql: converted, args };
}

/**
 * Wrap a raw sql.js Database instance so it quacks like better-sqlite3.
 * Supports: .pragma(), .prepare(sql).{all,get,run}(), .exec(), .run(), .transaction(), .close()
 *
 * IMPORTANT: Each .run()/.all()/.get() creates its own fresh prepared statement
 * because sql.js's db.export() (called by _flushDb) invalidates ALL existing statements.
 * The statement is freed before _flushDb() so export() never hits a stale handle.
 */
function _wrapDb(db, filePath) {
  return {
    _db: db,
    _path: filePath,

    pragma(sql) {
      db.run('PRAGMA ' + sql);
    },

    prepare(sql) {
      return {
        all(...params) {
          const { sql: sql2, args } = _buildSql(sql, _normalizeParams(params));
          const s = db.prepare(sql2);
          if (args) s.bind(args);
          const rows = [];
          while (s.step()) rows.push(s.getAsObject());
          s.free();
          return rows;
        },
        get(...params) {
          const { sql: sql2, args } = _buildSql(sql, _normalizeParams(params));
          const s = db.prepare(sql2);
          if (args) s.bind(args);
          let row = null;
          if (s.step()) row = s.getAsObject();
          s.free();
          return row;
        },
        run(...params) {
          const { sql: sql2, args } = _buildSql(sql, _normalizeParams(params));
          const s = db.prepare(sql2);
          if (args) s.bind(args);
          s.step();
          const changes = db.getRowsModified();
          s.free();
          _flushDb(db, filePath);
          return { changes };
        },
      };
    },

    exec(sql) {
      const results = db.exec(sql);
      _flushDb(db, filePath);
      return results;
    },

    run(sql, params) {
      db.run(sql, params || []);
      _flushDb(db, filePath);
    },

    transaction(fn) {
      return (...args) => {
        db.run('BEGIN');
        try {
          const result = fn(...args);
          db.run('COMMIT');
          _flushDb(db, filePath);
          return result;
        } catch (e) {
          db.run('ROLLBACK');
          throw e;
        }
      };
    },

    close() {
      _flushDb(db, filePath);
      db.close();
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Initialisation (MUST be called before any other db function)
// ═══════════════════════════════════════════════════════════════

async function initDatabase() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();
  configDb = _openConfig();
  return true;
}

function _openConfig() {
  const db = _loadDb(CONFIG_DB);
  db.run('PRAGMA foreign_keys = ON');
  const wrapped = _wrapDb(db, CONFIG_DB);
  migrateConfig(wrapped);
  return wrapped;
}

// ═══════════════════════════════════════════════════════════════
// Config DB
// ═══════════════════════════════════════════════════════════════

function getConfigDb() {
  if (!configDb) throw new Error('Database not initialised – call initDatabase() first');
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
      ['api_model', 'deepseek-v4-flash'],
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

// ═══════════════════════════════════════════════════════════════
// Project DB Management
// ═══════════════════════════════════════════════════════════════

const projectConnections = new Map();

function getProjectDbPath(name) {
  return path.join(PROJECTS_DIR, `${name}.mythpen.db`);
}

function openProjectDb(filePath) {
  if (projectConnections.has(filePath)) {
    return projectConnections.get(filePath);
  }
  const db = _loadDb(filePath);
  db.run('PRAGMA foreign_keys = ON');
  const wrapped = _wrapDb(db, filePath);
  migrateProject(wrapped);
  projectConnections.set(filePath, wrapped);
  return wrapped;
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
    -- Seed default sidebar items
    INSERT OR IGNORE INTO sidebar_items (id, label_key, icon, category, genres, sort_order, route, enabled) VALUES
      ('dashboard',    'sidebar.dashboard',    'LayoutDashboard', 'universal', '',  1,  'page-dashboard',    1),
      ('characters',   'sidebar.characters',   'Users',           'universal', '',  2,  'page-characters',   1),
      ('world',        'sidebar.world',        'Globe',           'universal', '',  3,  'page-world',        1),
      ('science',      'sidebar.science',      'FlaskConical',    'genre', 'sci-fi',  4,  'page-science',      1),
      ('outline_page', 'sidebar.outline_page', 'ScrollText',      'universal', '',  5,  'page-outline',      1),
      ('foreshadow',   'sidebar.foreshadow',   'Link2',           'universal', '',  6,  'page-foreshadow',   1),
      ('memory',       'sidebar.memory',       'Brain',           'universal', '',  7,  'page-memory',       1),
      ('relations',    'sidebar.relations',    'HeartHandshake',  'universal', '',  8,  'page-relations',    1),
      ('timeline',     'sidebar.timeline',     'CalendarDays',    'universal', '',  9,  'page-timeline',     1),
      ('consistency',  'sidebar.consistency',  'ShieldCheck',     'universal', '',  10, 'page-consistency',  1),
      ('export',       'sidebar.export',       'Download',        'universal', '',  11, 'page-export',       1);
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
  } catch (e) {
    // column already exists — ignore
  }
  // Index on session_id (must be after ALTER TABLE for existing DBs)
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)");
  } catch (e) {
    // ignore
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function rowToObject(row) {
  if (!row) return null;
  return { ...row };
}

function rowsToArray(rows) {
  return rows || [];
}

// ═══════════════════════════════════════════════════════════════
// Config DB query wrappers
// ═══════════════════════════════════════════════════════════════

function dbQuery(sql, params = []) {
  const db = getConfigDb();
  return db.prepare(sql).all(...params);
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

// ═══════════════════════════════════════════════════════════════
// Project-specific query wrappers
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════

function recalculateWordCount(projectName) {
  const total = projectGet(projectName, 'SELECT SUM(word_count) as total FROM chapters')?.total || 0;
  projectExecute(projectName, "UPDATE project_meta SET value = ? WHERE key = 'word_count'", [String(total)]);
  projectExecute(projectName, "UPDATE project_meta SET value = ? WHERE key = 'updated_at'", [new Date().toISOString()]);
}

function getCoverDir(projectName) {
  return path.join(PROJECTS_DIR, projectName);
}

function findCoverPath(projectName) {
  const coverDir = getCoverDir(projectName);
  const exts = ['png', 'jpg', 'webp', 'gif'];
  for (const ext of exts) {
    const p = path.join(coverDir, `cover.${ext}`);
    if (require('fs').existsSync(p)) return p;
  }
  return null;
}

const MIME_TO_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const EXT_TO_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

module.exports = {
  initDatabase,
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
  recalculateWordCount,
  getCoverDir,
  findCoverPath,
  MIME_TO_EXT,
  EXT_TO_MIME,
};
