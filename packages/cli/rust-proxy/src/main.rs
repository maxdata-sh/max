mod daemon;

use std::env;
use std::io::{self, BufRead, IsTerminal, Write};
use std::path::Path;
use std::process::{Command, Stdio};

fn run_direct(args: &[String], project_root: Option<&Path>) {
    let script = match daemon::find_daemon_script() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("{}", e);
            std::process::exit(1);
        }
    };
    let mut cmd = Command::new("bun");
    cmd.arg("run").arg(&script);
    if let Some(root) = project_root {
        cmd.arg("--project-root").arg(root.as_os_str());
    }
    let status = cmd
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status();
    match status {
        Ok(s) => std::process::exit(s.code().unwrap_or(1)),
        Err(e) => {
            eprintln!("Failed to run: {}", e);
            std::process::exit(1);
        }
    }
}

fn should_use_color(args: &[String]) -> bool {
    // Explicit flags take priority
    if args.iter().any(|a| a == "--no-color") { return false; }
    if args.iter().any(|a| a == "--color") { return true; }
    if env::var("NO_COLOR").is_ok() { return false; }
    if env::var("FORCE_COLOR").map(|v| v != "0").unwrap_or(false) { return true; }
    io::stdout().is_terminal()
}

fn main() {
    let mut args: Vec<String> = env::args().skip(1).collect();
    let cwd = env::current_dir().expect("Cannot determine CWD");
    let project_root = daemon::find_project_root(&cwd);
    let use_color = should_use_color(&args);

    // daemon subcommand — always run direct (bypasses socket)
    if args.first().map(|s| s == "daemon").unwrap_or(false) {
        run_direct(&args, project_root.as_deref());
    }

    // No project found — run direct (handles init, non-project commands)
    let project_root = match project_root {
        Some(root) => root,
        None => {
            run_direct(&args, None);
            return;
        }
    };

    let (kind, shell) = if args.first().map(|s| s == "__complete").unwrap_or(false) {
        args.remove(0);
        let shell = if !args.is_empty() {
            Some(args.remove(0))
        } else {
            None
        };
        ("complete", shell)
    } else {
        ("run", None)
    };

    let mut req = serde_json::json!({
        "kind": kind,
        "argv": args,
        "cwd": cwd.to_string_lossy(),
        "color": use_color
    });
    if let Some(ref s) = shell {
        req["shell"] = serde_json::json!(s);
    }

    // Try daemon socket; fall back to direct mode
    let mut stream = match daemon::connect(&project_root) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("\x1b[31mDaemon not responding ({})\x1b[0m", e);
            run_direct(&args, Some(&project_root));
            return;
        }
    };

    if let Err(e) = stream.write_all(req.to_string().as_bytes())
        .and_then(|_| stream.write_all(b"\n"))
    {
        eprintln!("Error writing to socket: {}", e);
        std::process::exit(1);
    }

    // Conversational protocol: read JSONL messages in a loop.
    // Messages are newline-delimited JSON objects.
    let mut reader = io::BufReader::new(&mut stream);

    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => {
                // EOF — daemon closed without a response
                eprintln!("Daemon closed connection unexpectedly");
                std::process::exit(1);
            }
            Err(e) => {
                eprintln!("Error reading from socket: {}", e);
                std::process::exit(1);
            }
            Ok(_) => {}
        }

        let msg: serde_json::Value = match serde_json::from_str(line.trim()) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Error parsing message: {}", e);
                std::process::exit(1);
            }
        };

        match msg["kind"].as_str() {
            Some("prompt") => {
                // Display the prompt message and read input from the real terminal
                if let Some(message) = msg["message"].as_str() {
                    print!("{}", message);
                    let _ = io::stdout().flush();
                }
                let mut input = String::new();
                if let Err(e) = io::stdin().read_line(&mut input) {
                    eprintln!("Error reading input: {}", e);
                    std::process::exit(1);
                }
                let input_msg = serde_json::json!({ "kind": "input", "value": input.trim_end_matches('\n') });
                // Write back to the socket (need mutable access via the underlying stream)
                let writer = reader.get_mut();
                if let Err(e) = writer.write_all(input_msg.to_string().as_bytes())
                    .and_then(|_| writer.write_all(b"\n"))
                {
                    eprintln!("Error writing input to socket: {}", e);
                    std::process::exit(1);
                }
            }
            Some("write") => {
                // Intermediate output — display to the user
                if let Some(text) = msg["text"].as_str() {
                    print!("{}", text);
                    let _ = io::stdout().flush();
                }
            }
            Some("response") => {
                // Final response — handle completions or standard output
                if kind == "complete" {
                    if let Some(output) = msg["completionOutput"].as_str() {
                        print!("{}", output);
                        return;
                    }
                    if let Some(arr) = msg["completions"].as_array() {
                        for v in arr {
                            if let Some(s) = v.as_str() {
                                println!("{}", s);
                            }
                        }
                    }
                    return;
                }

                if let Some(out) = msg["stdout"].as_str() {
                    print!("{}", out);
                }
                if let Some(err) = msg["stderr"].as_str() {
                    eprint!("{}", err);
                }

                let exit_code = msg["exitCode"].as_i64().unwrap_or(1) as i32;
                std::process::exit(exit_code);
            }
            _ => {
                // Unknown message kind — skip
            }
        }
    }
}
