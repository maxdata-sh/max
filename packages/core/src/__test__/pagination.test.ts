/**
 * Tests for Page<T>, PageRequest, and MaxPage<E, S>
 *
 * These tests serve as a DX playground — demonstrating the API ergonomics
 * for common pagination scenarios.
 */

import { describe, test, expect } from "bun:test";
import { Page, PageRequest } from "../pagination.js";
import { MaxPage } from "../max-page.js";
import { EntityDef } from "../entity-def.js";
import { Field } from "../field.js";
import { Ref } from "../ref.js";
import { Scope } from "../scope.js";
import type { EntityId, InstallationId } from "../ref-key.js";

// ============================================================================
// Test Helpers
// ============================================================================

const User = EntityDef.create("User", {
  name: Field.string(),
  email: Field.string(),
});

function makeLocalRefs(count: number) {
  return Array.from({ length: count }, (_, i) =>
    Ref.installation(User, `u${i + 1}` as EntityId)
  );
}

// ============================================================================
// Page<T>
// ============================================================================

describe("Page", () => {
  describe("Page.from()", () => {
    test("creates a page with items and metadata", () => {
      const page = Page.from([1, 2, 3], true, "next-cursor", 100);

      expect(page.items).toEqual([1, 2, 3]);
      expect(page.hasMore).toBe(true);
      expect(page.cursor).toBe("next-cursor");
      expect(page.total).toBe(100);
    });
  });

  describe("Page.empty()", () => {
    test("creates an empty page with hasMore=false", () => {
      const page = Page.empty<string>();

      expect(page.items).toEqual([]);
      expect(page.hasMore).toBe(false);
      expect(page.cursor).toBeUndefined();
    });
  });

  describe("Page.fromOffset()", () => {
    test("trims items and sets hasMore when results exceed limit", () => {
      // Simulating: asked for fetchSize=4 (limit=3 + 1), got 4 back
      const page = Page.fromOffset([10, 20, 30, 40], 0, 3);

      expect(page.items).toEqual([10, 20, 30]); // trimmed to limit
      expect(page.hasMore).toBe(true);
      expect(page.cursor).toBe("3"); // offset(0) + limit(3)
    });

    test("returns all items when results fit within limit", () => {
      // Simulating: asked for fetchSize=4 (limit=3 + 1), got only 2 back
      const page = Page.fromOffset([10, 20], 0, 3);

      expect(page.items).toEqual([10, 20]);
      expect(page.hasMore).toBe(false);
      expect(page.cursor).toBeUndefined();
    });

    test("handles continuation from a non-zero offset", () => {
      const page = Page.fromOffset(["d", "e", "f", "g"], 3, 3);

      expect(page.items).toEqual(["d", "e", "f"]);
      expect(page.hasMore).toBe(true);
      expect(page.cursor).toBe("6"); // offset(3) + limit(3)
    });
  });

  describe("Page.fromNext()", () => {
    test("with token: hasMore=true, cursor set", () => {
      const page = Page.fromNext(["a", "b"], "tok_abc");

      expect(page.items).toEqual(["a", "b"]);
      expect(page.hasMore).toBe(true);
      expect(page.cursor).toBe("tok_abc");
    });

    test("without token: hasMore=false", () => {
      const page = Page.fromNext(["a", "b"], null);

      expect(page.items).toEqual(["a", "b"]);
      expect(page.hasMore).toBe(false);
      expect(page.cursor).toBeUndefined();
    });

    test("with undefined token: hasMore=false", () => {
      const page = Page.fromNext(["a", "b"]);

      expect(page.hasMore).toBe(false);
      expect(page.cursor).toBeUndefined();
    });
  });

  describe("page.map()", () => {
    test("transforms items while preserving cursor and hasMore", () => {
      const page = Page.from([1, 2, 3], true, "cursor-5", 100);
      const mapped = page.map((n) => n * 10);

      expect(mapped.items).toEqual([10, 20, 30]);
      expect(mapped.hasMore).toBe(true);
      expect(mapped.cursor).toBe("cursor-5");
      expect(mapped.total).toBe(100);
    });
  });
});

