use std::net::TcpStream;
use std::time::Duration;
use tauri_plugin_shell::ShellExt;

/// Poll the Express server port until it responds, or timeout.
fn wait_for_server(port: u16, timeout_secs: u64) -> bool {
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);
    while std::time::Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}").parse().unwrap(),
            Duration::from_millis(500),
        )
        .is_ok()
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Spawn the Express server as a sidecar process
            let sidecar = app.shell().sidecar("mythpen-server").unwrap();
            let _child = sidecar.spawn().expect("Failed to spawn mythpen-server sidecar");

            // Wait for the server to be ready on port 3001
            if !wait_for_server(3001, 15) {
                eprintln!("Warning: mythpen-server did not start within 15 seconds");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
