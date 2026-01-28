import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  hashQueryParams,
  generateStateFilePath,
  createVirginStateFile,
  createStateFile,
  readStateFile,
  updateStateFile,
  deleteStateFile,
  isVirginState,
  cleanupStaleStateFiles,
  resolveStatePath,
  isStateShorthand,
  type PaginationState,
} from './pagination-state.js';

const TEST_DIR = '/tmp/max-pagination-state-test';

beforeEach(() => {
  // Create test directory
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  // Clean up test directory
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('hashQueryParams', () => {
  test('produces consistent hash for same params', () => {
    const params = { source: 'hubspot', type: 'contact', filter: 'email~=test' };
    const hash1 = hashQueryParams(params);
    const hash2 = hashQueryParams(params);
    expect(hash1).toBe(hash2);
  });

  test('produces different hash for different params', () => {
    const params1 = { source: 'hubspot', type: 'contact' };
    const params2 = { source: 'hubspot', type: 'deal' };
    expect(hashQueryParams(params1)).not.toBe(hashQueryParams(params2));
  });

  test('handles undefined optional params', () => {
    const params1 = { source: 'hubspot' };
    const params2 = { source: 'hubspot', type: undefined, filter: undefined };
    expect(hashQueryParams(params1)).toBe(hashQueryParams(params2));
  });

  test('different filters produce different hashes', () => {
    const params1 = { source: 'hubspot', filter: 'a=1' };
    const params2 = { source: 'hubspot', filter: 'b=2' };
    expect(hashQueryParams(params1)).not.toBe(hashQueryParams(params2));
  });
});

describe('generateStateFilePath', () => {
  test('creates path in state directory', () => {
    const filePath = generateStateFilePath(TEST_DIR);
    expect(filePath).toContain(path.join(TEST_DIR, 'state'));
    expect(filePath).toEndWith('.json');
  });

  test('creates state directory if it does not exist', () => {
    const stateDir = path.join(TEST_DIR, 'state');
    expect(fs.existsSync(stateDir)).toBe(false);
    generateStateFilePath(TEST_DIR);
    expect(fs.existsSync(stateDir)).toBe(true);
  });
});

describe('createVirginStateFile', () => {
  test('creates file with null fields and returns shorthand', () => {
    const stateRef = createVirginStateFile(TEST_DIR);
    expect(isStateShorthand(stateRef)).toBe(true);

    const filePath = resolveStatePath(TEST_DIR, stateRef);
    expect(fs.existsSync(filePath)).toBe(true);

    const state = readStateFile(filePath);
    expect(state).not.toBeNull();
    expect(state!.version).toBe(1);
    expect(state!.source).toBeNull();
    expect(state!.offset).toBe(0);
    expect(state!.total).toBeNull();
    expect(state!.hasMore).toBeNull();
    expect(state!.queryHash).toBeNull();
  });

  test('creates unique files on each call', () => {
    const ref1 = createVirginStateFile(TEST_DIR);
    const ref2 = createVirginStateFile(TEST_DIR);
    expect(ref1).not.toBe(ref2);
  });
});

describe('createStateFile', () => {
  test('creates file with query params and returns shorthand', () => {
    const params = { source: 'hubspot', type: 'contact' };
    const stateRef = createStateFile(TEST_DIR, params, 1000, 100);
    expect(isStateShorthand(stateRef)).toBe(true);

    const filePath = resolveStatePath(TEST_DIR, stateRef);
    expect(fs.existsSync(filePath)).toBe(true);

    const state = readStateFile(filePath);
    expect(state).not.toBeNull();
    expect(state!.source).toBe('hubspot');
    expect(state!.offset).toBe(100);
    expect(state!.total).toBe(1000);
    expect(state!.hasMore).toBe(true);
    expect(state!.queryHash).toBe(hashQueryParams(params));
  });

  test('defaults offset to 0', () => {
    const params = { source: 'hubspot' };
    const stateRef = createStateFile(TEST_DIR, params, 1000);
    const filePath = resolveStatePath(TEST_DIR, stateRef);

    const state = readStateFile(filePath);
    expect(state!.offset).toBe(0);
    expect(state!.hasMore).toBe(true);
  });

  test('sets hasMore to false when offset >= total', () => {
    const params = { source: 'hubspot' };
    const stateRef = createStateFile(TEST_DIR, params, 100, 100);
    const filePath = resolveStatePath(TEST_DIR, stateRef);

    const state = readStateFile(filePath);
    expect(state!.hasMore).toBe(false);
  });
});

describe('readStateFile', () => {
  test('returns null for non-existent file', () => {
    const state = readStateFile('/nonexistent/path.json');
    expect(state).toBeNull();
  });

  test('returns null for invalid JSON', () => {
    const filePath = path.join(TEST_DIR, 'invalid.json');
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(filePath, 'not json');
    expect(readStateFile(filePath)).toBeNull();
  });

  test('returns null for wrong version', () => {
    const filePath = path.join(TEST_DIR, 'wrong-version.json');
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ version: 2 }));
    expect(readStateFile(filePath)).toBeNull();
  });
});

