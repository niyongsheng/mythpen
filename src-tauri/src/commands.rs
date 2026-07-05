use crate::db;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Types ──

#[derive(Serialize, Deserialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub icon_name: String,
    pub genres: Vec<String>,
    pub word_count: i64,
    pub chapter_count: i64,
    pub last_opened: String,
    pub status: String,
    pub mode: String,
}

#[derive(Serialize, Deserialize)]
pub struct ProjectDetail {
    pub name: String,
    pub description: String,
    pub mode: String,
    pub language: String,
    pub genres: Vec<String>,
    pub icon_name: String,
    pub file_path: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Chapter {
    pub id: i64,
    pub volume_id: i64,
    pub num: i64,
    pub title: String,
    pub content: String,
    pub outline: String,
    pub word_count: i64,
    pub status: String,
    pub cognitive_frame: String,
    pub emotional_anchor: String,
    pub world_texture: String,
    pub concrete_mystery: String,
    pub interpersonal_tension: String,
}

#[derive(Serialize, Deserialize)]
pub struct Volume {
    pub id: i64,
    pub sort_order: i64,
    pub title: String,
    pub chapters: Vec<Chapter>,
}

#[derive(Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub age: String,
    pub gender: String,
    pub appearance: String,
    pub personality: String,
    pub background: String,
    pub motivation: String,
    pub arc: String,
    pub title: String,
    pub role: String,
    pub chapter_count: i64,
    pub importance: i64,
}

#[derive(Serialize, Deserialize)]
pub struct WorldEntry {
    pub id: String,
    pub category: String,
    pub name: String,
    pub description: String,
    pub tags: String,
}

#[derive(Serialize, Deserialize)]
pub struct ScienceEntry {
    pub id: String,
    pub category: String,
    pub title: String,
    pub description: String,
}

#[derive(Serialize, Deserialize)]
pub struct Foreshadow {
    pub id: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub status: String,
    pub expected_resolve_chapter: Option<i64>,
    pub planted_chapter: Option<i64>,
    pub resolved_chapter: Option<i64>,
}

#[derive(Serialize, Deserialize)]
pub struct Stats {
    pub total_words: i64,
    pub chapter_count: i64,
    pub accepted_count: i64,
    pub character_count: i64,
    pub foreshadow_count: i64,
    pub resolved_foreshadow: i64,
    pub overdue_foreshadow: i64,
    pub world_count: i64,
    pub sci_count: i64,
    pub token_input: i64,
    pub token_output: i64,
    pub chapters: Vec<ChapterSummary>,
}

#[derive(Serialize, Deserialize)]
pub struct ChapterSummary {
    pub id: i64,
    pub num: i64,
    pub title: String,
    pub word_count: i64,
    pub status: String,
}

#[derive(Serialize, Deserialize)]
pub struct Relation {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub relation_type: String,
    pub description: String,
}

#[derive(Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub content: String,
    pub category: String,
    pub source_chapter_id: Option<i64>,
    pub relevance: f64,
}

#[derive(Serialize, Deserialize)]
pub struct TimelineEvent {
    pub id: String,
    pub title: String,
    pub description: String,
    pub year: i64,
    pub month: i64,
    pub day: i64,
    pub importance: i64,
    pub category: String,
    pub status: String,
}

#[derive(Serialize, Deserialize)]
pub struct ConsistencyResult {
    pub passed: i64,
    pub conflicts: i64,
    pub warnings: Vec<String>,
    pub science_errors: i64,
}

// ═══════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════

#[tauri::command]
pub fn list_projects() -> Result<Vec<ProjectSummary>, String> {
    let conn = db::open_config_db().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT name, project_path, last_opened FROM recent_projects ORDER BY last_opened DESC")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String)> = stmt.query_map([], |row| {
        Ok((row.get::<_,String>(0)?, row.get::<_,String>(1)?, row.get::<_,String>(2)?))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut projects = Vec::new();
    for (name, _path, last_opened) in rows {
        if let Ok(pdb) = db::open_project_db(&name) {
            let wc: i64 = pdb.query_row("SELECT COALESCE(SUM(word_count),0) FROM chapters", [], |r| r.get(0)).unwrap_or(0);
            let cc: i64 = pdb.query_row("SELECT COUNT(*) FROM chapters", [], |r| r.get(0)).unwrap_or(0);
            let mode: String = pdb.query_row("SELECT COALESCE(value,'medium-novel') FROM project_meta WHERE key='mode'", [], |r| r.get(0)).unwrap_or_default();
            let mut genres = Vec::new();
            if let Ok(mut gstmt) = pdb.prepare("SELECT genre FROM project_genres") {
                if let Ok(grows) = gstmt.query_map([], |r| r.get::<_,String>(0)) {
                    genres.extend(grows.flatten());
                }
            }
            let status = if wc > 30000 { "写作中".into() } else if wc > 5000 { "进行中".into() } else { "刚起步".into() };
            projects.push(ProjectSummary { id: name.clone(), name, icon_name: "BookOpen".into(), genres, word_count: wc, chapter_count: cc, last_opened, status, mode });
        }
    }
    Ok(projects)
}

