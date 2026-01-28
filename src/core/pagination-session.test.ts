import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import { PaginationSession, createPaginationHandler } from './pagination-session.js';
import { readStateFile, resolveStatePath } from './pagination-state.js';

const TEST_DIR = '/tmp/max-pagination-session-test';

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('PaginationSession', () => {
  describe('createVirgin', () => {
    test('creates a virgin state file and returns shorthand', () => {
      const stateRef = PaginationSession.createVirgin(TEST_DIR);
      expect(stateRef).toMatch(/^max:/);

      const filePath = resolveStatePath(TEST_DIR, stateRef);
      const state = readStateFile(filePath);
      expect(state).not.toBeNull();
      expect(state!.queryHash).toBeNull();
    });
  });

  describe('resume', () => {
    test('resumes from existing state', () => {
      const stateRef = PaginationSession.createVirgin(TEST_DIR);
      const queryParams = { source: 'hubspot', type: 'contact' };

      const session = PaginationSession.resume(TEST_DIR, stateRef, queryParams);
      expect(session.currentOffset).toBe(0);
      expect(session.isExhausted).toBe(false);
    });

    test('locks in query hash on virgin state', () => {
      const stateRef = PaginationSession.createVirgin(TEST_DIR);
      const queryParams = { source: 'hubspot', type: 'contact' };

      PaginationSession.resume(TEST_DIR, stateRef, queryParams);

      // State should now have query hash locked in
      const filePath = resolveStatePath(TEST_DIR, stateRef);
      const state = readStateFile(filePath);
      expect(state!.queryHash).not.toBeNull();
      expect(state!.source).toBe('hubspot');
    });

    test('throws on query param mismatch', () => {
      const stateRef = PaginationSession.createVirgin(TEST_DIR);
      const queryParams1 = { source: 'hubspot', type: 'contact' };
      const queryParams2 = { source: 'hubspot', type: 'deal' };

      // First resume locks in the query
      PaginationSession.resume(TEST_DIR, stateRef, queryParams1);

      // Second resume with different params should throw
      expect(() => {
        PaginationSession.resume(TEST_DIR, stateRef, queryParams2);
      }).toThrow(/Query params don't match/);
    });

    test('throws for non-existent state', () => {
      expect(() => {
        PaginationSession.resume(TEST_DIR, 'max:nonexistent', { source: 'hubspot' });
      }).toThrow();
    });
  });

  describe('advance', () => {
    test('updates state and returns hint when more results exist', () => {
      const stateRef = PaginationSession.createVirgin(TEST_DIR);
      const queryParams = { source: 'hubspot' };

      const session = PaginationSession.resume(TEST_DIR, stateRef, queryParams);
      const result = session.advance(1000, 100);

      expect(result.hasMore).toBe(true);
      expect(result.hint).toContain('More results (100 of 1000)');
      expect(result.hint).toContain(`--state=${stateRef}`);
      expect(result.stateRef).toBe(stateRef);

      // State file should be updated
      const filePath = resolveStatePath(TEST_DIR, stateRef);
      const state = readStateFile(filePath);
      expect(state!.offset).toBe(100);
      expect(state!.total).toBe(1000);
      expect(state!.hasMore).toBe(true);
    });

    test('returns complete hint when no more results', () => {
      const stateRef = PaginationSession.createVirgin(TEST_DIR);
      const queryParams = { source: 'hubspot' };

      const session = PaginationSession.resume(TEST_DIR, stateRef, queryParams);
      const result = session.advance(100, 100);

      expect(result.hasMore).toBe(false);
      expect(result.hint).toContain('Complete (100 results)');

      // State file should reflect completion
      const filePath = resolveStatePath(TEST_DIR, stateRef);
      const state = readStateFile(filePath);
      expect(state!.hasMore).toBe(false);
    });

    test('tracks cumulative progress across multiple advances', () => {
      const stateRef = PaginationSession.createVirgin(TEST_DIR);
      const queryParams = { source: 'hubspot' };

      const session = PaginationSession.resume(TEST_DIR, stateRef, queryParams);

      // First batch
      session.advance(1000, 100);
      expect(session.currentOffset).toBe(100);

      // Simulate resuming (re-read would normally happen in new command invocation)
      const session2 = PaginationSession.resume(TEST_DIR, stateRef, queryParams);
      expect(session2.currentOffset).toBe(100);

      // Second batch
      session2.advance(1000, 100);
      expect(session2.currentOffset).toBe(200);
    });
  });

  describe('isExhausted', () => {
    test('returns false for virgin state', () => {
      const stateRef = PaginationSession.createVirgin(TEST_DIR);
      const session = PaginationSession.resume(TEST_DIR, stateRef, { source: 'hubspot' });
      expect(session.isExhausted).toBe(false);
    });

    test('returns true when offset >= total', () => {
      const stateRef = PaginationSession.createVirgin(TEST_DIR);
      const queryParams = { source: 'hubspot' };

      const session = PaginationSession.resume(TEST_DIR, stateRef, queryParams);
      session.advance(100, 100); // Complete the pagination

      const session2 = PaginationSession.resume(TEST_DIR, stateRef, queryParams);
      expect(session2.isExhausted).toBe(true);
    });
  });

  describe('createIfNeeded', () => {
    test('creates state file when more results exist', () => {
      const result = PaginationSession.createIfNeeded(
        TEST_DIR,
        { source: 'hubspot' },
        1000,
        100
      );

      expect(result).not.toBeNull();
      expect(result!.hasMore).toBe(true);
      expect(result!.hint).toContain('More results (100 of 1000)');
      expect(result!.stateRef).toMatch(/^max:/);
    });

    test('returns null when no more results', () => {
      const result = PaginationSession.createIfNeeded(
        TEST_DIR,
        { source: 'hubspot' },
        100,
        100
      );

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    test('deletes state file', () => {
      const stateRef = PaginationSession.createVirgin(TEST_DIR);
      const filePath = resolveStatePath(TEST_DIR, stateRef);
      expect(fs.existsSync(filePath)).toBe(true);

      PaginationSession.delete(TEST_DIR, stateRef);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });
});

describe('createPaginationHandler', () => {
  test('returns correct offset when no state provided', () => {
    const handler = createPaginationHandler(
      TEST_DIR,
      undefined,
      { source: 'hubspot' },
      50
    );

    expect(handler.session).toBeNull();
    expect(handler.offset).toBe(50);
    expect(handler.isExhausted).toBe(false);
  });

  test('returns session offset when state provided', () => {
    const stateRef = PaginationSession.createVirgin(TEST_DIR);
    const queryParams = { source: 'hubspot' };

    // First call to set up state
    const handler1 = createPaginationHandler(TEST_DIR, stateRef, queryParams, 0);
    handler1.advance(1000, 100);

    // Second call should use offset from state
    const handler2 = createPaginationHandler(TEST_DIR, stateRef, queryParams, 0);
    expect(handler2.session).not.toBeNull();
    expect(handler2.offset).toBe(100);
  });

  test('advance creates JIT state file when no session', () => {
    const handler = createPaginationHandler(
      TEST_DIR,
      undefined,
      { source: 'hubspot' },
      0
    );

    const hint = handler.advance(1000, 100);
    expect(hint).toContain('More results');
    expect(hint).toContain('--state=max:');
  });

  test('advance returns null when complete and no session', () => {
    const handler = createPaginationHandler(
      TEST_DIR,
      undefined,
      { source: 'hubspot' },
      0
    );

    const hint = handler.advance(100, 100);
    expect(hint).toBeNull();
  });

  test('advance updates existing session', () => {
    const stateRef = PaginationSession.createVirgin(TEST_DIR);
    const queryParams = { source: 'hubspot' };

    const handler = createPaginationHandler(TEST_DIR, stateRef, queryParams, 0);
    const hint = handler.advance(1000, 100);

    expect(hint).toContain('More results (100 of 1000)');
    expect(hint).toContain(stateRef);
  });
});
