// ─── SQL.js-based database layer (replaces better-sqlite3) ───
// Uses sql.js (pure JS/WASM SQLite) instead of better-sqlite3 (native addon)
// so that bun build --compile can produce a standalone binary without native .node files.

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { normalizeGenre } = require('./genres');

// MYTHPEN_DATA_DIR lets tests run against an isolated data root. Production
// (including the Tauri sidecar) leaves it unset and keeps the historical path.
const DATA_DIR = process.env.MYTHPEN_DATA_DIR
  ? path.resolve(process.env.MYTHPEN_DATA_DIR)
  : path.join(require('os').homedir(), '.mythpen');
const DB_DIR = DATA_DIR;
const CONFIG_DB = path.join(DB_DIR, 'config.db');
const PROJECTS_DIR = path.join(DB_DIR, 'projects');
const EXPORTS_DIR = path.join(DB_DIR, 'exports');

// ─── Ensure directories ───
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

let SQL;         // set by initDatabase()
let configDb;    // wrapped config database

// ═══════════════════════════════════════════════════════════════
// Schema versioning — bump these when adding migrations
// ═══════════════════════════════════════════════════════════════

const CONFIG_SCHEMA_VERSION = 3;
const PROJECT_SCHEMA_VERSION = 13;

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

/**
 * Write the in-memory database atomically. A crash mid-write must never leave
 * a truncated file behind, so write a sibling temp file then rename over the
 * target (atomic on the same filesystem).
 */