#[tauri::command]
pub fn get_project(name: String) -> Result<ProjectDetail, String> {
    let pdb = db::open_project_db(&name).map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT key, value FROM project_meta").map_err(|e| e.to_string())?;
    let meta: HashMap<String, String> = stmt.query_map([], |row| Ok((row.get::<_,String>(0)?, row.get::<_,String>(1)?)))
        .map_err(|e| e.to_string())?.flatten().collect();
    let mut genres = Vec::new();
    if let Ok(mut gstmt) = pdb.prepare("SELECT genre FROM project_genres") {
        if let Ok(grows) = gstmt.query_map([], |r| r.get::<_,String>(0)) {
            genres.extend(grows.flatten());
        }
    }
    let proj_name = name.clone();
    Ok(ProjectDetail {
        name: proj_name, description: meta.get("description").cloned().unwrap_or_default(),
        mode: meta.get("mode").cloned().unwrap_or_default(), language: meta.get("language").cloned().unwrap_or_default(),
        genres, icon_name: meta.get("icon_name").cloned().unwrap_or_default(),
        file_path: db::project_db_path(&name).to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn create_project(name: String, mode: String, language: String, genres: Vec<String>) -> Result<String, String> {
    let pdb = db::open_project_db(&name).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for meta in [("name", name.as_str()), ("description", ""), ("mode", mode.as_str()), ("language", language.as_str()), ("version", "1"), ("created_at", now.as_str()), ("updated_at", now.as_str()), ("word_count", "0"), ("author_name", "佚名")] {
        pdb.execute("INSERT OR REPLACE INTO project_meta (key, value) VALUES (?1, ?2)", params![meta.0, meta.1]).map_err(|e| e.to_string())?;
    }
    for g in &genres {
        pdb.execute("INSERT OR IGNORE INTO project_genres (genre) VALUES (?1)", params![g]).map_err(|e| e.to_string())?;
    }
    pdb.execute("INSERT INTO volumes (sort_order, title) VALUES (1, '第一卷')", []).map_err(|e| e.to_string())?;
    let cdb = db::open_config_db().map_err(|e| e.to_string())?;
    cdb.execute("INSERT OR REPLACE INTO recent_projects (name, project_path, last_opened) VALUES (?1, ?2, ?3)",
        params![name, db::project_db_path(&name).to_string_lossy().to_string(), now]).map_err(|e| e.to_string())?;
    Ok(name)
}

#[tauri::command]
pub fn delete_project(name: String) -> Result<(), String> {
    std::fs::remove_file(db::project_db_path(&name)).ok();
    let cdb = db::open_config_db().map_err(|e| e.to_string())?;
    cdb.execute("DELETE FROM recent_projects WHERE name = ?1", params![name]).map_err(|e| e.to_string())?;
    Ok(())
}

// ═══════════════════════════════════════════
// CHAPTERS
// ═══════════════════════════════════════════

fn chapter_from_row(row: &rusqlite::Row) -> rusqlite::Result<Chapter> {
    Ok(Chapter {
        id: row.get(0)?, volume_id: row.get(1)?, num: row.get(2)?, title: row.get(3)?,
        content: row.get(4)?, outline: row.get(5)?, word_count: row.get(6)?, status: row.get(7)?,
        cognitive_frame: row.get(8)?, emotional_anchor: row.get(9)?, world_texture: row.get(10)?,
        concrete_mystery: row.get(11)?, interpersonal_tension: row.get(12)?,
    })
}

#[tauri::command]
pub fn list_chapters(project: String) -> Result<Vec<Chapter>, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT id, volume_id, num, title, content, outline, word_count, status, cognitive_frame, emotional_anchor, world_texture, concrete_mystery, interpersonal_tension FROM chapters ORDER BY num")
        .map_err(|e| e.to_string())?;
    let chapters: Vec<Chapter> = stmt.query_map([], chapter_from_row)
        .map_err(|e| e.to_string())?.flatten().collect();
    Ok(chapters)
}

#[tauri::command]
pub fn get_chapter(project: String, num: i64) -> Result<Chapter, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    pdb.query_row("SELECT id, volume_id, num, title, content, outline, word_count, status, cognitive_frame, emotional_anchor, world_texture, concrete_mystery, interpersonal_tension FROM chapters WHERE num = ?1",
        params![num], chapter_from_row).map_err(|e| format!("Chapter not found: {}", e))
}

#[tauri::command]
pub fn update_chapter(project: String, num: i64, title: Option<String>, content: Option<String>, outline: Option<String>, status: Option<String>,
    cognitive_frame: Option<String>, emotional_anchor: Option<String>, world_texture: Option<String>, concrete_mystery: Option<String>, interpersonal_tension: Option<String>) -> Result<Chapter, String>
{
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let mut sql = String::from("UPDATE chapters SET updated_at = datetime('now')");
    let mut vals: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(v) = title { sql.push_str(", title = ?"); vals.push(Box::new(v)); }
    if let Some(v) = content {
        sql.push_str(", content = ?"); vals.push(Box::new(v.clone()));
        let wc = v.split_whitespace().count() as i64 + 1;
        sql.push_str(", word_count = ?"); vals.push(Box::new(wc));
    }
    if let Some(v) = outline { sql.push_str(", outline = ?"); vals.push(Box::new(v)); }
    if let Some(v) = status { sql.push_str(", status = ?"); vals.push(Box::new(v)); }
    if let Some(v) = cognitive_frame { sql.push_str(", cognitive_frame = ?"); vals.push(Box::new(v)); }
    if let Some(v) = emotional_anchor { sql.push_str(", emotional_anchor = ?"); vals.push(Box::new(v)); }
    if let Some(v) = world_texture { sql.push_str(", world_texture = ?"); vals.push(Box::new(v)); }
    if let Some(v) = concrete_mystery { sql.push_str(", concrete_mystery = ?"); vals.push(Box::new(v)); }
    if let Some(v) = interpersonal_tension { sql.push_str(", interpersonal_tension = ?"); vals.push(Box::new(v)); }
    sql.push_str(" WHERE num = ?");
    vals.push(Box::new(num));
    let pvals: Vec<&dyn rusqlite::types::ToSql> = vals.iter().map(|v| v.as_ref()).collect();
    pdb.execute(&sql, pvals.as_slice()).map_err(|e| e.to_string())?;
    drop(pvals); drop(vals);
    get_chapter(project, num)
}

#[tauri::command]
pub fn create_chapter(project: String, title: String, outline: String, volume_id: i64) -> Result<Chapter, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let max: i64 = pdb.query_row("SELECT COALESCE(MAX(num), 0) FROM chapters", [], |r| r.get(0)).unwrap_or(0);
    let new_num = max + 1;
    pdb.execute("INSERT INTO chapters (volume_id, num, title, outline) VALUES (?1, ?2, ?3, ?4)", params![volume_id, new_num, title, outline])
        .map_err(|e| e.to_string())?;
    get_chapter(project, new_num)
}

