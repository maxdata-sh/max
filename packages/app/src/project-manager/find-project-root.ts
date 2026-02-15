/**
 * Walk up from startDir looking for a Max project root.
 * A valid project root has both a .max/ directory and a max.json file.
 * Returns the project root, or null if none is found.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export function findProjectRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, "max.json")) && fs.existsSync(path.join(dir, ".max"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
