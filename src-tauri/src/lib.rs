use std::sync::Mutex;
use std::net::TcpStream;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

/// Managed state holding the sidecar child process handle.
/// Stored so we can kill the Express server on app exit.
struct SidecarProcess(Mutex<Option<CommandChild>>);

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
            let (_rx, child) = sidecar.spawn().expect("Failed to spawn mythpen-server sidecar");

            // Store child handle in app state so it lives for the app's lifetime
            // and can be killed on exit (fixes Windows "file in use" on upgrade)
            app.manage(SidecarProcess(Mutex::new(Some(child))));

            // Wait for the server to be ready on port 3001
            if !wait_for_server(3001, 15) {
                eprintln!("Warning: mythpen-server did not start within 15 seconds");
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Kill the sidecar on exit so Windows can overwrite the binary during upgrade
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<SidecarProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
