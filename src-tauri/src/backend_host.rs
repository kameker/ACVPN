use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, BufWriter, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

type Response = Result<Value, String>;
type Pending = Arc<Mutex<HashMap<u64, mpsc::Sender<Response>>>>;
pub type EventHandler = Arc<dyn Fn(Value) + Send + Sync>;

pub struct RuntimeOptions {
    pub executable: std::path::PathBuf,
    pub version: String,
    pub host_pid: u32,
    pub migrated: bool,
}

pub struct BackendHost {
    input: Mutex<Option<BufWriter<ChildStdin>>>,
    child: Mutex<Child>,
    pending: Pending,
    sequence: AtomicU64,
    stopping: Arc<AtomicBool>,
}

impl BackendHost {
    pub fn start(
        node: impl AsRef<Path>,
        script: &Path,
        profile: &Path,
        on_event: EventHandler,
    ) -> Result<Self, String> {
        Self::start_with_options(node, script, profile, on_event, None)
    }

    pub fn start_with_options(
        node: impl AsRef<Path>,
        script: &Path,
        profile: &Path,
        on_event: EventHandler,
        options: Option<&RuntimeOptions>,
    ) -> Result<Self, String> {
        let mut command = Command::new(dunce::simplified(node.as_ref()));
        command
            .arg(dunce::simplified(script))
            .env("ACVPN_TAURI_PROFILE", dunce::simplified(profile))
            .env_remove("ELECTRON_RUN_AS_NODE")
            .env_remove("ACVPN_TAURI_EXECUTABLE")
            .env_remove("ACVPN_TAURI_RELEASE_VERSION")
            .env_remove("ACVPN_TAURI_HOST_PID")
            .env_remove("ACVPN_TAURI_MIGRATED")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(
                if (cfg!(debug_assertions) || cfg!(feature = "diagnostic"))
                    && std::env::var_os("ACVPN_TAURI_DIAGNOSTIC").is_some()
                {
                    Stdio::inherit()
                } else {
                    Stdio::null()
                },
            );
        if let Some(options) = options {
            command.env(
                "ACVPN_TAURI_EXECUTABLE",
                dunce::simplified(&options.executable),
            );
            command.env("ACVPN_TAURI_RELEASE_VERSION", &options.version);
            command.env("ACVPN_TAURI_HOST_PID", options.host_pid.to_string());
            if options.migrated {
                command.env("ACVPN_TAURI_MIGRATED", "1");
            }
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .spawn()
            .map_err(|_| "Could not start backend".to_owned())?;
        let input = child.stdin.take().ok_or("Backend input is unavailable")?;
        let output = child.stdout.take().ok_or("Backend output is unavailable")?;
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
        let responses = Arc::clone(&pending);
        let stopping = Arc::new(AtomicBool::new(false));
        let expected = Arc::clone(&stopping);
        thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                let Ok(line) = line else { break };
                let Ok(message) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if matches!(
                    message.get("event").and_then(Value::as_str),
                    Some("update" | "shutdown-error" | "notification")
                ) {
                    on_event(message);
                } else if let Some(id) = message.get("id").and_then(Value::as_u64) {
                    if let Some(sender) = responses.lock().unwrap().remove(&id) {
                        let _ =
                            sender.send(Ok(message.get("result").cloned().unwrap_or(Value::Null)));
                    }
                }
            }
            for (_, sender) in responses.lock().unwrap().drain() {
                let _ = sender.send(Err("Backend stopped".to_owned()));
            }
            if !expected.load(Ordering::Acquire) {
                on_event(json!({"event":"backend-exited"}));
            }
        });
        Ok(Self {
            input: Mutex::new(Some(BufWriter::new(input))),
            child: Mutex::new(child),
            pending,
            sequence: AtomicU64::new(1),
            stopping,
        })
    }

    pub fn call(&self, action: &str, payload: Value, timeout: Duration) -> Response {
        let id = self.sequence.fetch_add(1, Ordering::Relaxed);
        if id > 9_007_199_254_740_991 {
            return Err("Backend request limit reached".into());
        }
        let (sender, receiver) = mpsc::channel();
        self.pending.lock().unwrap().insert(id, sender);
        let result = (|| {
            let mut lock = self.input.lock().unwrap();
            let input = lock.as_mut().ok_or("Backend is closed")?;
            serde_json::to_writer(
                &mut *input,
                &json!({"id": id, "action": action, "payload": payload}),
            )
            .map_err(|_| "Backend request failed")?;
            input
                .write_all(b"\n")
                .and_then(|_| input.flush())
                .map_err(|_| "Backend request failed")?;
            Ok::<(), &str>(())
        })();
        if let Err(error) = result {
            self.pending.lock().unwrap().remove(&id);
            return Err(error.into());
        }
        match receiver.recv_timeout(timeout) {
            Ok(result) => result,
            Err(_) => {
                self.pending.lock().unwrap().remove(&id);
                Err("Backend request timed out".into())
            }
        }
    }

    pub fn shutdown(&self, timeout: Duration) -> Result<(), String> {
        self.stopping.store(true, Ordering::Release);
        self.input.lock().unwrap().take();
        let deadline = Instant::now() + timeout;
        loop {
            if self
                .child
                .lock()
                .unwrap()
                .try_wait()
                .map_err(|_| "Cannot check backend")?
                .is_some()
            {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err("Backend is still stopping".into());
            }
            thread::sleep(Duration::from_millis(50));
        }
    }
}