// ============================================================================
// PageRequest
// ============================================================================

describe("PageRequest", () => {
  describe("Page.begin()", () => {
    test("creates an initial request with optional limit", () => {
      const req = Page.begin(100);

      expect(req.cursor).toBeUndefined();
      expect(req.limit).toBe(100);
    });

    test("creates an initial request without limit", () => {
      const req = Page.begin();

      expect(req.cursor).toBeUndefined();
      expect(req.limit).toBeUndefined();
    });
  });

  describe("PageRequest.from()", () => {
    test("wraps a plain {cursor, limit} object", () => {
      const req = PageRequest.from({ cursor: "abc", limit: 50 });

      expect(req.cursor).toBe("abc");
      expect(req.limit).toBe(50);
    });

    test("wraps undefined into a blank request", () => {
      const req = PageRequest.from(undefined);

      expect(req.cursor).toBeUndefined();
      expect(req.limit).toBeUndefined();
    });
  });

  describe("PageRequest.at()", () => {
    test("creates a request at a specific cursor", () => {
      const req = PageRequest.at("cursor-5", 25);

      expect(req.cursor).toBe("cursor-5");
      expect(req.limit).toBe(25);
    });
  });

  describe("defaultLimit()", () => {
    test("fills in limit when not specified", () => {
      const req = Page.begin();
      const resolved = req.defaultLimit(100);

      expect(resolved.limit).toBe(100);
    });

    test("preserves caller-specified limit", () => {
      const req = Page.begin(25);
      const resolved = req.defaultLimit(100);

      expect(resolved.limit).toBe(25); // caller's 25 wins over default 100
    });
  });

  describe("fetchSize", () => {
    test("is limit + 1 on resolved request", () => {
      const resolved = Page.begin(50).defaultLimit(100);

      expect(resolved.fetchSize).toBe(51); // 50 + 1
    });
  });

  describe("offset()", () => {
    test("parses cursor as number", () => {
      const req = PageRequest.at("42");

      expect(req.parseAsNumericOffset(0)).toBe(42);
    });

    test("returns default when no cursor", () => {
      const req = Page.begin();

      expect(req.parseAsNumericOffset(0)).toBe(0);
    });
  });

  describe("parseCursor()", () => {
    test("parses cursor with custom function", () => {
      const req = PageRequest.at("2024-01-15");
      const date = req.parseCursor((s) => new Date(s), new Date(0));

      expect(date.getFullYear()).toBe(2024);
    });

    test("returns default when no cursor", () => {
      const req = Page.begin();
      const date = req.parseCursor((s) => new Date(s), new Date(0));

      expect(date.getFullYear()).toBe(1970);
    });
  });
});

// ============================================================================
// DX: Full Pagination Flows
// ============================================================================

describe("DX: offset-based pagination flow", () => {
  // Simulates a third-party API that uses offset/limit
  const slackApi = {
    getUsers(offset: number, limit: number) {
      const all = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
      return all.slice(offset, offset + limit);
    },
  };

  function getUsers(req: PageRequest): Page<string> {
    const r = req.defaultLimit(2);
    const offset = r.parseAsNumericOffset(0);
    const results = slackApi.getUsers(offset, r.fetchSize);
    return Page.fromOffset(results, offset, r.limit);
  }

  test("first page", () => {
    const page = getUsers(Page.begin());

    expect(page.items).toEqual(["Alice", "Bob"]);
    expect(page.hasMore).toBe(true);
    expect(page.cursor).toBe("2");
  });

  test("second page using cursor from first", () => {
    const page1 = getUsers(Page.begin());
    const page2 = getUsers(PageRequest.at(page1.cursor!));

    expect(page2.items).toEqual(["Charlie", "Diana"]);
    expect(page2.hasMore).toBe(true);
    expect(page2.cursor).toBe("4");
  });

  test("last page", () => {
    const page = getUsers(PageRequest.at("4"));

    expect(page.items).toEqual(["Eve"]);
    expect(page.hasMore).toBe(false);
    expect(page.cursor).toBeUndefined();
  });

  test("caller-specified limit overrides default", () => {
    const page = getUsers(Page.begin(3));

    expect(page.items).toEqual(["Alice", "Bob", "Charlie"]);
    expect(page.hasMore).toBe(true);
  });
});

