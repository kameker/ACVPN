#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use acvpn_migration::backend_host::{BackendHost, RuntimeOptions};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Arc, time::Duration};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_notification::NotificationExt;

struct TrayReady(bool);

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
async fn acvpn_action(
    action: String,
    payload: Value,
    host: tauri::State<'_, Arc<BackendHost>>,
) -> Result<Value, String> {
    // This build uses an isolated temporary profile. No connection or system
    // proxy operation is permitted until the complete migration is verified.
    if !cfg!(feature = "production")
        && !matches!(
            action.as_str(),
            "state" | "add" | "select" | "favorite" | "deleteServer" | "deleteGroup" | "rename"
        )
    {
        return Ok(json!({"error":"This operation is not available in the Tauri preview"}));
    }
    if !cfg!(feature = "production")
        && action == "add"
        && payload
            .get("value")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .starts_with("https://")
    {
        return Ok(json!({"error":"Subscriptions are not available in the Tauri preview"}));
    }
    let host = Arc::clone(&host);
    let is_state = action == "state";
    let result = tauri::async_runtime::spawn_blocking(move || {
        host.call(&action, payload, Duration::from_secs(30))
    })
    .await
    .map_err(|_| "Backend request failed".to_owned())?;
    #[cfg(any(debug_assertions, feature = "diagnostic"))]
    if is_state && result.as_ref().is_ok_and(|v| v.get("groups").is_some()) {
        if let Some(marker) = std::env::var_os("ACVPN_TAURI_SMOKE_MARKER") {
            let _ = std::fs::write(marker, "ready");
        }
    }
    #[cfg(not(any(debug_assertions, feature = "diagnostic")))]
    let _ = is_state;
    result
}

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if cfg!(feature = "production") && app.config().identifier != "app.acvpn.tauri" {
                return Err(std::io::Error::other("Production build requires the production configuration").into());
            }
            let (node, script) = if cfg!(debug_assertions) {
                (PathBuf::from("node"), PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("sidecar/backend.js"))
            } else {
                let resources = app.path().resource_dir()?;
                (resources.join("runtime/node.exe"), resources.join("src-tauri/sidecar/backend.js"))
            };
            #[cfg(feature = "diagnostic")]
            eprintln!("Tauri node path: {}; backend path: {}", node.display(), script.display());
            let (profile, migrated) = if cfg!(feature = "production") {
                let defaults = (app.path().app_data_dir()?, PathBuf::from(std::env::var_os("APPDATA").ok_or_else(|| std::io::Error::other("Windows profile directory is unavailable"))?).join("ACVPN"), script.with_file_name("profile-init.js"));
                #[cfg(feature = "diagnostic")]
                let (destination, source, init) = if let Some(root) = std::env::var_os("ACVPN_TAURI_TEST_ROOT") {
                    let root = PathBuf::from(root).canonicalize()?;
                    if !root.starts_with(std::env::temp_dir().canonicalize()?) { return Err(std::io::Error::other("Diagnostic profile must be in the temporary directory").into()); }
                    (root.join("new"), root.join("old"), PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/profile-init-fixture.cjs"))
                } else { defaults };
                #[cfg(not(feature = "diagnostic"))]
                let (destination, source, init) = defaults;
                let run_init = |allow_empty: bool| -> std::io::Result<std::process::Output> {
                    let mut command = std::process::Command::new(dunce::simplified(&node));
                    command.arg(dunce::simplified(&init))
                        .env("ACVPN_OLD_PROFILE", dunce::simplified(&source))
                        .env("ACVPN_TAURI_PROFILE", dunce::simplified(&destination))
                        .env_remove("ACVPN_ALLOW_EMPTY_PROFILE");
                    if allow_empty { command.env("ACVPN_ALLOW_EMPTY_PROFILE", "1"); }
                    #[cfg(windows)]
                    { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
                    command.output()
                };
                let mut output = run_init(false)?;
                #[cfg(windows)]
                if !output.status.success() && String::from_utf8_lossy(&output.stderr).contains("LEGACY_KEY_MISSING") {
                    use std::os::windows::ffi::OsStrExt;
                    let title: Vec<u16> = std::ffi::OsStr::new("ACVPN").encode_wide().chain(Some(0)).collect();
                    let message: Vec<u16> = std::ffi::OsStr::new("Не найден ключ шифрования старого профиля. Перенести серверы и настройки невозможно.\n\nСоздать новый пустой профиль? Старые файлы останутся на месте.")
                        .encode_wide().chain(Some(0)).collect();
                    let answer = unsafe { windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(std::ptr::null_mut(), message.as_ptr(), title.as_ptr(), 0x24) };
                    if answer != 6 { std::process::exit(0); }
                    output = run_init(true)?;
                }
                if !output.status.success() {
                    let detail = String::from_utf8_lossy(&output.stderr);
                    let message = if detail.contains("close the existing") { "Закройте старую версию ACVPN через значок в трее и запустите приложение снова." }
                    else if detail.contains("disconnect") || detail.contains("Disconnect") { "Откройте старую версию ACVPN, отключите соединение и закройте её через трей." }
                    else { "Не удалось безопасно перенести данные ACVPN. Существующие файлы не изменены." };
                    return Err(std::io::Error::other(message).into());
                }
                (destination, String::from_utf8_lossy(&output.stdout).trim() == "migrated")
            } else {
                let profile = std::env::temp_dir().join(format!("acvpn-tauri-preview-{}", std::process::id()));
                std::fs::create_dir(&profile)?;
                (profile, false)
            };
            let handle = app.handle().clone();
            let events = Arc::new(move |value: Value| {
                match value.get("event").and_then(Value::as_str) {
                    Some("update") => { let _ = handle.emit("acvpn-update", value.get("data").cloned().unwrap_or(Value::Null)); }
                    Some("shutdown-error") => show_window(&handle),
                    Some("backend-exited") => {
                        let _ = handle.emit("acvpn-backend-error", ());
                        show_window(&handle);
                    }
                    Some("notification") => {
                        let data = &value["data"];
                        let _ = handle.notification().builder()
                            .title(data["title"].as_str().unwrap_or("ACVPN"))
                            .body(data["body"].as_str().unwrap_or(""))
                            .show();
                    }
                    Some("update-install") => {
                        let handle = handle.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            let host = handle.state::<Arc<BackendHost>>();
                            if host.shutdown(Duration::from_secs(20)).is_ok() { handle.exit(0); }
                        });
                    }
                    _ => {}
                }
            });
            let options = if cfg!(feature = "production") { Some(RuntimeOptions { executable: std::env::current_exe()?, version: env!("CARGO_PKG_VERSION").to_owned(), host_pid: std::process::id(), migrated }) } else { None };
            let host = BackendHost::start_with_options(node, &script, &profile, events, options.as_ref()).map_err(std::io::Error::other)?;
            app.manage(Arc::new(host));
            let open = MenuItem::with_id(app, "open", "Открыть ACVPN", true, None::<&str>)?;
            let connect = MenuItem::with_id(app, "connect", "Подключить / отключить", cfg!(feature = "production"), None::<&str>)?;
            let best = MenuItem::with_id(app, "best", "Лучший сервер", cfg!(feature = "production"), None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &connect, &best, &quit])?;
            let mut tray = TrayIconBuilder::new().menu(&menu).tooltip("ACVPN")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_window(app),
                    "connect" | "best" if cfg!(feature = "production") => {
                        let handle = app.clone();
                        let best = event.id().as_ref() == "best";
                        tauri::async_runtime::spawn_blocking(move || {
                            let host = handle.state::<Arc<BackendHost>>();
                            let action = if best { "best" } else {
                                match host.call("state", json!({}), Duration::from_secs(5)) {
                                    Ok(state) if state["coreRunning"] == true => "disconnect",
                                    Ok(_) => "connect",
                                    Err(_) => { show_window(&handle); return; }
                                }
                            };
                            if host.call(action, json!({}), Duration::from_secs(60)).map_or(true, |result| result.get("error").is_some()) { show_window(&handle); }
                        });
                    },
                    "quit" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            let host = handle.state::<Arc<BackendHost>>();
                            if host.shutdown(Duration::from_secs(10)).is_ok() { handle.exit(0); }
                        });
                    },
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }) {
                        show_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            app.manage(TrayReady(tray.build(app).is_ok()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![acvpn_action])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } if window.state::<TrayReady>().0 => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                tauri::WindowEvent::Destroyed => {
                    let host = window.state::<Arc<BackendHost>>();
                    let _ = host.shutdown(Duration::from_secs(5));
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!());
    if let Err(error) = result {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            let title: Vec<u16> = std::ffi::OsStr::new("ACVPN")
                .encode_wide()
                .chain(Some(0))
                .collect();
            let message: Vec<u16> = std::ffi::OsStr::new(&error.to_string())
                .encode_wide()
                .chain(Some(0))
                .collect();
            unsafe {
                windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
                    std::ptr::null_mut(),
                    message.as_ptr(),
                    title.as_ptr(),
                    0x10,
                );
            }
        }
        #[cfg(not(windows))]
        eprintln!("{error}");
    }
}
