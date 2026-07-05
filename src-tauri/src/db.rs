use rusqlite::{Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Get the Mythpen data directory (~/.mythpen)
pub fn data_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".mythpen")
}

/// Get the path to the config database
pub fn config_db_path() -> PathBuf {
    data_dir().join("config.db")
}

/// Get the path to a project database
pub fn project_db_path(name: &str) -> PathBuf {
    let dir = data_dir().join("projects");
    dir.join(format!("{}.mythpen.db", name))
}

/// Open the config database (creates if missing)
pub fn open_config_db() -> SqlResult<Connection> {
    let path = config_db_path();
    let conn = Connection::open(&path)?;
    // Create tables if needed
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS recent_projects (
            name       TEXT PRIMARY KEY,
            project_path TEXT NOT NULL,
            last_opened TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;
    Ok(conn)
}

/// Open a project database (creates if missing)
pub fn open_project_db(name: &str) -> SqlResult<Connection> {
    let path = project_db_path(name);
    // Ensure parent dir exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(&path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    // Create all project tables
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS project_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS project_genres (
            genre TEXT PRIMARY KEY
        );
        CREATE TABLE IF NOT EXISTS volumes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            sort_order INTEGER NOT NULL DEFAULT 1,
            title      TEXT NOT NULL DEFAULT '第一卷'
        );
        CREATE TABLE IF NOT EXISTS chapters (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            volume_id            INTEGER NOT NULL DEFAULT 1 REFERENCES volumes(id),
            num                  INTEGER NOT NULL DEFAULT 1,
            title                TEXT NOT NULL DEFAULT '新章节',
            content              TEXT NOT NULL DEFAULT '',
            outline              TEXT NOT NULL DEFAULT '',
            summary              TEXT NOT NULL DEFAULT '',
            word_count           INTEGER NOT NULL DEFAULT 0,
            status               TEXT NOT NULL DEFAULT 'pending',
            cognitive_frame      TEXT NOT NULL DEFAULT '',
            emotional_anchor     TEXT NOT NULL DEFAULT '',
            world_texture        TEXT NOT NULL DEFAULT '',
            concrete_mystery     TEXT NOT NULL DEFAULT '',
            interpersonal_tension TEXT NOT NULL DEFAULT '',
            created_at           TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS characters (
            id             TEXT PRIMARY KEY,
            name           TEXT NOT NULL,
            age            TEXT NOT NULL DEFAULT '',
            gender         TEXT NOT NULL DEFAULT '',
            appearance     TEXT NOT NULL DEFAULT '',
            personality    TEXT NOT NULL DEFAULT '',
            background     TEXT NOT NULL DEFAULT '',
            motivation     TEXT NOT NULL DEFAULT '',
            arc            TEXT NOT NULL DEFAULT '',
            title          TEXT NOT NULL DEFAULT '主角',
            role           TEXT NOT NULL DEFAULT 'protagonist',
            chapter_count  INTEGER NOT NULL DEFAULT 0,
            importance     INTEGER NOT NULL DEFAULT 5,
            created_at     TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS world_entries (
            id          TEXT PRIMARY KEY,
            category    TEXT NOT NULL DEFAULT 'location',
            name        TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            tags        TEXT NOT NULL DEFAULT '[]',
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS science_entries (
            id          TEXT PRIMARY KEY,
            category    TEXT NOT NULL DEFAULT 'known',
            title       TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS foreshadows (
            id                  TEXT PRIMARY KEY,
            title               TEXT NOT NULL,
            description         TEXT NOT NULL DEFAULT '',
            priority            TEXT NOT NULL DEFAULT '普通',
            status              TEXT NOT NULL DEFAULT '已埋',
            expected_resolve_chapter INTEGER,
            planted_chapter     INTEGER,
            resolved_chapter    INTEGER,
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS character_relations (
            id            TEXT PRIMARY KEY,
            source_id     TEXT NOT NULL REFERENCES characters(id),
            target_id     TEXT NOT NULL REFERENCES characters(id),
            relation_type TEXT NOT NULL DEFAULT 'neutral',
            description   TEXT NOT NULL DEFAULT '',
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS memories (
            id               TEXT PRIMARY KEY,
            content          TEXT NOT NULL,
            category         TEXT NOT NULL DEFAULT 'character',
            source_chapter_id INTEGER,
            relevance         REAL NOT NULL DEFAULT 0.5,
            embedding        TEXT,
            created_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS timeline_events (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            year        INTEGER NOT NULL DEFAULT 0,
            month       INTEGER NOT NULL DEFAULT 0,
            day         INTEGER NOT NULL DEFAULT 0,
            importance  INTEGER NOT NULL DEFAULT 5,
            category    TEXT NOT NULL DEFAULT 'event',
            status      TEXT NOT NULL DEFAULT 'draft',
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS token_usage (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            input_tokens  INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            model        TEXT NOT NULL DEFAULT '',
            cost         REAL NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;
    Ok(conn)
}

/// Update word count for a chapter
pub fn update_chapter_wordcount(conn: &Connection, chapter_id: i64) -> SqlResult<()> {
    let wc: i64 = conn
        .query_row(
            "SELECT COALESCE(LENGTH(content) - LENGTH(REPLACE(content, ' ', '')) + 1, 0) FROM chapters WHERE id = ?1",
            [chapter_id],
            |row| row.get(0),
        )?;
    conn.execute("UPDATE chapters SET word_count = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![wc, chapter_id])?;
    Ok(())
}

/// Get app setting value
pub fn get_setting(conn: &Connection, key: &str) -> SqlResult<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
    let mut rows = stmt.query_map([key], |row| row.get(0))?;
    match rows.next() {
        Some(Ok(val)) => Ok(Some(val)),
        _ => Ok(None),
    }
}

/// Set app setting value
pub fn set_setting(conn: &Connection, key: &str, value: &str) -> SqlResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )?;
    Ok(())
}
