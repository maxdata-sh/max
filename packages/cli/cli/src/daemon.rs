use sha2::{Sha256, Digest};
use std::env;
use std::fs::File;
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

const MAX_CONNECT_ATTEMPTS: u32 = 20;
const CONNECT_RETRY_MS: u64 = 50;

// ---------------------------------------------------------------------------
// DaemonPaths — per-project paths under ~/.max/daemons/<hash>/
// ---------------------------------------------------------------------------

pub struct DaemonPaths {
    pub dir: PathBuf,
    pub socket: PathBuf,
    pub pid: PathBuf,
    pub log: PathBuf,
}

fn project_hash(project_root: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(project_root.to_string_lossy().as_bytes());
    let result = hasher.finalize();
    result.iter().take(6).map(|b| format!("{:02x}", b)).collect()
}

impl DaemonPaths {
    pub fn for_project(project_root: &Path) -> Self {
        let hash = project_hash(project_root);
        let home = env::var("HOME").expect("HOME not set");
        let dir = PathBuf::from(home).join(".max").join("daemons").join(&hash);
        DaemonPaths {
            socket: dir.join("daemon.sock"),
            pid: dir.join("daemon.pid"),
            log: dir.join("daemon.log"),
            dir,
        }
    }
}

// ---------------------------------------------------------------------------
// Project root discovery
// ---------------------------------------------------------------------------

/// Walk up from start_dir looking for .max/ + max.json (matches Bun-side algorithm).
pub fn find_project_root(start_dir: &Path) -> Option<PathBuf> {
    let mut dir = start_dir.canonicalize().ok()?;
    loop {
        if dir.join("max.json").exists() && dir.join(".max").is_dir() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}

// ---------------------------------------------------------------------------
// Daemon lifecycle
// ---------------------------------------------------------------------------

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

fn is_daemon_alive(paths: &DaemonPaths) -> bool {
    let pid_str = match std::fs::read_to_string(&paths.pid) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let pid: i32 = match pid_str.trim().parse() {
        Ok(p) => p,
        Err(_) => return false,
    };
    extern "C" { fn kill(pid: i32, sig: i32) -> i32; }
    unsafe { kill(pid, 0) == 0 }
}

fn clean_stale_files(paths: &DaemonPaths) {
    let _ = std::fs::remove_file(&paths.socket);
    let _ = std::fs::remove_file(&paths.pid);
}

pub fn spawn(project_root: &Path, paths: &DaemonPaths) -> Result<(), String> {
    let script = find_daemon_script()?;
    let dev = is_dev_mode();

    // Ensure daemon directory exists
    std::fs::create_dir_all(&paths.dir)
        .map_err(|e| format!("Failed to create daemon dir: {}", e))?;

    // Write project.json for discoverability
    let project_json = format!(
        r#"{{"root":"{}"}}"#,
        project_root.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"")
    );
    std::fs::write(paths.dir.join("project.json"), &project_json)
        .map_err(|e| format!("Failed to write project.json: {}", e))?;

    if dev {
        eprintln!("\x1b[33mStarting daemon in watch mode\x1b[0m");
    }

    let log_file = File::create(&paths.log)
        .map_err(|e| format!("Failed to create daemon log: {}", e))?;

    let mut cmd = Command::new("bun");
    if dev {
        cmd.arg("--watch");
    } else {
        cmd.arg("run");
    }

    cmd.arg(&script)
        .arg("--daemonized")
        .arg("--project-root")
        .arg(project_root.as_os_str())
        .current_dir(project_root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(log_file))
        .spawn()
        .map_err(|e| format!("Failed to spawn daemon: {}", e))?;

    Ok(())
}

pub fn connect(project_root: &Path) -> Result<UnixStream, String> {
    let paths = DaemonPaths::for_project(project_root);

    if let Ok(stream) = UnixStream::connect(&paths.socket) {
        return Ok(stream);
    }

    if !is_daemon_alive(&paths) {
        clean_stale_files(&paths);
        spawn(project_root, &paths)?;
    }

    for attempt in 0..MAX_CONNECT_ATTEMPTS {
        thread::sleep(Duration::from_millis(CONNECT_RETRY_MS));

        match UnixStream::connect(&paths.socket) {
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
