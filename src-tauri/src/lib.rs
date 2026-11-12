use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::net::TcpStream;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_aptabase::EventTracker;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

/// Managed state holding the sidecar child process handle.
/// Stored so we can kill the Express server on app exit.
struct SidecarProcess(Mutex<Option<CommandChild>>);

/// Set by the frontend after it has flushed the editor; releases the exit gate.
struct ExitState(AtomicBool);

/// Anonymous-statistics preference (Settings → Privacy). Mirrored from the
/// frontend so native lifecycle events honour the opt-out.
struct AnonymousStats(AtomicBool);

/// Emit a native lifecycle event unless the user opted out of anonymous stats.
fn track_lifecycle(app_handle: &tauri::AppHandle, event: &str) {
    let enabled = app_handle
        .try_state::<AnonymousStats>()
        .map_or(true, |state| state.0.load(Ordering::SeqCst));
    if enabled {
        let _ = app_handle.track_event(event, None);
    }
}

/// Keeps the desktop Sentry client alive; dropping it stops error reporting.
struct SentryGuard(Mutex<Option<sentry::ClientInitGuard>>);

const SENTRY_DSN: &str = "https://40e635de6482f1da9dabef83edabbec3@o4512410989428736.ingest.us.sentry.io/4512410999455744";

/// Marker file used to persist the opt-out across launches. Its absence means
/// anonymous statistics are enabled (the default).
fn anonymous_stats_disabled_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("anonymous-stats.disabled"))
}

fn read_anonymous_stats(app: &tauri::AppHandle) -> bool {
    anonymous_stats_disabled_path(app).map_or(true, |path| !path.exists())
}

fn write_anonymous_stats(app: &tauri::AppHandle, enabled: bool) {
    let Some(path) = anonymous_stats_disabled_path(app) else {
        return;
    };
    if enabled {
        let _ = std::fs::remove_file(path);
    } else {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(path, "1");
    }
}

/// Start desktop error reporting (release builds only).
fn init_desktop_sentry() -> Option<sentry::ClientInitGuard> {
    if cfg!(debug_assertions) {
        return None;
    }
    let mut options = sentry::ClientOptions::default();
    options.release = sentry::release_name!();
    options.environment = Some("production".into());
    options.send_default_pii = false;
    let guard = sentry::init((SENTRY_DSN, options));
    sentry::configure_scope(|scope| {
        scope.set_tag("component", "desktop");
    });
    Some(guard)
}

/// Called by the frontend when the privacy toggle changes.
#[tauri::command]
fn set_anonymous_stats(
    app: tauri::AppHandle,
    state: tauri::State<AnonymousStats>,
    guard: tauri::State<SentryGuard>,
    enabled: bool,
) {
    state.0.store(enabled, Ordering::SeqCst);
    write_anonymous_stats(&app, enabled);

    let mut guard = guard.0.lock().unwrap();
    if enabled {
        if guard.is_none() {
            *guard = init_desktop_sentry();
        }
    } else {
        // Dropping the guard shuts the Sentry client down.
        let _ = guard.take();
    }
}

/// Called by the frontend once pending editor content has been persisted.
#[tauri::command]
fn finish_exit(app: tauri::AppHandle, state: tauri::State<ExitState>) {
    state.0.store(true, Ordering::SeqCst);
    app.exit(0);
}

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
        .plugin(tauri_plugin_aptabase::Builder::new("A-US-9460803259").build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ExitState(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![finish_exit, set_anonymous_stats])
        .setup(|app| {
            // Privacy: restore the opt-out before Sentry starts and before the
            // native Aptabase lifecycle events fire. The guard lives in app
            // state for the whole lifetime; debug builds stay local.
            let anonymous_stats = read_anonymous_stats(app.handle());
            app.manage(AnonymousStats(AtomicBool::new(anonymous_stats)));
            let sentry_guard = if anonymous_stats {
                init_desktop_sentry()
            } else {
                None
            };
            app.manage(SentryGuard(Mutex::new(sentry_guard)));

            // Spawn the Express server as a sidecar process. The env is used by
            // Sentry in the sidecar to enable reporting only in release builds.
            let sidecar = app
                .shell()
                .sidecar("mythpen-server")
                .unwrap()
                .env(
                    "MYTHPEN_ENV",
                    if cfg!(debug_assertions) {
                        "development"
                    } else {
                        "production"
                    },
                )
                .env("MYTHPEN_VERSION", app.package_info().version.to_string());
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
        .run(|app_handle, event| match event {
            tauri::RunEvent::Ready => {
                // Aptabase: session start (the plugin adds OS, app version, etc.)
                track_lifecycle(app_handle, "app_started");
            }
            // Cmd+Q / app quit: let the frontend flush the editor before the
            // sidecar is shut down. `finish_exit` releases the gate.
            tauri::RunEvent::ExitRequested { api, .. } => {
                let state = app_handle.state::<ExitState>();
                if state.0.load(Ordering::SeqCst) || app_handle.webview_windows().is_empty() {
                    return;
                }
                api.prevent_exit();
                let _ = app_handle.emit("mythpen://flush-before-exit", ());

                // Never let a hung frontend trap the app forever.
                let handle = app_handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(5));
                    let state = handle.state::<ExitState>();
                    if !state.0.load(Ordering::SeqCst) {
                        state.0.store(true, Ordering::SeqCst);
                        handle.exit(0);
                    }
                });
            }
            // Graceful sidecar shutdown on app exit.
            //
            // Step 1: Send HTTP POST to /api/shutdown so Express cleans up normally.
            // Step 2: Wait briefly for the graceful shutdown to complete.
            // Step 3: Force kill as a safety net (for Windows upgrade binary overwrite).
            //
            // This three-step strategy avoids triggering antivirus software that flags
            // SIGKILL/TerminateProcess as suspicious behavior.
            tauri::RunEvent::Exit => {
                // Aptabase: queue the session end event. Do not block the exit
                // path on analytics — a slow/unreachable network used to freeze
                // the window (spinning cursor) while the app closed.
                track_lifecycle(app_handle, "app_exited");

                if let Some(state) = app_handle.try_state::<SidecarProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            // Step 1: Request graceful shutdown via HTTP. The
                            // server flushes SQLite and closes its sockets.
                            request_graceful_shutdown(3001);

                            // Step 2: Short grace period for the server to
                            // flush SQLite without making the close button hang.
                            std::thread::sleep(Duration::from_millis(1000));

                            // Step 3: Force kill as safety net
                            let _ = child.kill();
                        }
                    }
                }
            }
            _ => {}
        });
}
