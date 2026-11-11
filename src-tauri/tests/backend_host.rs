#![cfg(windows)]

use acvpn_migration::backend_host::{BackendHost, RuntimeOptions};
use serde_json::json;
use std::{path::PathBuf, sync::Arc, time::Duration};

#[test]
fn rust_host_forwards_requests_to_the_private_node_backend() {
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_owned();
    let profile = tempfile::tempdir().unwrap();
    let script = workspace.join("src-tauri/sidecar/backend.js");
    let events = Arc::new(|_: serde_json::Value| {});
    let host = BackendHost::start("node", &script, profile.path(), events).unwrap();
    let state = host
        .call("state", json!({}), Duration::from_secs(15))
        .unwrap();
    assert_eq!(state["groups"].as_array().unwrap().len(), 0);
    let response = host
        .call(
            "add",
            json!({"value":"vless://12345678-1234-1234-1234-123456789abc@example.org:443#Example"}),
            Duration::from_secs(15),
        )
        .unwrap();
    assert_eq!(response["ok"], true);
    let updated = host
        .call("state", json!({}), Duration::from_secs(15))
        .unwrap();
    assert_eq!(updated["groups"][0]["servers"][0]["name"], "Example");
    host.shutdown(Duration::from_secs(5)).unwrap();
}

#[test]
fn host_returns_promptly_if_the_backend_already_exited() {
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_owned();
    let profile = tempfile::tempdir().unwrap();
    let script = workspace.join("src-tauri/tests/fixtures/exit.cjs");
    let host = BackendHost::start("node", &script, profile.path(), Arc::new(|_| {})).unwrap();
    std::thread::sleep(Duration::from_millis(500));
    let start = std::time::Instant::now();
    assert!(host
        .call("state", json!({}), Duration::from_secs(5))
        .is_err());
    assert!(start.elapsed() < Duration::from_secs(2));
}

#[test]
fn unexpected_backend_exit_is_reported_to_the_host() {
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_owned();
    let profile = tempfile::tempdir().unwrap();
    let (sender, receiver) = std::sync::mpsc::channel();
    let host = BackendHost::start(
        "node",
        &workspace.join("src-tauri/tests/fixtures/exit.cjs"),
        profile.path(),
        Arc::new(move |value| {
            let _ = sender.send(value);
        }),
    )
    .unwrap();
    let event = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
    assert_eq!(event["event"], "backend-exited");
    host.shutdown(Duration::from_secs(5)).unwrap();
}

#[test]
fn packaged_node_backend_can_stay_running() {
    let root = std::env::var_os("ACVPN_TEST_PACKAGED_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("acvpn-tauri-release/release"));
    let node = root.join("runtime/node.exe");
    if !node.exists() {
        return;
    }
    let root = root.canonicalize().unwrap();
    let node = root.join("runtime/node.exe");
    let script = root.join("src-tauri/sidecar/backend.js");
    let profile = tempfile::tempdir().unwrap();
    let host = BackendHost::start(node, &script, profile.path(), Arc::new(|_| {})).unwrap();
    let first = host.call("state", json!({}), Duration::from_secs(10));
    assert!(first.is_ok(), "{first:?}");
    std::thread::sleep(Duration::from_secs(2));
    assert!(host
        .call("state", json!({}), Duration::from_secs(10))
        .is_ok());
    host.shutdown(Duration::from_secs(5)).unwrap();
}

#[test]
fn release_backend_enables_the_updater_without_starting_a_network_check_immediately() {
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_owned();
    let profile = tempfile::tempdir().unwrap();
    let options = RuntimeOptions {
        executable: std::env::current_exe().unwrap(),
        version: "1.0.2".into(),
        host_pid: std::process::id(),
        migrated: false,
    };
    let host = BackendHost::start_with_options(
        "node",
        &workspace.join("src-tauri/sidecar/backend.js"),
        profile.path(),
        Arc::new(|_| {}),
        Some(&options),
    )
    .unwrap();
    let state = host
        .call("state", json!({}), Duration::from_secs(10))
        .unwrap();
    assert_eq!(state["appUpdate"]["status"], "idle");
    host.shutdown(Duration::from_secs(5)).unwrap();
}

#[test]
fn host_forwards_the_update_install_event_to_tauri() {
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_owned();
    let profile = tempfile::tempdir().unwrap();
    let (sender, receiver) = std::sync::mpsc::channel();
    let events = Arc::new(move |value| {
        let _ = sender.send(value);
    });
    let host = BackendHost::start(
        "node",
        &workspace.join("src-tauri/tests/fixtures/update-event.cjs"),
        profile.path(),
        events,
    )
    .unwrap();
    let notification = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
    assert_eq!(notification["event"], "notification");
    let event = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
    assert_eq!(event["event"], "update-install");
    host.shutdown(Duration::from_secs(5)).unwrap();
    assert!(receiver.recv_timeout(Duration::from_millis(200)).is_err());
}