// ═══════════════════════════════════════════
// VOLUMES
// ═══════════════════════════════════════════

#[tauri::command]
pub fn list_volumes(project: String) -> Result<Vec<Volume>, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let mut vstmt = pdb.prepare("SELECT id, sort_order, title FROM volumes ORDER BY sort_order").map_err(|e| e.to_string())?;
    let vols: Vec<(i64, i64, String)> = vstmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?.flatten().collect();

    let mut result = Vec::new();
    for (id, sort_order, title) in vols {
        let mut cstmt = pdb.prepare("SELECT id, volume_id, num, title, content, outline, word_count, status, cognitive_frame, emotional_anchor, world_texture, concrete_mystery, interpersonal_tension FROM chapters WHERE volume_id = ?1 ORDER BY num")
            .map_err(|e| e.to_string())?;
        let chapters: Vec<Chapter> = cstmt.query_map(params![id], chapter_from_row)
            .map_err(|e| e.to_string())?.flatten().collect();
        result.push(Volume { id, sort_order, title, chapters });
    }
    Ok(result)
}

// ═══════════════════════════════════════════
// CHARACTERS
// ═══════════════════════════════════════════

#[tauri::command]
pub fn list_characters(project: String) -> Result<Vec<Character>, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT id, name, age, gender, appearance, personality, background, motivation, arc, title, role, chapter_count, importance FROM characters ORDER BY importance DESC")
        .map_err(|e| e.to_string())?;
    let chars: Vec<Character> = stmt.query_map([], |row| {
        Ok(Character { id: row.get(0)?, name: row.get(1)?, age: row.get(2)?, gender: row.get(3)?,
            appearance: row.get(4)?, personality: row.get(5)?, background: row.get(6)?,
            motivation: row.get(7)?, arc: row.get(8)?, title: row.get(9)?, role: row.get(10)?,
            chapter_count: row.get(11)?, importance: row.get(12)? })
    }).map_err(|e| e.to_string())?.flatten().collect();
    Ok(chars)
}

