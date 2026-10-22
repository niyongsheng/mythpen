// ─── SQL.js-based database layer (replaces better-sqlite3) ───
// Uses sql.js (pure JS/WASM SQLite) instead of better-sqlite3 (native addon)
// so that bun build --compile can produce a standalone binary without native .node files.

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const DB_DIR = path.join(require('os').homedir(), '.mythpen');
const CONFIG_DB = path.join(DB_DIR, 'config.db');
const PROJECTS_DIR = path.join(DB_DIR, 'projects');

// ─── Ensure directories ───
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

let SQL;         // set by initDatabase()
let configDb;    // wrapped config database

// ═══════════════════════════════════════════════════════════════
// Schema versioning — bump these when adding migrations
// ═══════════════════════════════════════════════════════════════

const CONFIG_SCHEMA_VERSION = 2;
const PROJECT_SCHEMA_VERSION = 3;

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

// sql.js requires null instead of undefined for positional bindings.
function _bindArgs(params) {
  if (params.length === 0) return null;
  return params.map((v) => (v === undefined ? null : v));
}

/**
 * Wrap a raw sql.js Database instance so it quacks like better-sqlite3.
 * Supports: .pragma(), .prepare(sql).{all,get,run}(), .exec(), .run(), .transaction(), .close()
 *
 * IMPORTANT: Each .run()/.all()/.get() creates its own fresh prepared statement
 * because sql.js's db.export() (called by _flushDb) invalidates ALL existing statements.
 * The statement is freed before _flushDb() so export() never hits a stale handle.
 */
const DB_FLUSH_DELAY = 250; // ms — batch writes up to this interval

