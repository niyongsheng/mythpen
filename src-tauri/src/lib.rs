mod commands;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::get_project,
            commands::create_project,
            commands::delete_project,
            commands::list_chapters,
            commands::get_chapter,
            commands::update_chapter,
            commands::create_chapter,
            commands::list_volumes,
            commands::list_characters,
            commands::create_character,
            commands::list_world,
            commands::create_world_entry,
            commands::list_science,
            commands::list_foreshadows,
            commands::list_relations,
            commands::list_memories,
            commands::list_timeline,
            commands::get_stats,
            commands::get_settings,
            commands::update_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