describe('updateStateFile', () => {
  test('updates specific fields', () => {
    const stateRef = createVirginStateFile(TEST_DIR);
    const filePath = resolveStatePath(TEST_DIR, stateRef);

    updateStateFile(filePath, {
      source: 'hubspot',
      offset: 50,
      total: 1000,
      hasMore: true,
      queryHash: 'abc123',
    });

    const state = readStateFile(filePath);
    expect(state!.source).toBe('hubspot');
    expect(state!.offset).toBe(50);
    expect(state!.total).toBe(1000);
    expect(state!.hasMore).toBe(true);
    expect(state!.queryHash).toBe('abc123');
  });

  test('throws for non-existent file', () => {
    expect(() => updateStateFile('/nonexistent/path.json', { offset: 10 })).toThrow();
  });
});

describe('deleteStateFile', () => {
  test('deletes existing file via shorthand', () => {
    const stateRef = createVirginStateFile(TEST_DIR);
    const filePath = resolveStatePath(TEST_DIR, stateRef);
    expect(fs.existsSync(filePath)).toBe(true);

    deleteStateFile(TEST_DIR, stateRef);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('deletes existing file via full path', () => {
    const stateRef = createVirginStateFile(TEST_DIR);
    const filePath = resolveStatePath(TEST_DIR, stateRef);
    expect(fs.existsSync(filePath)).toBe(true);

    deleteStateFile(TEST_DIR, filePath);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('does not throw for non-existent file', () => {
    expect(() => deleteStateFile(TEST_DIR, '/nonexistent/path.json')).not.toThrow();
    expect(() => deleteStateFile(TEST_DIR, 'max:nonexistent')).not.toThrow();
  });
});

describe('isVirginState', () => {
  test('returns true when queryHash is null', () => {
    const state: PaginationState = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: null,
      offset: 0,
      total: null,
      hasMore: null,
      queryHash: null,
    };
    expect(isVirginState(state)).toBe(true);
  });

  test('returns false when queryHash is set', () => {
    const state: PaginationState = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: 'hubspot',
      offset: 0,
      total: 1000,
      hasMore: true,
      queryHash: 'abc123',
    };
    expect(isVirginState(state)).toBe(false);
  });
});

describe('cleanupStaleStateFiles', () => {
  test('removes files older than 24 hours', () => {
    const params = { source: 'hubspot' };
    const stateRef = createStateFile(TEST_DIR, params, 1000);
    const filePath = resolveStatePath(TEST_DIR, stateRef);

    // Manually set createdAt to 25 hours ago
    const state = readStateFile(filePath)!;
    state.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));

    const cleaned = cleanupStaleStateFiles(TEST_DIR);
    expect(cleaned).toBe(1);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('keeps files younger than 24 hours', () => {
    const params = { source: 'hubspot' };
    const stateRef = createStateFile(TEST_DIR, params, 1000);
    const filePath = resolveStatePath(TEST_DIR, stateRef);

    const cleaned = cleanupStaleStateFiles(TEST_DIR);
    expect(cleaned).toBe(0);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('returns 0 for non-existent directory', () => {
    const cleaned = cleanupStaleStateFiles('/nonexistent/dir');
    expect(cleaned).toBe(0);
  });
});

describe('isStateShorthand', () => {
  test('returns true for max: prefix', () => {
    expect(isStateShorthand('max:abc123')).toBe(true);
    expect(isStateShorthand('max:1234567')).toBe(true);
  });

  test('returns false for full paths', () => {
    expect(isStateShorthand('/path/to/file.json')).toBe(false);
    expect(isStateShorthand('./relative/path.json')).toBe(false);
  });
});

describe('resolveStatePath', () => {
  test('resolves shorthand to full path', () => {
    const stateRef = createVirginStateFile(TEST_DIR);
    const filePath = resolveStatePath(TEST_DIR, stateRef);
    expect(filePath).toContain(TEST_DIR);
    expect(filePath).toEndWith('.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('returns full path unchanged', () => {
    const fullPath = '/some/full/path.json';
    expect(resolveStatePath(TEST_DIR, fullPath)).toBe(fullPath);
  });

  test('throws for non-existent shorthand', () => {
    expect(() => resolveStatePath(TEST_DIR, 'max:nonexistent')).toThrow();
  });
});
