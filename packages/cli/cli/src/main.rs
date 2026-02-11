mod daemon;

use std::env;
use std::io::{Read, Write};
use std::process::{Command, Stdio};

fn run_direct(args: &[String]) {
    let script = match daemon::find_daemon_script() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("{}", e);
            std::process::exit(1);
        }
    };
    let status = Command::new("bun")
        .arg("run")
        .arg(&script)
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

fn main() {
    let mut args: Vec<String> = env::args().skip(1).collect();

    // daemon subcommand — always run direct (bypasses socket)
    if args.first().map(|s| s == "daemon").unwrap_or(false) {
        run_direct(&args);
    }

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
        "argv": args
    });
    if let Some(ref s) = shell {
        req["shell"] = serde_json::json!(s);
    }

    // Try daemon socket; fall back to direct mode
    let mut stream = match daemon::connect() {
        Ok(s) => s,
        Err(_) => {
            run_direct(&args);
            return;
        }
    };

    if let Err(e) = stream.write_all(req.to_string().as_bytes())
        .and_then(|_| stream.write_all(b"\n"))
    {
        eprintln!("Error writing to socket: {}", e);
        std::process::exit(1);
    }

    let mut buf = String::new();
    if let Err(e) = stream.read_to_string(&mut buf) {
        eprintln!("Error reading from socket: {}", e);
        std::process::exit(1);
    }

    let res: serde_json::Value = match serde_json::from_str(&buf) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Error parsing response: {}", e);
            std::process::exit(1);
        }
    };

    if kind == "complete" {
        if let Some(output) = res["completionOutput"].as_str() {
            print!("{}", output);
            return;
        }
        if let Some(arr) = res["completions"].as_array() {
            for v in arr {
                if let Some(s) = v.as_str() {
                    println!("{}", s);
                }
            }
        }
        return;
    }

    if let Some(out) = res["stdout"].as_str() {
        print!("{}", out);
    }
    if let Some(err) = res["stderr"].as_str() {
        eprint!("{}", err);
    }

    let exit_code = res["exitCode"].as_i64().unwrap_or(1) as i32;
    std::process::exit(exit_code);
}
