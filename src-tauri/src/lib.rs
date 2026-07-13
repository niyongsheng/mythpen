use std::io::Write;
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

/// Send an HTTP POST request to the server's graceful shutdown endpoint.
/// Returns true if the request was sent (server may still be shutting down).
fn request_graceful_shutdown(port: u16) -> bool {
    let body = "{}";
    let request = format!(
        "POST /api/shutdown HTTP/1.1\r\n\
         Host: 127.0.0.1:{port}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {}",
        body.len(),
        body
    );

    match TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(1000),
    ) {
        Ok(mut stream) => {
            let _ = stream.write_all(request.as_bytes());
            // Don't wait for response — the server is shutting down
            true
        }
        Err(_) => {
            // Server already gone or port not reachable
            false
        }
    }
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

            // Wait for server in background thread — don't block setup().
            // The frontend's ServerStatusGate will poll independently, so the
            // window shows immediately even on slow first-start (Windows AV scan).
            // Timeout doubled to 30s for first-run scenarios.
            std::thread::spawn(|| {
                if !wait_for_server(3001, 30) {
                    eprintln!("Warning: mythpen-server did not start within 30 seconds");
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Graceful sidecar shutdown on app exit.
            //
            // Step 1: Send HTTP POST to /api/shutdown so Express cleans up normally.
            // Step 2: Wait briefly for the graceful shutdown to complete.
            // Step 3: Force kill as a safety net (for Windows upgrade binary overwrite).
            //
            // This three-step strategy avoids triggering antivirus software that flags
            // SIGKILL/TerminateProcess as suspicious behavior.
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<SidecarProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            // Step 1: Request graceful shutdown via HTTP
                            request_graceful_shutdown(3001);

                            // Step 2: Give the server time to close gracefully
                            std::thread::sleep(Duration::from_millis(2000));

                            // Step 3: Force kill as safety net
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