#[tauri::command]
pub fn create_character(project: String, name: String, age: String, gender: String, appearance: String, personality: String, background: String) -> Result<Character, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    pdb.execute("INSERT INTO characters (id, name, age, gender, appearance, personality, background) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![id, name, age, gender, appearance, personality, background]).map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT id, name, age, gender, appearance, personality, background, motivation, arc, title, role, chapter_count, importance FROM characters WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![id], |row| {
        Ok(Character { id: row.get(0)?, name: row.get(1)?, age: row.get(2)?, gender: row.get(3)?,
            appearance: row.get(4)?, personality: row.get(5)?, background: row.get(6)?,
            motivation: row.get(7)?, arc: row.get(8)?, title: row.get(9)?, role: row.get(10)?,
            chapter_count: row.get(11)?, importance: row.get(12)? })
    }).map_err(|e| format!("Not found: {}", e))
}

// ═══════════════════════════════════════════
// WORLD
// ═══════════════════════════════════════════

#[tauri::command]
pub fn list_world(project: String) -> Result<Vec<WorldEntry>, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT id, category, name, description, tags FROM world_entries ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let entries: Vec<WorldEntry> = stmt.query_map([], |row| {
        Ok(WorldEntry { id: row.get(0)?, category: row.get(1)?, name: row.get(2)?, description: row.get(3)?, tags: row.get(4)? })
    }).map_err(|e| e.to_string())?.flatten().collect();
    Ok(entries)
}

#[tauri::command]
pub fn create_world_entry(project: String, category: String, name: String, description: String) -> Result<WorldEntry, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    pdb.execute("INSERT INTO world_entries (id, category, name, description) VALUES (?1,?2,?3,?4)", params![id, category, name, description])
        .map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT id, category, name, description, tags FROM world_entries WHERE id = ?1").map_err(|e| e.to_string())?;
    stmt.query_row(params![id], |row| {
        Ok(WorldEntry { id: row.get(0)?, category: row.get(1)?, name: row.get(2)?, description: row.get(3)?, tags: row.get(4)? })
    }).map_err(|e| format!("Not found: {}", e))
}

// ═══════════════════════════════════════════
// SCIENCE
// ═══════════════════════════════════════════

#[tauri::command]
pub fn list_science(project: String) -> Result<Vec<ScienceEntry>, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT id, category, title, description FROM science_entries ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let entries: Vec<ScienceEntry> = stmt.query_map([], |row| {
        Ok(ScienceEntry { id: row.get(0)?, category: row.get(1)?, title: row.get(2)?, description: row.get(3)? })
    }).map_err(|e| e.to_string())?.flatten().collect();
    Ok(entries)
}

// ═══════════════════════════════════════════
// FORESHADOWS
// ═══════════════════════════════════════════

#[tauri::command]
pub fn list_foreshadows(project: String) -> Result<Vec<Foreshadow>, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT id, title, description, priority, status, expected_resolve_chapter, planted_chapter, resolved_chapter FROM foreshadows ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let items: Vec<Foreshadow> = stmt.query_map([], |row| {
        Ok(Foreshadow { id: row.get(0)?, title: row.get(1)?, description: row.get(2)?, priority: row.get(3)?, status: row.get(4)?,
            expected_resolve_chapter: row.get(5)?, planted_chapter: row.get(6)?, resolved_chapter: row.get(7)? })
    }).map_err(|e| e.to_string())?.flatten().collect();
    Ok(items)
}

// ═══════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════

#[tauri::command]
pub fn list_relations(project: String) -> Result<Vec<Relation>, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT id, source_id, target_id, relation_type, description FROM character_relations").map_err(|e| e.to_string())?;
    let items: Vec<Relation> = stmt.query_map([], |row| {
        Ok(Relation { id: row.get(0)?, source_id: row.get(1)?, target_id: row.get(2)?, relation_type: row.get(3)?, description: row.get(4)? })
    }).map_err(|e| e.to_string())?.flatten().collect();
    Ok(items)
}

// ═══════════════════════════════════════════
// MEMORIES
// ═══════════════════════════════════════════

