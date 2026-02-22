/**
 * Initialise a new Max project directory.
 *
 * Creates a .max/ directory and an empty max.json if they don't exist.
 */

import * as fs from "node:fs"
import * as path from "node:path"

export function initProject(dir: string): void {
  fs.mkdirSync(path.join(dir, ".max"), { recursive: true })
  const configPath = path.join(dir, "max.json")
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({}, null, 2))
  }
}