function _flushDb(db, filePath) {
  const data = Buffer.from(db.export());
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, data);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
    throw err;
  }
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
  let lastFlushError = null;

  function _flushSync(throwOnError = false) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!dirty) {
      if (throwOnError && lastFlushError) throw lastFlushError;
      return;
    }
    try {
      _flushDb(db, filePath);
      dirty = false;
      lastFlushError = null;
    } catch (err) {
      lastFlushError = err;
      if (throwOnError) throw err;
      console.error(`[DB] Flush failed for ${filePath}:`, err.message);
    }
  }

  function _scheduleFlush() {
    dirty = true;
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        _flushSync(false);
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
      _flushSync(true);
    },

    getLastFlushError() {
      return lastFlushError;
    },

    close() {
      // Never let a failed final flush prevent the handle from closing.
      _flushSync(false);
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

function schemaTooNewError(currentVersion, targetVersion) {
  const err = new Error(
    `项目文件由更新版本的 Mythpen 创建（数据版本 ${currentVersion}，当前应用支持 ${targetVersion}），请升级 Mythpen 后再打开。`,
  );
  err.status = 409;
  err.code = 'PROJECT_SCHEMA_TOO_NEW';
  err.recoverable = true;
  err.currentVersion = currentVersion;
  err.targetVersion = targetVersion;
  return err;
}

/**
 * Read a project DB's schema version without creating any table or scheduling
 * a write. Used before migrations so a newer project DB is rejected untouched.
 */
function peekProjectSchemaVersion(rawDb) {
  let stmt;
  try {
    stmt = rawDb.prepare("SELECT value FROM project_meta WHERE key = 'schema_version'");
    if (!stmt.step()) return 0;
    const row = stmt.getAsObject();
    return parseInt(row.value, 10) || 0;
  } catch {
    // project_meta does not exist yet (brand-new or non-Mythpen DB).
    return 0;
  } finally {
    try { stmt?.free(); } catch { /* ignore */ }
  }
}

function runMigrations(db, migrations, targetVersion, getVersionFn, setVersionFn) {
  const currentVersion = getVersionFn(db);
  if (currentVersion > targetVersion) throw schemaTooNewError(currentVersion, targetVersion);
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
  ui_language: { type: 'enum', values: ['zh', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'es', 'ru', 'de', 'it', 'pt', 'system'], default: 'system' },
  theme: { type: 'enum', values: ['dark', 'light', 'eyecare'], default: 'dark' },
  editor_font_size: { type: 'number', default: 17, min: 14, max: 24 },
  editor_font_family: {
    type: 'string',
    default: "'Noto Serif SC', 'Source Han Serif SC', 'STSong', Georgia, serif",
  },
  auto_save_interval: { type: 'number', default: 30, min: 0, max: 3600 },
  backup_enabled: { type: 'boolean', default: true },
  accent_color: { type: 'string', default: '#c9a96e' },
  anonymous_stats: { type: 'boolean', default: true },
};

const DEFAULT_APP_SETTINGS = Object.fromEntries(
  Object.entries(SETTING_SCHEMA).map(([key, schema]) => [key, String(schema.default)]),
);

// Thinking models (e.g. DeepSeek Flash) count reasoning tokens toward
// `max_tokens`. The historical 8192 default leaves too little room for the
// final answer or a tool call's JSON arguments, so give these models a larger
// default while keeping the conservative value for other providers.
const MODEL_MAX_OUTPUT_DEFAULTS = [
  { pattern: /^deepseek-(?:flash|v4)/i, tokens: 65536 },
];

function modelDefaultMaxOutputTokens(model) {
  const name = String(model || '');
  const match = MODEL_MAX_OUTPUT_DEFAULTS.find(entry => entry.pattern.test(name));
  return match ? match.tokens : Number(SETTING_SCHEMA.max_output_tokens.default);
}

/** Resolve the effective output budget; an explicit stored value wins. */
function resolveMaxOutputTokens(configured, model) {
  const value = Number(configured);
  if (Number.isFinite(value) && value > 0) return value;
  return modelDefaultMaxOutputTokens(model);
}

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
  // v2 → v3: DeepSeek Flash enables thinking by default, and reasoning tokens
  // count toward `max_tokens`. The old 8192 default is exhausted by thinking
  // before a long tool call (e.g. create_chapter) finishes writing its JSON
  // arguments. Drop the seeded value so the model-aware default applies; the
  // old seed is indistinguishable from an explicit 8192, which is harmless to
  // drop because non-thinking models resolve to the same 8192 anyway.
  (db) => {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'max_output_tokens'").get();
    if (row && Number(row.value) === Number(SETTING_SCHEMA.max_output_tokens.default)) {
      db.prepare("DELETE FROM app_settings WHERE key = 'max_output_tokens'").run();
    }
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

/** True when a project DB is app-managed under ~/.mythpen/projects. */
function isManagedProjectPath(filePath) {
  const resolved = path.resolve(filePath);
  const root = path.resolve(PROJECTS_DIR) + path.sep;
  if (process.platform === 'win32') {
    return resolved.toLowerCase().startsWith(root.toLowerCase());
  }
  return resolved.startsWith(root);
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
  // Refuse a DB produced by a newer app before creating tables or scheduling
  // any write; the file must stay byte-identical.
  const rawVersion = peekProjectSchemaVersion(db);
  if (rawVersion > PROJECT_SCHEMA_VERSION) {
    db.close();
    throw schemaTooNewError(rawVersion, PROJECT_SCHEMA_VERSION);
  }
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

/** Flush and close every open database; used on graceful shutdown. */
function closeAllDatabases() {
  if (configDb) {
    try {
      configDb.flush();
    } catch (e) {
      console.warn('[DB] Failed to flush config database:', e.message);
    }
  }
  for (const [filePath, projectDb] of projectConnections) {
    try {
      projectDb.close();
    } catch (e) {
      console.warn(`[DB] Failed to close project "${filePath}":`, e.message);
    }
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
        genre_beat        TEXT DEFAULT '',
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
        role        TEXT NOT NULL DEFAULT '',
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
      CREATE TABLE IF NOT EXISTS payoff_points (
        id              TEXT PRIMARY KEY,
        title           TEXT NOT NULL,
        type            TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('face-slap','flex','comeback','reveal','reward','revenge','breakthrough','other')),
        description     TEXT DEFAULT '',
        status          TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','building','released','abandoned')),
        intensity       INTEGER NOT NULL DEFAULT 3 CHECK (intensity BETWEEN 1 AND 5),
        setup_chapter   INTEGER,
        payoff_chapter  INTEGER,
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
      CREATE INDEX IF NOT EXISTS idx_payoff_points_status ON payoff_points(status);
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
  // v3 → v4: payoff points (爽点) board for power-fantasy projects.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS payoff_points (
        id              TEXT PRIMARY KEY,
        title           TEXT NOT NULL,
        type            TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('face-slap','flex','comeback','reveal','reward','revenge','breakthrough','other')),
        description     TEXT DEFAULT '',
        status          TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','building','released','abandoned')),
        intensity       INTEGER NOT NULL DEFAULT 3 CHECK (intensity BETWEEN 1 AND 5),
        setup_chapter   INTEGER,
        payoff_chapter  INTEGER,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_payoff_points_status ON payoff_points(status);
    `);
  },
  // v4 → v5: explicit character role, chosen by the author instead of being
  // inferred from list order / chapter count.
  (db) => {
    try {
      db.exec("ALTER TABLE characters ADD COLUMN role TEXT NOT NULL DEFAULT ''");
    } catch (e) {
      // column already exists — ignore
    }
  },
  // v5 → v6: 爽文 is a writing style, not a genre. The payoff board stays bound
  // to it through the power_fantasy flag, so existing projects keep their 爽点.
  (db) => {
    const hasPowerFantasy = db.prepare("SELECT 1 AS x FROM project_genres WHERE genre = 'power-fantasy'").get();
    if (!hasPowerFantasy) return;
    db.prepare("INSERT OR REPLACE INTO project_meta (key, value) VALUES ('power_fantasy', '1')").run();
    db.prepare("DELETE FROM project_genres WHERE genre = 'power-fantasy'").run();
  },
  // v6 → v7: writing styles are a multi-select dimension. Carry the legacy
  // single power_fantasy flag over as the power-fantasy style.
  (db) => {
    db.exec('CREATE TABLE IF NOT EXISTS project_styles (style TEXT PRIMARY KEY)');
    const legacy = db.prepare("SELECT value FROM project_meta WHERE key = 'power_fantasy'").get();
    if (legacy?.value === '1') {
      db.prepare("INSERT OR IGNORE INTO project_styles (style) VALUES ('power-fantasy')").run();
    }
  },
  // v7 → v8: settings become a genre-aware system with ordered categories
  // (境界/功法/门派/技能…) instead of sci-fi-only hardness labels.
  (db) => {
    try {
      db.exec("ALTER TABLE science_entries ADD COLUMN category TEXT NOT NULL DEFAULT ''");
    } catch (e) {
      // column already exists — ignore
    }
    try {
      db.exec('ALTER TABLE science_entries ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
    } catch (e) {
      // column already exists — ignore
    }
  },
  // v8 → v9: 轻松搞笑 + 快节奏 merged into 轻快; 悬疑推理 retired (suspense is
  // a genre, not a writing style). Clean up any rows created while testing.
  (db) => {
    const merged = db.prepare("SELECT 1 AS x FROM project_styles WHERE style IN ('comedy','fast-paced')").get();
    if (merged) {
      db.prepare("INSERT OR IGNORE INTO project_styles (style) VALUES ('light')").run();
    }
    db.prepare("DELETE FROM project_styles WHERE style IN ('comedy','fast-paced','mystery-suspense')").run();
  },
  // v9 → v10: characters are not always human (AI, aliens, robots, deities,
  // spirits, animals, collectives…). An explicit species/type keeps the
  // writing context from assuming every character behaves like a person.
  (db) => {
    try {
      db.exec("ALTER TABLE characters ADD COLUMN species TEXT DEFAULT ''");
    } catch (e) {
      // column already exists — ignore
    }
  },
  // v10 → v11: the five narrative dimensions describe texture, not the genre
  // engine. `genre_beat` records what the chapter advances in its own genre
  // (mystery clues, cultivation realm, romance relationship stage…).
  (db) => {
    try {
      db.exec("ALTER TABLE chapters ADD COLUMN genre_beat TEXT DEFAULT ''");
    } catch (e) {
      // column already exists — ignore
    }
  },
  // v11 → v12: `assets` carries binary resources (cover) inside the project
  // database. The file metadata below is historical; keep it so existing
  // projects migrate exactly once.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        key        TEXT PRIMARY KEY,
        mime       TEXT NOT NULL,
        data       BLOB NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('PRAGMA application_id = 0x4D595448');
    db.prepare("INSERT OR IGNORE INTO project_meta (key, value) VALUES ('format', ?)").run('mythpen-project');
    db.prepare("INSERT OR IGNORE INTO project_meta (key, value) VALUES ('format_version', ?)").run('1');
  },
  // v12 → v13: early builds could persist localized genre labels (科幻, 言情…)
  // instead of canonical slugs. Normalize them so labels, icons and
  // genre-aware pages/tools keep working.
  (db) => {
    const rows = db.prepare('SELECT genre FROM project_genres').all();
    for (const { genre } of rows) {
      const normalized = normalizeGenre(genre);
      if (!normalized || normalized === genre) continue;
      if (normalized === 'power-fantasy') {
        // 爽文 became a writing style; carry the legacy genre over.
        db.prepare("INSERT OR IGNORE INTO project_styles (style) VALUES ('power-fantasy')").run();
        db.prepare("INSERT OR REPLACE INTO project_meta (key, value) VALUES ('power_fantasy', '1')").run();
      } else {
        db.prepare('INSERT OR IGNORE INTO project_genres (genre) VALUES (?)').run(normalized);
      }
      db.prepare('DELETE FROM project_genres WHERE genre = ?').run(genre);
    }
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
    // Opaque per-project id for product analytics — carries no name or content.
    analytics_id: randomUUID(),
    ...overrides,
  };
  const insert = getProjectDb(projectName).prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(meta)) insert.run(key, value);
}

function initProjectGenres(projectName, genres) {
  const insert = getProjectDb(projectName).prepare('INSERT OR IGNORE INTO project_genres (genre) VALUES (?)');
  for (const genre of genres) insert.run(genre);
}

function initProjectStyles(projectName, styles) {
  const insert = getProjectDb(projectName).prepare('INSERT OR IGNORE INTO project_styles (style) VALUES (?)');
  for (const style of styles) insert.run(style);
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

/** Globally unique chapter number used by the num-only chapter APIs. */
function nextChapterNumber(projectName) {
  return (projectGet(projectName, 'SELECT MAX(num) as mx FROM chapters')?.mx || 0) + 1;
}

/**
 * Move a chapter to a new global chapter number, shifting the chapters it
 * passes one slot in the opposite direction.
 *
 * `num` is a UNIQUE column, not the primary key, so every ID-based reference
 * (chapter_characters, foreshadows planted/resolved, memories, clues) follows
 * the chapter automatically. The three num-based references are remapped in
 * the same transaction.
 *
 * Throws CHAPTER_NOT_FOUND / INVALID_POSITION / INVALID_VOLUME.
 */
function moveChapter(projectName, { chapterNum, position, volumeId }) {
  const from = Number(chapterNum);
  const to = Number(position);

  return projectTransaction(projectName, () => {
    const rows = projectQuery(projectName, 'SELECT id, num FROM chapters ORDER BY num');
    const moving = rows.find((row) => row.num === from);
    if (!moving) {
      const err = new Error(`章节 ${chapterNum} 不存在`);
      err.code = 'CHAPTER_NOT_FOUND';
      throw err;
    }
    const maxNum = rows.length ? rows[rows.length - 1].num : 0;
    if (!Number.isInteger(to) || to < 1 || to > maxNum) {
      const err = new Error(`目标章号 ${position} 超出范围：应为 1 到 ${maxNum}`);
      err.code = 'INVALID_POSITION';
      throw err;
    }
    if (volumeId !== undefined && !projectGet(projectName, 'SELECT id FROM volumes WHERE id = ?', [volumeId])) {
      const err = new Error(`卷 ${volumeId} 不存在`);
      err.code = 'INVALID_VOLUME';
      throw err;
    }

    if (from === to) {
      if (volumeId !== undefined) {
        projectExecute(
          projectName,
          "UPDATE chapters SET volume_id = ?, updated_at = datetime('now') WHERE id = ?",
          [volumeId, moving.id],
        );
      }
      return projectGet(projectName, 'SELECT * FROM chapters WHERE id = ?', [moving.id]);
    }

    // Chapters strictly between source and target shift one slot; the moved
    // chapter takes the target slot. Compute everything before mutating.
    const shift = from < to ? -1 : 1;
    const affected = rows.filter((row) => (
      from < to ? row.num > from && row.num <= to : row.num >= to && row.num < from
    ));
    const assignments = [moving, ...affected].map((row) => ({
      id: row.id,
      newNum: row.id === moving.id ? to : row.num + shift,
    }));

    // Two-phase shift: park affected rows at negative ids first, otherwise the
    // UNIQUE(num) index rejects a transient duplicate while rows move.
    for (const item of assignments) {
      projectExecute(projectName, 'UPDATE chapters SET num = -id WHERE id = ?', [item.id]);
    }
    for (const item of assignments) {
      projectExecute(projectName, 'UPDATE chapters SET num = ? WHERE id = ?', [item.newNum, item.id]);
    }
    if (volumeId !== undefined) {
      projectExecute(projectName, 'UPDATE chapters SET volume_id = ? WHERE id = ?', [volumeId, moving.id]);
    }
    projectExecute(projectName, "UPDATE chapters SET updated_at = datetime('now') WHERE id = ?", [moving.id]);

    // Remap numeric references with one CASE statement per column. Sequential
    // UPDATEs could cascade (e.g. 5→6 then 6→7); a single statement cannot.
    const remap = (table, column) => {
      const rangeCond = from < to
        ? `${column} > ? AND ${column} <= ?`
        : `${column} >= ? AND ${column} < ?`;
      // Forward moves use [from, to] for the range; backward moves use
      // [to, from] — passing [from, to] would make the backward range empty.
      const rangeParams = from < to ? [from, to] : [to, from];
      projectExecute(
        projectName,
        `UPDATE ${table} SET ${column} = CASE
           WHEN ${column} = ? THEN ?
           WHEN ${rangeCond} THEN ${column} + ?
           ELSE ${column} END`,
        [from, to, ...rangeParams, shift],
      );
    };
    remap('foreshadows', 'expected_resolve_chapter');
    remap('payoff_points', 'setup_chapter');
    remap('payoff_points', 'payoff_chapter');

    return projectGet(projectName, 'SELECT * FROM chapters WHERE id = ?', [moving.id]);
  });
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

// ─── Cover assets ───
// Documents keep the cover inside the file so sending one file carries it.
// Legacy projects still have ~/.mythpen/projects/<name>/cover.*; reads prefer
// the DB asset and fall back to disk, and writes keep both in sync.

function getCoverAsset(projectName) {
  try {
    const row = projectGet(projectName, "SELECT mime, data FROM assets WHERE key = 'cover'");
    if (!row?.data) return null;
    return { mime: row.mime || 'image/png', data: Buffer.from(row.data) };
  } catch {
    return null;
  }
}

function putCoverAsset(projectName, mime, data) {
  projectExecute(
    projectName,
    "INSERT OR REPLACE INTO assets (key, mime, data, updated_at) VALUES ('cover', ?, ?, datetime('now'))",
    [mime || 'image/png', data],
  );
}

function deleteCoverAsset(projectName) {
  try {
    projectExecute(projectName, "DELETE FROM assets WHERE key = 'cover'");
  } catch {
    /* assets table only exists after migration v12 */
  }
}

/** Cover bytes from the DB, or the legacy on-disk file for old projects. */
function getProjectCover(projectName) {
  const asset = getCoverAsset(projectName);
  if (asset) return asset;
  const legacyPath = findCoverPath(projectName);
  if (!legacyPath) return null;
  const ext = path.extname(legacyPath).slice(1).toLowerCase();
  return { mime: EXT_TO_MIME[ext] || 'image/png', data: fs.readFileSync(legacyPath) };
}

/** Store a newly uploaded cover in the DB and mirror it to the legacy path. */
function writeProjectCover(projectName, mime, data) {
  const normalizedMime = mime || 'image/png';
  const ext = MIME_TO_EXT[normalizedMime] || 'png';
  putCoverAsset(projectName, normalizedMime, data);
  const coverDir = getCoverDir(projectName);
  fs.mkdirSync(coverDir, { recursive: true });
  fs.writeFileSync(path.join(coverDir, `cover.${ext}`), data);
  projectExecute(projectName, "INSERT OR REPLACE INTO project_meta (key, value) VALUES ('cover_mime', ?)", [normalizedMime]);
  projectExecute(projectName, "INSERT OR REPLACE INTO project_meta (key, value) VALUES ('cover_ext', ?)", [ext]);
  return { ext, mime: normalizedMime };
}

function deleteProjectCover(projectName) {
  deleteCoverAsset(projectName);
  const legacyPath = findCoverPath(projectName);
  if (legacyPath) {
    try { fs.unlinkSync(legacyPath); } catch { /* ignore */ }
  }
  projectExecute(projectName, "DELETE FROM project_meta WHERE key IN ('cover_mime', 'cover_ext')");
}

module.exports = {
  initDatabase,
  getConfigDb,
  getProjectDb,
  getProjectDbPath,
  newProjectFilePath,
  isProjectOpen,
  isManagedProjectPath,
  openProjectDb,
  closeProjectDb,
  closeAllDatabases,
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
  initProjectStyles,
  validateProjectName,
  registerRecentProject,
  nextChapterNumber,
  moveChapter,
  getCoverDir,
  findCoverPath,
  getCoverAsset,
  putCoverAsset,
  deleteCoverAsset,
  getProjectCover,
  writeProjectCover,
  deleteProjectCover,
  MIME_TO_EXT,
  EXT_TO_MIME,
  DATA_DIR,
  PROJECTS_DIR,
  EXPORTS_DIR,
  PROJECT_SCHEMA_VERSION,
  schemaTooNewError,
  peekProjectSchemaVersion,
  DEFAULT_APP_SETTINGS,
  SETTING_SCHEMA,
  normalizeSetting,
  resolveMaxOutputTokens,
};