function _wrapDb(db, filePath) {
  let dirty = false;
  let flushTimer = null;

  function _flushSync() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!dirty) return;
    dirty = false;
    _flushDb(db, filePath);
  }

  function _scheduleFlush() {
    dirty = true;
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        _flushSync();
      }, DB_FLUSH_DELAY);
    }
  }

  return {
    _db: db,
    _path: filePath,

    pragma(sql) {
      db.run('PRAGMA ' + sql);
    },

    prepare(sql) {
      return {
        all(...params) {
          const args = _bindArgs(params);
          const s = db.prepare(sql);
          if (args) s.bind(args);
          const rows = [];
          while (s.step()) rows.push(s.getAsObject());
          s.free();
          return rows;
        },
        get(...params) {
          const args = _bindArgs(params);
          const s = db.prepare(sql);
          if (args) s.bind(args);
          let row = null;
          if (s.step()) row = s.getAsObject();
          s.free();
          return row;
        },
        run(...params) {
          const args = _bindArgs(params);
          const s = db.prepare(sql);
          if (args) s.bind(args);
          s.step();
          const changes = db.getRowsModified();
          s.free();
          // sql.js does not expose lastInsertRowid on statements; query it so
          // callers can use the id returned by INSERT statements.
          let lastInsertRowid = null;
          try {
            const result = db.exec('SELECT last_insert_rowid() AS id');
            lastInsertRowid = result[0]?.values?.[0]?.[0] ?? null;
          } catch {
            /* ignore */
          }
          _scheduleFlush();
          return { changes, lastInsertRowid };
        },
      };
    },

    exec(sql) {
      const results = db.exec(sql);
      _scheduleFlush();
      return results;
    },

    run(sql, params) {
      db.run(sql, params || []);
      _scheduleFlush();
    },

    transaction(fn) {
      return (...args) => {
        db.run('BEGIN');
        try {
          const result = fn(...args);
          db.run('COMMIT');
          _flushSync(); // flush immediately after commit for data safety
          return result;
        } catch (e) {
          db.run('ROLLBACK');
          throw e;
        }
      };
    },

    flush() {
      _flushSync();
    },

    close() {
      _flushSync();
      db.close();
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Initialisation (MUST be called before any other db function)
// ═══════════════════════════════════════════════════════════════

async function initDatabase() {
  console.log('[DB] Initialising database...');
  console.log('[DB] DB_DIR:', DB_DIR, '| CONFIG_DB:', CONFIG_DB);
  const t0 = Date.now();

  // ─── Load sql.js library ───
  const initSqlJs = require('sql.js');
  console.log('[DB] sql.js library loaded');

  // ─── Load sql-wasm.wasm ───
  // In bun --compile binaries there's no node_modules, so sql.js cannot
  // locate its WASM file via module resolution. We must provide the WASM
  // binary explicitly via initSqlJs({ wasmBinary }).
  //
  // Multiple strategies tried in order:
  //   1. base64-embedded module (works in both bun dev and --compile)
  //   2. fs.readFileSync relative to __dirname (dev mode)
  //   3. fs.readFileSync relative to CWD (fallback)
  let wasmBinary;

  // Strategy 1: base64-embedded WASM (prevents bun --assets bug in 1.3.14)
  try {
    const { getWasmBinary } = require('./wasm-binary');
    wasmBinary = getWasmBinary();
    console.log('[DB] WASM loaded via base64 embedded module');
  } catch (e) {
    console.log('[DB] Embedded WASM module not available:', e.message);
  }

  // Strategy 2: fs.readFileSync relative to this file (dev mode, file on disk)
  if (!wasmBinary) {
    try {
      const wasmPath = path.join(__dirname, 'sql-wasm.wasm');
      if (fs.existsSync(wasmPath)) {
        wasmBinary = fs.readFileSync(wasmPath);
        console.log('[DB] WASM loaded from:', wasmPath);
      }
    } catch {
      // strategy 2 failed
    }
  }

  // Strategy 3: fs.readFileSync from CWD (fallback for bun compiled binary)
  if (!wasmBinary) {
    try {
      const wasmPath = path.join(process.cwd(), 'server', 'sql-wasm.wasm');
      if (fs.existsSync(wasmPath)) {
        wasmBinary = fs.readFileSync(wasmPath);
        console.log('[DB] WASM loaded from:', wasmPath);
      }
    } catch {
      // strategy 3 failed
    }
  }

  if (!wasmBinary) {
    console.log('[DB] WASM not found via any strategy — initSqlJs will use its own loader');
  }

  // ─── Init sql.js runtime ───
  console.log('[DB] Calling initSqlJs()...');
  SQL = await initSqlJs({ wasmBinary });
  console.log('[DB] initSqlJs() OK');

  // ─── Open / create config database ───
  console.log('[DB] Opening config database...');
  configDb = _openConfig();
  console.log('[DB] Config database ready, schema version:', CONFIG_SCHEMA_VERSION);

  const t1 = Date.now();
  console.log(`[DB] Database initialised in ${t1 - t0}ms`);
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

// ═══════════════════════════════════════════════════════════════
// Generic migration runner
// ═══════════════════════════════════════════════════════════════

function runMigrations(db, migrations, targetVersion, getVersionFn, setVersionFn) {
  let currentVersion = getVersionFn(db);
  if (currentVersion >= targetVersion) return;
  for (let v = currentVersion; v < targetVersion; v++) {
    if (migrations[v]) migrations[v](db);
    setVersionFn(db, v + 1);
  }
}

// ═══════════════════════════════════════════════════════════════
// Config DB migrations
// ═══════════════════════════════════════════════════════════════

// Single source of truth for settings: defaults, coercion and validation.
const SETTING_SCHEMA = {
  api_key: { type: 'string', default: '' },
  api_base_url: { type: 'string', default: 'https://api.deepseek.com' },
  api_model: { type: 'string', default: 'deepseek-flash' },
  api_type: { type: 'enum', values: ['', 'openai', 'claude'], default: '' },
  max_output_tokens: { type: 'number', default: 8192, min: 1024, max: 131072 },
  send_temperature: { type: 'boolean', default: true },
  ui_language: { type: 'enum', values: ['zh', 'en'], default: 'zh' },
  theme: { type: 'enum', values: ['dark', 'light'], default: 'dark' },
  editor_font_size: { type: 'number', default: 17, min: 14, max: 24 },
  editor_font_family: {
    type: 'string',
    default: "'Noto Serif SC', 'Source Han Serif SC', 'STSong', Georgia, serif",
  },
  auto_save_interval: { type: 'number', default: 30, min: 0, max: 3600 },
  backup_enabled: { type: 'boolean', default: true },
  accent_color: { type: 'string', default: '#c9a96e' },
};

const DEFAULT_APP_SETTINGS = Object.fromEntries(
  Object.entries(SETTING_SCHEMA).map(([key, schema]) => [key, String(schema.default)]),
);

/** Coerce and validate a setting value; undefined means "reject". */
function normalizeSetting(key, value) {
  const schema = SETTING_SCHEMA[key];
  if (!schema) return undefined;
  if (schema.type === 'boolean') {
    if (value === true || value === 'true' || value === 1 || value === '1') return 'true';
    if (value === false || value === 'false' || value === 0 || value === '0') return 'false';
    return undefined;
  }
  if (schema.type === 'number') {
    const num = Number(value);
    if (!Number.isFinite(num)) return undefined;
    return String(Math.min(Math.max(num, schema.min), schema.max));
  }
  if (schema.type === 'enum') {
    return schema.values.includes(value) ? String(value) : undefined;
  }
  return String(value ?? '');
}

const configMigrations = [
  // v0 → v1: initial schema + defaults
  (db) => {
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
      const innerTx = db.transaction(() => {
        for (const [k, v] of Object.entries(DEFAULT_APP_SETTINGS)) insert.run(k, v);
      });
      innerTx();
    }
  },
  // v1 → v2: project names are unique registry keys; file paths are opaque.
  (db) => {
    db.exec(`
      DELETE FROM recent_projects
      WHERE rowid NOT IN (SELECT MAX(rowid) FROM recent_projects GROUP BY name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_recent_projects_name ON recent_projects(name);
    `);
  },
];

function makeVersionGetter(tableName) {
  return (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    try {
      const row = db.prepare(`SELECT value FROM ${tableName} WHERE key = 'schema_version'`).get();
      return row ? parseInt(row.value, 10) || 0 : 0;
    } catch { return 0; }
  };
}

function makeVersionSetter(tableName) {
  return (db, version) => {
    db.prepare(`INSERT OR REPLACE INTO ${tableName} (key, value) VALUES ('schema_version', ?)`).run(String(version));
  };
}

const getConfigVersion = makeVersionGetter('app_settings');
const setConfigVersion = makeVersionSetter('app_settings');

function migrateConfig(db) {
  runMigrations(db, configMigrations, CONFIG_SCHEMA_VERSION, getConfigVersion, setConfigVersion);
}

// ═══════════════════════════════════════════════════════════════
// Project DB Management
// ═══════════════════════════════════════════════════════════════

const projectConnections = new Map();
// Bound the number of project databases held in memory. Least-recently-used
// connections are flushed and closed; opening one again reloads it from disk.
const MAX_OPEN_PROJECTS = 8;

function projectNotFound(name) {
  const err = new Error(`项目"${name}"不存在`);
  err.status = 404;
  err.code = 'PROJECT_NOT_FOUND';
  err.recoverable = true;
  return err;
}

/** Resolve a registered project name to its stable file path. */
function getProjectDbPath(name) {
  const row = dbGet('SELECT file_path FROM recent_projects WHERE name = ?', [name]);
  if (!row) throw projectNotFound(name);
  return row.file_path;
}

/** Generate an opaque path for a new project; the display name is not a filename. */
function newProjectFilePath() {
  return path.join(PROJECTS_DIR, `${randomUUID()}.mythpen.db`);
}

function isProjectOpen(filePath) {
  return projectConnections.has(filePath);
}

function openProjectDb(filePath) {
  const existing = projectConnections.get(filePath);
  if (existing) {
    // Refresh LRU position.
    projectConnections.delete(filePath);
    projectConnections.set(filePath, existing);
    return existing;
  }
  const db = _loadDb(filePath);
  db.run('PRAGMA foreign_keys = ON');
  const wrapped = _wrapDb(db, filePath);
  migrateProject(wrapped);
  projectConnections.set(filePath, wrapped);
  if (projectConnections.size > MAX_OPEN_PROJECTS) {
    const [oldestPath, oldest] = projectConnections.entries().next().value;
    projectConnections.delete(oldestPath);
    try {
      oldest.close();
    } catch (e) {
      console.warn(`[DB] Failed to close idle project "${oldestPath}":`, e.message);
    }
  }
  return wrapped;
}

function closeProjectDb(filePath) {
  if (projectConnections.has(filePath)) {
    projectConnections.get(filePath).close();
    projectConnections.delete(filePath);
  }
}

function getProjectDb(name) {
  const filePath = getProjectDbPath(name);
  // Reads must not create projects. Only explicit create/import paths call
  // openProjectDb() on a path that does not exist yet.
  if (!projectConnections.has(filePath) && !fs.existsSync(filePath)) throw projectNotFound(name);
  return openProjectDb(filePath);
}

// ═══════════════════════════════════════════════════════════════
// Project DB migrations
// ═══════════════════════════════════════════════════════════════

const projectMigrations = [
  // v0 → v1: initial schema
  (db) => {
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
  },
  // v1 → v2: add session_id column to chat_messages (legacy DBs) + index
  (db) => {
    try {
      db.exec("ALTER TABLE chat_messages ADD COLUMN session_id TEXT NOT NULL DEFAULT '' REFERENCES chat_sessions(id) ON DELETE CASCADE");
    } catch (e) {
      // column already exists — ignore
    }
    try {
      db.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)");
    } catch (e) {
      console.warn("[DB] Migration v1→v2 (index) skipped:", e.message)
    }
  },
  // v2 → v3: chapter numbers are global across volumes. Legacy projects could
  // repeat 1..N per volume; renumber them in reading order, remap the only
  // num-based reference (foreshadow expected chapter), then enforce uniqueness.
  (db) => {
    const duplicate = db
      .prepare('SELECT num FROM chapters GROUP BY num HAVING COUNT(*) > 1 LIMIT 1')
      .get();
    if (duplicate) {
      // Keep a restorable copy before rewriting chapter numbers.
      const filePath = db._path;
      if (filePath && fs.existsSync(filePath)) {
        try {
          db.flush();
          const backup = `${filePath}.pre-v3-${Date.now()}.bak`;
          fs.copyFileSync(filePath, backup);
          console.warn(`[DB] Chapter numbers duplicated; backup written to ${backup}`);
        } catch (e) {
          console.warn('[DB] Failed to back up project before renumbering:', e.message);
        }
      }
      db.transaction(() => {
        const rows = db.prepare('SELECT id, num FROM chapters ORDER BY num, id').all();
        const remap = new Map();
        rows.forEach((row, index) => {
          if (!remap.has(row.num)) remap.set(row.num, index + 1);
        });
        // Two-phase renumber avoids transient collisions with the legacy
        // UNIQUE(volume_id, num) constraint.
        const parkChapter = db.prepare('UPDATE chapters SET num = -id WHERE id = ?');
        rows.forEach((row) => parkChapter.run(row.id));
        const updateChapter = db.prepare('UPDATE chapters SET num = ? WHERE id = ?');
        rows.forEach((row, index) => updateChapter.run(index + 1, row.id));
        const updateForeshadow = db.prepare(
          'UPDATE foreshadows SET expected_resolve_chapter = ? WHERE expected_resolve_chapter = ?',
        );
        for (const [oldNum, newNum] of remap) {
          if (oldNum !== newNum) updateForeshadow.run(newNum, oldNum);
        }
      })();
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_num_unique ON chapters(num)');
  },
];

const getProjectVersion = makeVersionGetter('project_meta');
const setProjectVersion = makeVersionSetter('project_meta');

function migrateProject(db) {
  runMigrations(db, projectMigrations, PROJECT_SCHEMA_VERSION, getProjectVersion, setProjectVersion);
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

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

/** Word count used for chapters and export totals (whitespace excluded). */
function countWords(text) {
  return String(text ?? '').replace(/\s/g, '').length;
}

function recalculateWordCount(projectName) {
  const total = projectGet(projectName, 'SELECT SUM(word_count) as total FROM chapters')?.total || 0;
  projectExecute(projectName, "UPDATE project_meta SET value = ? WHERE key = 'word_count'", [String(total)]);
  projectExecute(projectName, "UPDATE project_meta SET value = ? WHERE key = 'updated_at'", [new Date().toISOString()]);
}

// Project names become filenames, so every entry point must apply the same rules.
const INVALID_NAME_RE = /[\\/:*?"<>|\u0000-\u001f]/;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Returns a user-facing error message, or null when the name is valid. */
function validateProjectName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return '项目名称不能为空';
  if (trimmed.length > 80) return '项目名称不能超过 80 个字符';
  if (trimmed === '.' || trimmed === '..') return '项目名称不合法';
  if (trimmed.startsWith('.')) return '项目名称不能以点开头';
  if (INVALID_NAME_RE.test(trimmed)) return '项目名称不能包含 \\ / : * ? " < > | 等字符';
  if (WINDOWS_RESERVED_RE.test(trimmed)) return '项目名称不能使用系统保留名';
  return null;
}

/** Write the default project metadata, with per-path overrides. */
function initProjectMeta(projectName, overrides = {}) {
  const now = new Date().toISOString();
  const meta = {
    name: projectName,
    description: '',
    mode: 'medium-novel',
    language: 'zh',
    version: '1',
    created_at: now,
    updated_at: now,
    word_count: '0',
    author_name: '佚名',
    workflow_phase: 'idea',
    ...overrides,
  };
  const insert = getProjectDb(projectName).prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(meta)) insert.run(key, value);
}

function initProjectGenres(projectName, genres) {
  const insert = getProjectDb(projectName).prepare('INSERT OR IGNORE INTO project_genres (genre) VALUES (?)');
  for (const genre of genres) insert.run(genre);
}

/** Record AI token usage; never let accounting failures break a request. */
function recordTokenUsage(projectName, taskName, usage, model) {
  try {
    projectExecute(
      projectName,
      'INSERT INTO token_usage (task_name, input_tokens, output_tokens, model) VALUES (?, ?, ?, ?)',
      [taskName, usage?.inputTokens || 0, usage?.outputTokens || 0, model],
    );
  } catch (e) {
    console.warn(`[Token Usage] Failed to record ${taskName}:`, e.message);
  }
}

function registerRecentProject(name, filePath, wordCount = 0) {
  const now = new Date().toISOString();
  const existing = dbGet('SELECT id FROM recent_projects WHERE name = ?', [name]);
  if (existing) {
    dbExecute(
      'UPDATE recent_projects SET file_path = ?, last_opened = ?, word_count = ? WHERE id = ?',
      [filePath, now, wordCount, existing.id],
    );
    return existing.id;
  }
  const id = randomUUID();
  dbExecute(
    'INSERT INTO recent_projects (id, name, file_path, last_opened, word_count) VALUES (?, ?, ?, ?, ?)',
    [id, name, filePath, now, wordCount],
  );
  return id;
}

/** The volume continuation chapters should land in (the last one). */
function lastVolumeId(projectName) {
  return projectGet(projectName, 'SELECT id FROM volumes ORDER BY sort_order DESC, id DESC LIMIT 1')?.id ?? 1;
}

/** Globally unique chapter number used by the num-only chapter APIs. */
function nextChapterNumber(projectName) {
  return (projectGet(projectName, 'SELECT MAX(num) as mx FROM chapters')?.mx || 0) + 1;
}

function getCoverDir(projectName) {
  return path.join(PROJECTS_DIR, projectName);
}

function findCoverPath(projectName) {
  const coverDir = getCoverDir(projectName);
  const exts = ['png', 'jpg', 'webp', 'gif'];
  for (const ext of exts) {
    const p = path.join(coverDir, `cover.${ext}`);
    if (fs.existsSync(p)) return p;
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
  newProjectFilePath,
  isProjectOpen,
  openProjectDb,
  closeProjectDb,
  dbQuery,
  dbGet,
  dbExecute,
  projectQuery,
  projectGet,
  projectExecute,
  projectTransaction,
  countWords,
  recalculateWordCount,
  recordTokenUsage,
  initProjectMeta,
  initProjectGenres,
  validateProjectName,
  registerRecentProject,
  lastVolumeId,
  nextChapterNumber,
  getCoverDir,
  findCoverPath,
  MIME_TO_EXT,
  EXT_TO_MIME,
  DEFAULT_APP_SETTINGS,
  SETTING_SCHEMA,
  normalizeSetting,
};
