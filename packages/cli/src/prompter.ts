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

// ============================================================================
// Interface
// ============================================================================

export interface Prompter {
  /** Display a message and wait for user input. */
  ask(message: string): Promise<string>;
  /** Write output text to the user (no input expected). */
  write(text: string): void;
  /** Clean up resources. */
  close(): void;
}

// ============================================================================
// DirectPrompter — real readline
// ============================================================================

export class DirectPrompter implements Prompter {
  private rl = createInterface({ input: process.stdin, output: process.stdout });

  ask(message: string): Promise<string> {
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
}

// ============================================================================
// SocketPrompter — proxies over a bidirectional socket connection
// ============================================================================

/** Messages sent from daemon to shim. */
export type DaemonMessage =
  | { kind: "prompt"; message: string }
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

  async ask(message: string): Promise<string> {
    this.socket.send({ kind: "prompt", message });
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