describe("DX: token-based pagination flow", () => {
  // Simulates an API that returns { items, nextToken }
  const linearApi = {
    getIssues(cursor?: string, limit?: number) {
      const pages: Record<string, { items: string[]; nextToken: string | null }> = {
        start: { items: ["ISS-1", "ISS-2"], nextToken: "tok_2" },
        tok_2: { items: ["ISS-3", "ISS-4"], nextToken: "tok_3" },
        tok_3: { items: ["ISS-5"], nextToken: null },
      };
      return pages[cursor ?? "start"];
    },
  };

  function getIssues(req: PageRequest): Page<string> {
    const r = req.defaultLimit(50);
    const { items, nextToken } = linearApi.getIssues(r.cursor, r.limit);
    return Page.fromNext(items, nextToken);
  }

  test("first page", () => {
    const page = getIssues(Page.begin());

    expect(page.items).toEqual(["ISS-1", "ISS-2"]);
    expect(page.hasMore).toBe(true);
    expect(page.cursor).toBe("tok_2");
  });

  test("follow pages until exhausted", () => {
    let page = getIssues(Page.begin());
    const allItems = [...page.items];

    while (page.hasMore) {
      page = getIssues(PageRequest.at(page.cursor!));
      allItems.push(...page.items);
    }

    expect(allItems).toEqual(["ISS-1", "ISS-2", "ISS-3", "ISS-4", "ISS-5"]);
    expect(page.hasMore).toBe(false);
  });
});

// ============================================================================
// MaxPage<E, S>
// ============================================================================

describe("MaxPage", () => {
  describe("MaxPage.from()", () => {
    test("creates a page of local refs", () => {
      const refs = makeLocalRefs(3);
      const cursor = Ref.installation(User, "u3" as EntityId);
      const page = MaxPage.from(refs, true, cursor);

      expect(page.items).toHaveLength(3);
      expect(page.hasMore).toBe(true);
      expect(page.cursor?.id).toBe("u3");
      expect(page.scope.kind).toBe("installation");
    });
  });

  describe("MaxPage.empty()", () => {
    test("creates an empty page", () => {
      const page = MaxPage.empty();

      expect(page.items).toEqual([]);
      expect(page.hasMore).toBe(false);
      expect(page.scope.kind).toBe("installation");
    });
  });

  describe("upgradeScope()", () => {
    test("upgrades all refs to workspace scope", () => {
      const refs = makeLocalRefs(2);
      const cursor = Ref.installation(User, "u2" as EntityId);
      const localPage = MaxPage.from(refs, true, cursor);

      const workspaceScope = Scope.workspace("inst-1" as InstallationId);
      const workspacePage = localPage.upgradeScope(workspaceScope);

      // Items upgraded
      expect(workspacePage.items[0].scope.kind).toBe("workspace");
      expect(workspacePage.items[1].scope.kind).toBe("workspace");

      // Cursor upgraded
      expect(workspacePage.cursor?.scope.kind).toBe("workspace");

      // Scope set
      expect(workspacePage.scope).toEqual(workspaceScope);
      expect(workspacePage.hasMore).toBe(true);
    });
  });

  describe("toPage()", () => {
    test("converts to Page with string cursor", () => {
      const refs = makeLocalRefs(2);
      const cursor = Ref.installation(User, "u2" as EntityId);
      const maxPage = MaxPage.from(refs, true, cursor);

      const page = maxPage.toPage();

      expect(page.items).toEqual(refs);
      expect(page.hasMore).toBe(true);
      expect(page.cursor).toBe(cursor.toKey()); // RefKey string
    });

    test("converts empty MaxPage to empty Page", () => {
      const page = MaxPage.empty().toPage();

      expect(page.items).toEqual([]);
      expect(page.hasMore).toBe(false);
      expect(page.cursor).toBeUndefined();
    });
  });
});
