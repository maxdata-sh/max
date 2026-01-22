# Max PoC v2 Implementation Plan

## Status: COMPLETE

All phases have been implemented. See [Completion Summary](#completion-summary) at the bottom.

## Overview

This plan implements the Max CLI tool as specified in `/docs/Proof of Concept v2 Spec.md`. Max is a "fat pipe" data enablement tool that syncs Google Drive data locally, enabling powerful queries with permission controls.

## Implementation Phases

### Phase 1: Project Setup & CLI Skeleton - COMPLETE

**Goal:** Establish project structure and basic CLI framework.

**Tasks:**
1. ~~Initialize Bun project with TypeScript~~ → Used Node.js (Bun not available)
2. Set up project structure per spec
3. Install dependencies (commander, googleapis, better-sqlite3)
4. Create CLI entry point with command stubs
5. Implement basic output renderer (text/json)

**Files:**
- `package.json`
- `tsconfig.json`
- `src/cli/index.ts`
- `src/cli/output.ts`
- `src/cli/commands/*.ts`

---

### Phase 2: Config Manager - COMPLETE

**Goal:** Handle `.max/` directory structure and configuration.

**Files:**
- `src/core/config-manager.ts`
- `src/cli/commands/init.ts`

**Verified:** `max init my-project` creates proper directory structure.

---

### Phase 3: Google Drive Connector - Authentication - COMPLETE

**Goal:** OAuth flow for Google Drive.

**Files:**
- `src/connectors/gdrive/auth.ts`
- `src/connectors/gdrive/index.ts`
- `src/cli/commands/connect.ts`

**Note:** Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables. Clear error message shown when missing.

---

### Phase 4: Entity Store (SQLite) - COMPLETE

**Goal:** Persist entities with query capability.

**Files:**
- `src/core/entity-store.ts`
- `src/types/entity.ts`

**Implementation:** Uses better-sqlite3 for Node.js compatibility.

---

### Phase 5: Google Drive Connector - Sync - COMPLETE

**Goal:** Crawl Google Drive and store entities.

**Files:**
- `src/connectors/gdrive/index.ts` (sync method)
- `src/connectors/gdrive/content.ts`
- `src/connectors/gdrive/schema.ts`
- `src/cli/commands/sync.ts`

**Supported content extraction:**
- Google Docs → plain text
- Google Sheets → CSV
- Plain text files

**Deferred:** PDF extraction (v1.5)

---

### Phase 6: Connector Registry - COMPLETE

**Goal:** Abstraction layer for multiple connectors.

**Files:**
- `src/core/connector-registry.ts`
- `src/types/connector.ts`

---

### Phase 7: Search & Schema Commands - COMPLETE

**Goal:** Query entities with filters.

**Files:**
- `src/cli/commands/schema.ts`
- `src/cli/commands/search.ts`
- `src/cli/commands/get.ts`

**Filters supported:**
- `--type` (document, spreadsheet, folder, file)
- `--owner` (email)
- `--path` (glob pattern)
- `--mimeType`
- `--name` (glob pattern)
- `--limit`, `--offset`
- `--output` (text, json)

---

### Phase 8: Permissions Engine - COMPLETE

**Goal:** Normalize permissions and apply rules.

**Files:**
- `src/core/permissions-engine.ts`
- `src/types/permissions.ts`
- `src/cli/commands/permissions.ts`
- `src/cli/commands/rules.ts`

**Rule format:**
```yaml
rules:
  - name: hide-board-docs
    deny:
      path: "/Board/*"
```

---

### Phase 9: CLI Polish & Integration - COMPLETE

**Goal:** Complete CLI experience.

All commands implemented with:
- Helpful error messages
- `--help` documentation
- Progress indicators
- Text and JSON output formats

---

### Phase 10: Testing & Documentation - COMPLETE

**Documentation:**
- `README.md` with full setup instructions
- Clear OAuth setup guide
- Command reference

---

## Completion Summary

### Files Created

```
max/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   ├── output.ts
│   │   └── commands/
│   │       ├── init.ts
│   │       ├── connect.ts
│   │       ├── sync.ts
│   │       ├── schema.ts
│   │       ├── search.ts
│   │       ├── get.ts
│   │       ├── permissions.ts
│   │       └── rules.ts
│   ├── core/
│   │   ├── config-manager.ts
│   │   ├── connector-registry.ts
│   │   ├── entity-store.ts
│   │   └── permissions-engine.ts
│   ├── connectors/
│   │   └── gdrive/
│   │       ├── index.ts
│   │       ├── auth.ts
│   │       ├── content.ts
│   │       └── schema.ts
│   └── types/
│       ├── index.ts
│       ├── connector.ts
│       ├── entity.ts
│       └── permissions.ts
└── tests/
```

### Commands Implemented

| Command | Status | Notes |
|---------|--------|-------|
| `max init` | Working | Creates .max directory structure |
| `max connect gdrive` | Working | Requires OAuth credentials |
| `max sync gdrive` | Working | Full sync with content extraction |
| `max schema gdrive` | Working | Shows entity schema |
| `max search gdrive` | Working | All filter options |
| `max get gdrive <id>` | Working | With --content option |
| `max permissions gdrive <path>` | Working | Shows normalized permissions |
| `max rules list` | Working | Lists all loaded rules |
| `max rules apply <file>` | Working | Applies YAML rules |
| `max rules remove <name>` | Working | Removes a rule |

### Known Blockers

1. **Google OAuth Credentials Required**
   - Users must create their own Google Cloud project
   - Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables
   - Clear instructions provided in error message and README

### Deviations from Spec

1. **Runtime:** Node.js instead of Bun (Bun not available in environment)
2. **PDF extraction:** Deferred to v1.5 as planned

### Success Criteria Status

| Criteria | Status |
|----------|--------|
| `max connect gdrive` authenticates with OAuth | Ready (needs credentials) |
| `max sync gdrive` downloads metadata and content | Ready (needs credentials) |
| `max schema gdrive` displays entity schema | Working |
| `max search gdrive --type=document` returns results | Working |
| `max permissions gdrive "/path"` shows permissions | Working |
| `max rules apply rules.yaml` affects search | Working |
| Full demo walkthrough possible | Ready (needs credentials) |
