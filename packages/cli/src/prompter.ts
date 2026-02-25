/**
 * Prompter — Abstraction over interactive terminal I/O.
 *
 * Two implementations:
 *   DirectPrompter  — Real readline, for in-process CLI execution
 *   SocketPrompter  — Proxies prompts over a socket, for daemon mode
 *
 * Any code that needs user input (onboarding, interactive commands) takes
 * a Prompter and doesn't care how input is collected.
 */

import { createInterface } from "node:readline";
import { Writable } from "node:stream";

// ============================================================================
// Interface
// ============================================================================

export interface AskOptions {
  /** When true, input is not echoed to the terminal. */
  secret?: boolean;
}

export interface Prompter {
  /** Display a message and wait for user input. */
  ask(message: string, options?: AskOptions): Promise<string>;
  /** Write output text to the user (no input expected). */
  write(text: string): void;
  /** Clean up resources. */
  close(): void;
}

// ============================================================================
// DirectPrompter — real readline
// ============================================================================

/** A writable stream that discards all output (used to suppress echo). */
const silentOutput = new Writable({ write(_chunk, _encoding, cb) { cb(); } });

export class DirectPrompter implements Prompter {
  private rl = createInterface({ input: process.stdin, output: process.stdout });

  ask(message: string, options?: AskOptions): Promise<string> {
    if (options?.secret) {
      return this.askSecret(message);
    }
    return new Promise((resolve) => {
      this.rl.question(message, (answer) => resolve(answer.trim()));
    });
  }

  write(text: string): void {
    process.stdout.write(text);
  }

  close(): void {
    this.rl.close();
  }

  private askSecret(message: string): Promise<string> {
    // Print the prompt ourselves, then read with a silent readline
    process.stdout.write(message);
    const secretRl = createInterface({ input: process.stdin, output: silentOutput });
    return new Promise((resolve) => {
      secretRl.question("", (answer) => {
        secretRl.close();
        process.stdout.write("\n");
        resolve(answer.trim());
      });
    });
  }
}

// ============================================================================
// SocketPrompter — proxies over a bidirectional socket connection
// ============================================================================

/** Messages sent from daemon to shim. */
export type DaemonMessage =
  | { kind: "prompt"; message: string; secret?: boolean }
  | { kind: "write"; text: string }
  | { kind: "response"; stdout?: string; stderr?: string; exitCode: number; completions?: string[]; completionOutput?: string }

/** Messages sent from shim to daemon (after the initial request). */
export type ShimInput = { kind: "input"; value: string }

/**
 * A socket connection that supports the conversational protocol.
 * The socket server wraps the raw Bun socket into this interface.
 */
export interface PromptableSocket {
  /** Send a message to the shim. */
  send(msg: DaemonMessage): void;
  /** Wait for the next input message from the shim. */
  receive(): Promise<ShimInput>;
}

export class SocketPrompter implements Prompter {
  constructor(private socket: PromptableSocket) {}

  async ask(message: string, options?: AskOptions): Promise<string> {
    this.socket.send({ kind: "prompt", message, secret: options?.secret });
    const input = await this.socket.receive();
    return input.value.trim();
  }

  write(text: string): void {
    this.socket.send({ kind: "write", text });
  }

  close(): void {
    // Socket lifecycle managed by the server, not the prompter
  }
}
