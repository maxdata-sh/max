import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface PaginationState {
  version: 1;
  createdAt: string;
  source: string | null;
  offset: number;
  total: number | null;
  hasMore: boolean | null;
  queryHash: string | null;
}

export interface QueryParams {
  source: string;
  type?: string;
  filter?: string;
}

const STATE_FILE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STATE_SHORTHAND_PREFIX = 'max:';
const STATE_SHORTHAND_LENGTH = 7; // Similar to git short hashes

/**
 * Generate a SHA256 hash from query params for validation.
 * Note: limit is intentionally excluded so users can adjust batch size during pagination.
 */
export function hashQueryParams(params: QueryParams): string {
  const normalized = JSON.stringify({
    source: params.source,
    type: params.type ?? null,
    filter: params.filter ?? null,
  });
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Ensure the state directory exists.
 */
function ensureStateDir(configDir: string): string {
  const stateDir = path.join(configDir, 'state');
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  return stateDir;
}

/**
 * Generate a unique shorthand hash for a state file.
 */
function generateShorthand(): string {
  return crypto.randomBytes(4).toString('hex').slice(0, STATE_SHORTHAND_LENGTH);
}

/**
 * Generate a state file path.
 * Format: .max/state/<timestamp>-<random>.json
 */
export function generateStateFilePath(configDir: string): string {
  const stateDir = ensureStateDir(configDir);
  const timestamp = Date.now();
  const randomPart = crypto.randomBytes(4).toString('hex');
  return path.join(stateDir, `${timestamp}-${randomPart}.json`);
}

/**
 * Create a symlink shorthand for a state file.
 * Returns the shorthand (e.g., "max:a1b2c3d")
 */
function createShorthandSymlink(configDir: string, targetPath: string): string {
  const stateDir = ensureStateDir(configDir);
  const shorthand = generateShorthand();
  const symlinkPath = path.join(stateDir, shorthand);

  // Create relative symlink (just the filename since they're in the same dir)
  const targetFilename = path.basename(targetPath);
  fs.symlinkSync(targetFilename, symlinkPath);

  return `${STATE_SHORTHAND_PREFIX}${shorthand}`;
}

/**
 * Check if a state reference is a shorthand (e.g., "max:a1b2c3d")
 */
export function isStateShorthand(ref: string): boolean {
  return ref.startsWith(STATE_SHORTHAND_PREFIX);
}

/**
 * Resolve a state reference to a file path.
 * Handles both shorthand (max:xxx) and full paths.
 */
export function resolveStatePath(configDir: string, ref: string): string {
  if (!isStateShorthand(ref)) {
    return ref; // Already a full path
  }

  const shorthand = ref.slice(STATE_SHORTHAND_PREFIX.length);
  const stateDir = path.join(configDir, 'state');
  const symlinkPath = path.join(stateDir, shorthand);

  // Follow the symlink to get the actual file path
  if (!fs.existsSync(symlinkPath)) {
    throw new Error(`State shorthand not found: ${ref}`);
  }

  // Resolve the symlink to the actual file
  const targetFilename = fs.readlinkSync(symlinkPath);
  return path.join(stateDir, targetFilename);
}

/**
 * Format a state file path for display.
 * If the file has a shorthand symlink, returns the shorthand.
 * Otherwise returns the full path.
 */
export function formatStateRef(configDir: string, filePath: string): string {
  const stateDir = path.join(configDir, 'state');
  const targetFilename = path.basename(filePath);

  // Look for a symlink pointing to this file
  try {
    for (const entry of fs.readdirSync(stateDir)) {
      // Skip .json files (the actual state files)
      if (entry.endsWith('.json')) continue;

      const entryPath = path.join(stateDir, entry);
      try {
        const linkTarget = fs.readlinkSync(entryPath);
        if (linkTarget === targetFilename) {
          return `${STATE_SHORTHAND_PREFIX}${entry}`;
        }
      } catch {
        // Not a symlink, skip
      }
    }
  } catch {
    // Directory doesn't exist or other error
  }

  return filePath;
}

/**
 * Create a virgin state file (no query params yet).
 * Returns the shorthand reference (e.g., "max:a1b2c3d").
 */
export function createVirginStateFile(configDir: string): string {
  const filePath = generateStateFilePath(configDir);
  const state: PaginationState = {
    version: 1,
    createdAt: new Date().toISOString(),
    source: null,
    offset: 0,
    total: null,
    hasMore: null,
    queryHash: null,
  };
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  return createShorthandSymlink(configDir, filePath);
}

/**
 * Create a state file with known query params.
 * Returns the shorthand reference (e.g., "max:a1b2c3d").
 */
export function createStateFile(
  configDir: string,
  params: QueryParams,
  total: number,
  offset: number = 0
): string {
  const filePath = generateStateFilePath(configDir);
  const state: PaginationState = {
    version: 1,
    createdAt: new Date().toISOString(),
    source: params.source,
    offset,
    total,
    hasMore: offset < total,
    queryHash: hashQueryParams(params),
  };
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  return createShorthandSymlink(configDir, filePath);
}

/**
 * Read and parse a state file.
 * Returns null if the file doesn't exist or is invalid.
 */
export function readStateFile(filePath: string): PaginationState | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const state = JSON.parse(content) as PaginationState;
    if (state.version !== 1) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * Update a state file with new values.
 */
export function updateStateFile(
  filePath: string,
  updates: Partial<PaginationState>
): void {
  const state = readStateFile(filePath);
  if (!state) {
    throw new Error(`State file not found: ${filePath}`);
  }
  const updated = { ...state, ...updates };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
}

/**
 * Delete a state file and its symlink.
 * Accepts either a shorthand (max:xxx) or full path.
 */
export function deleteStateFile(configDir: string, ref: string): void {
  try {
    if (isStateShorthand(ref)) {
      const shorthand = ref.slice(STATE_SHORTHAND_PREFIX.length);
      const stateDir = path.join(configDir, 'state');
      const symlinkPath = path.join(stateDir, shorthand);

      if (fs.existsSync(symlinkPath)) {
        // Get the target file before deleting the symlink
        const targetFilename = fs.readlinkSync(symlinkPath);
        const targetPath = path.join(stateDir, targetFilename);

        // Delete the symlink
        fs.unlinkSync(symlinkPath);

        // Delete the target file
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      }
    } else {
      // Full path - delete the file and find/delete any symlink pointing to it
      if (fs.existsSync(ref)) {
        const stateDir = path.dirname(ref);
        const targetFilename = path.basename(ref);

        // Find and delete any symlink pointing to this file
        try {
          for (const entry of fs.readdirSync(stateDir)) {
            if (entry.endsWith('.json')) continue;
            const entryPath = path.join(stateDir, entry);
            try {
              const linkTarget = fs.readlinkSync(entryPath);
              if (linkTarget === targetFilename) {
                fs.unlinkSync(entryPath);
                break;
              }
            } catch {
              // Not a symlink, skip
            }
          }
        } catch {
          // Ignore errors
        }

        fs.unlinkSync(ref);
      }
    }
  } catch {
    // Ignore errors during deletion
  }
}

/**
 * Check if a state is virgin (no query hash yet).
 */
export function isVirginState(state: PaginationState): boolean {
  return state.queryHash === null;
}

/**
 * Cleanup stale state files older than TTL.
 * Also removes orphaned symlinks.
 * Returns the number of files cleaned up.
 */
export function cleanupStaleStateFiles(configDir: string): number {
  const stateDir = path.join(configDir, 'state');
  if (!fs.existsSync(stateDir)) {
    return 0;
  }

  const now = Date.now();
  let cleaned = 0;
  const deletedFiles = new Set<string>();

  try {
    // First pass: find and delete stale .json files
    for (const file of fs.readdirSync(stateDir)) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(stateDir, file);
      const state = readStateFile(filePath);
      if (state) {
        const createdAt = new Date(state.createdAt).getTime();
        if (now - createdAt > STATE_FILE_TTL_MS) {
          fs.unlinkSync(filePath);
          deletedFiles.add(file);
          cleaned++;
        }
      }
    }

    // Second pass: remove symlinks pointing to deleted files
    for (const entry of fs.readdirSync(stateDir)) {
      if (entry.endsWith('.json')) continue;

      const entryPath = path.join(stateDir, entry);
      try {
        const linkTarget = fs.readlinkSync(entryPath);
        if (deletedFiles.has(linkTarget)) {
          fs.unlinkSync(entryPath);
        }
      } catch {
        // Not a symlink or broken symlink - try to remove if broken
        try {
          const stat = fs.lstatSync(entryPath);
          if (stat.isSymbolicLink()) {
            // Check if symlink is broken
            try {
              fs.statSync(entryPath);
            } catch {
              // Broken symlink, remove it
              fs.unlinkSync(entryPath);
            }
          }
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore errors during cleanup
  }

  return cleaned;
}