#[tauri::command]
pub fn list_memories(project: String) -> Result<Vec<Memory>, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT id, content, category, source_chapter_id, relevance FROM memories ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let items: Vec<Memory> = stmt.query_map([], |row| {
        Ok(Memory { id: row.get(0)?, content: row.get(1)?, category: row.get(2)?, source_chapter_id: row.get(3)?, relevance: row.get(4)? })
    }).map_err(|e| e.to_string())?.flatten().collect();
    Ok(items)
}

// ═══════════════════════════════════════════
// TIMELINE
// ═══════════════════════════════════════════

#[tauri::command]
pub fn list_timeline(project: String) -> Result<Vec<TimelineEvent>, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let mut stmt = pdb.prepare("SELECT id, title, description, year, month, day, importance, category, status FROM timeline_events ORDER BY year DESC, month DESC, day DESC")
        .map_err(|e| e.to_string())?;
    let items: Vec<TimelineEvent> = stmt.query_map([], |row| {
        Ok(TimelineEvent { id: row.get(0)?, title: row.get(1)?, description: row.get(2)?, year: row.get(3)?, month: row.get(4)?, day: row.get(5)?, importance: row.get(6)?, category: row.get(7)?, status: row.get(8)? })
    }).map_err(|e| e.to_string())?.flatten().collect();
    Ok(items)
}

// ═══════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════

#[tauri::command]
pub fn get_stats(project: String) -> Result<Stats, String> {
    let pdb = db::open_project_db(&project).map_err(|e| e.to_string())?;
    let total_words = pdb.query_row("SELECT COALESCE(SUM(word_count),0) FROM chapters", [], |r| r.get::<_,i64>(0)).unwrap_or(0);
    let chapter_count = pdb.query_row("SELECT COUNT(*) FROM chapters", [], |r| r.get::<_,i64>(0)).unwrap_or(0);
    let accepted_count = pdb.query_row("SELECT COUNT(*) FROM chapters WHERE status='accepted'", [], |r| r.get::<_,i64>(0)).unwrap_or(0);
    let character_count = pdb.query_row("SELECT COUNT(*) FROM characters", [], |r| r.get::<_,i64>(0)).unwrap_or(0);
    let foreshadow_count = pdb.query_row("SELECT COUNT(*) FROM foreshadows", [], |r| r.get::<_,i64>(0)).unwrap_or(0);
    let resolved_foreshadow = pdb.query_row("SELECT COUNT(*) FROM foreshadows WHERE status='resolved'", [], |r| r.get::<_,i64>(0)).unwrap_or(0);
    let overdue_foreshadow = pdb.query_row("SELECT COUNT(*) FROM foreshadows WHERE status='planted' AND expected_resolve_chapter < (SELECT COALESCE(MAX(num),0) FROM chapters)", [], |r| r.get::<_,i64>(0)).unwrap_or(0);
    let world_count = pdb.query_row("SELECT COUNT(*) FROM world_entries", [], |r| r.get::<_,i64>(0)).unwrap_or(0);
    let sci_count = pdb.query_row("SELECT COUNT(*) FROM science_entries", [], |r| r.get::<_,i64>(0)).unwrap_or(0);
    let token_input = pdb.query_row("SELECT COALESCE(SUM(input_tokens),0) FROM token_usage", [], |r| r.get::<_,i64>(0)).unwrap_or(0);
    let token_output = pdb.query_row("SELECT COALESCE(SUM(output_tokens),0) FROM token_usage", [], |r| r.get::<_,i64>(0)).unwrap_or(0);

    let mut cstmt = pdb.prepare("SELECT id, num, title, word_count, status FROM chapters ORDER BY num").map_err(|e| e.to_string())?;
    let chapters: Vec<ChapterSummary> = cstmt.query_map([], |row| {
        Ok(ChapterSummary { id: row.get(0)?, num: row.get(1)?, title: row.get(2)?, word_count: row.get(3)?, status: row.get(4)? })
    }).map_err(|e| e.to_string())?.flatten().collect();

    Ok(Stats { total_words, chapter_count, accepted_count, character_count, foreshadow_count, resolved_foreshadow, overdue_foreshadow, world_count, sci_count, token_input, token_output, chapters })
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════

#[tauri::command]
pub fn get_settings() -> Result<HashMap<String, String>, String> {
    let conn = db::open_config_db().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_,String>(0)?, row.get::<_,String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for row in rows.flatten() {
        map.insert(row.0, row.1);
    }
    Ok(map)
}

#[tauri::command]
pub fn update_setting(key: String, value: String) -> Result<(), String> {
    let conn = db::open_config_db().map_err(|e| e.to_string())?;
    conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)", params![key, value])
        .map_err(|e| e.to_string())?;
    Ok(())
}
