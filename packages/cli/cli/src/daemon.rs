use std::env;
use std::fs::File;
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

pub const SOCKET_PATH: &str = "/tmp/max-daemon.sock";
pub const PID_PATH: &str = "/tmp/max-daemon.pid";

const MAX_CONNECT_ATTEMPTS: u32 = 20;
const CONNECT_RETRY_MS: u64 = 50;

fn is_dev_mode() -> bool {
    env::var("MAX_DEV").map(|v| v == "1" || v == "true").unwrap_or(false)
}

pub fn find_daemon_script() -> Result<String, String> {
    if let Ok(exe) = env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let dev_path = exe_dir
                .join("packages/cli/src/index.ts")
                .canonicalize()
                .ok();
            if let Some(p) = &dev_path {
                if p.exists() {
                    return Ok(p.to_string_lossy().to_string());
                }
            }

            let release_path = exe_dir
                .join("../../../src/index.ts")
                .canonicalize()
                .ok();
            if let Some(p) = release_path {
                if p.exists() {
                    return Ok(p.to_string_lossy().to_string());
                }
            }
        }
    }

    env::var("MAX_DAEMON")
        .map_err(|_| "Cannot find daemon script. Set MAX_DAEMON env var.".to_string())
}

pub fn spawn() -> Result<(), String> {
    let script = find_daemon_script()?;
    let dev = is_dev_mode();

    if dev {
        eprintln!("\x1b[33mStarting daemon in watch mode\x1b[0m");
    }

    let mut cmd = Command::new("bun");

    if dev {
        cmd.arg("--watch");
    } else {
        cmd.arg("run");
    }

    let log_file = File::create("/tmp/max-daemon.log")
        .map_err(|e| format!("Failed to create daemon log: {}", e))?;

    cmd.arg(&script)
        .arg("--daemonized")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(log_file))
        .spawn()
        .map_err(|e| format!("Failed to spawn daemon: {}", e))?;

    Ok(())
}

pub fn connect() -> Result<UnixStream, String> {
    if let Ok(stream) = UnixStream::connect(SOCKET_PATH) {
        return Ok(stream);
    }

    if !Path::new(SOCKET_PATH).exists() {
        spawn()?;
    }

    for attempt in 0..MAX_CONNECT_ATTEMPTS {
        thread::sleep(Duration::from_millis(CONNECT_RETRY_MS));

        match UnixStream::connect(SOCKET_PATH) {
            Ok(stream) => return Ok(stream),
            Err(_) if attempt < MAX_CONNECT_ATTEMPTS - 1 => continue,
            Err(e) => {
                return Err(format!(
                    "Failed to connect after {} attempts: {}",
                    MAX_CONNECT_ATTEMPTS, e
                ))
            }
        }
    }

    Err("Failed to connect to daemon".to_string())
}
