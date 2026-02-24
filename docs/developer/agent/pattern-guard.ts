#!/usr/bin/env bun
/**
 * Pattern Guard — PostToolUse hook for Write|Edit
 *
 * Reads pattern definitions from .claude/patterns.md and checks written/edited
 * content against them. Emits just-in-time guidance on first match.
 *
 * Frequency modes:
 *   always — fire every time the pattern matches
 *   once   — fire only on first detection per session (tracked via temp file)
 */

import { readFileSync, existsSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";

// --- Types ---

interface Pattern {
  id: string;
  regex: RegExp;
  frequency: "always" | "once";
  files: string[];
  guidance: string;
}

interface HookInput {
  tool_name: string;
  tool_input: {
    file_path?: string;
    content?: string;
    new_string?: string;
    old_string?: string;
  };
  session_id?: string;
  sessionId?: string;
}

// --- Parse patterns.md ---

function parsePatterns(mdPath: string): Pattern[] {
  if (!existsSync(mdPath)) return [];

  const content = readFileSync(mdPath, "utf-8");
  const sections = content.split(/^## /m).slice(1); // split on ## headers, drop preamble

  return sections.flatMap((section) => {
    const lines = section.split("\n");
    const id = lines[0].trim();
    if (!id) return [];

    let pattern: string | null = null;
    let frequency: "always" | "once" = "always";
    let files: string[] = ["*.ts", "*.tsx"];
    let guidanceStartLine = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      const patternMatch = line.match(/^- pattern:\s*`(.+)`/);
      if (patternMatch) {
        pattern = patternMatch[1];
        guidanceStartLine = i + 1;
        continue;
      }

      const freqMatch = line.match(/^- frequency:\s*(\w+)/);
      if (freqMatch) {
        frequency = freqMatch[1] as "always" | "once";
        guidanceStartLine = i + 1;
        continue;
      }

      const filesMatch = line.match(/^- files:\s*`(.+)`/);
      if (filesMatch) {
        files = filesMatch[1].split(",").map((f) => f.trim());
        guidanceStartLine = i + 1;
        continue;
      }

      // First non-field, non-blank line starts guidance
      if (line.trim() && !line.startsWith("- ")) {
        guidanceStartLine = i;
        break;
      }

      guidanceStartLine = i + 1;
    }

    if (!pattern) return [];

    const guidance = lines
      .slice(guidanceStartLine)
      .join("\n")
      .trim();

    if (!guidance) return [];

    try {
      return [{ id, regex: new RegExp(pattern), frequency, files, guidance }];
    } catch {
      return []; // skip invalid regex
    }
  });
}

// --- File extension matching ---

function matchesFileFilter(filePath: string, globs: string[]): boolean {
  return globs.some((glob) => {
    // Simple extension matching: *.ts matches .ts files
    if (glob.startsWith("*.")) {
      const ext = glob.slice(1); // ".ts"
      return filePath.endsWith(ext);
    }
    return false;
  });
}

// --- Session state ---

function stateFile(sessionId: string): string {
  return `/tmp/claude-pg-${sessionId}`;
}

function hasFired(sessionId: string, patternId: string): boolean {
  const path = stateFile(sessionId);
  if (!existsSync(path)) return false;
  return readFileSync(path, "utf-8").includes(patternId);
}

function markFired(sessionId: string, patternId: string): void {
  appendFileSync(stateFile(sessionId), patternId + "\n");
}

// --- Main ---

const input: HookInput = await Bun.stdin.json();

const toolName = input.tool_name;
const filePath = input.tool_input?.file_path ?? "";
const sessionId = input.session_id ?? input.sessionId ?? "";

// Extract content based on tool
let content: string;
if (toolName === "Write") {
  content = input.tool_input?.content ?? "";
} else if (toolName === "Edit") {
  content = input.tool_input?.new_string ?? "";
} else {
  process.exit(0);
}

if (!content || !filePath) process.exit(0);

// Find patterns.md relative to this script (../ from hooks/)
const patternsPath = resolve(dirname(import.meta.path), "patterns.md");
const patterns = parsePatterns(patternsPath);

// Check each pattern
for (const pattern of patterns) {
  if (!matchesFileFilter(filePath, pattern.files)) continue;
  if (!pattern.regex.test(content)) continue;

  // Frequency gating
  if (pattern.frequency === "once") {
    if (hasFired(sessionId, pattern.id)) continue;
    markFired(sessionId, pattern.id);
  }

  // Emit guidance for first matching pattern
  const output = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `PATTERN GUARD [${pattern.id}]: ${pattern.guidance}`,
    },
  };

  console.log(JSON.stringify(output));
  process.exit(0);
}

process.exit(0);
