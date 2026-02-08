Core boundary — packages/core/src/errors/basic-errors.ts

  Existing facets stay. Replace the generic errors with specific ones:
  Error: ErrInvalidRefKey
  Code: core.invalid_ref_key
  Facets: BadInput + data { key: string }
  Replaces: ref-key.ts (4x)
  ────────────────────────────────────────
  Error: ErrFieldNotLoaded
  Code: core.field_not_loaded
  Facets: Invariant + data { entityType: string; field: string }
  Replaces: entity-result.ts (2x)
  ────────────────────────────────────────
  Error: ErrLoaderResultNotAvailable
  Code: core.loader_result_not_available
  Facets: NotFound + data { loaderName: string }
  Replaces: loader.ts (1x)
  ────────────────────────────────────────
  Error: ErrContextBuildFailed
  Code: core.context_build_failed
  Facets: BadInput
  Replaces: context-def.ts (3x — differentiated by context string)
  ────────────────────────────────────────
  Error: ErrBatchKeyMissing
  Code: core.batch_key_missing
  Facets: NotFound + data { key: string }
  Replaces: batch.ts getOrThrow (1x)
  ────────────────────────────────────────
  Error: ErrBatchEmpty
  Code: core.batch_empty
  Facets: Invariant
  Replaces: batch.ts empty batch (1x)
  Remove: ErrNotFound, ErrEntityNotFound, ErrBadInput, ErrNotImplemented, ErrInvariant. These generic errors encouraged skipping domain ownership. The facets remain — they're the
  cross-cutting vocabulary.

  ---
  Storage boundary — new packages/storage-sqlite/src/errors.ts
  ┌───────────────────────────┬──────────────────────────────────┬───────────────────────────────────────────────────────┬───────────────────────────────────────┐
  │           Error           │               Code               │                        Facets                         │               Replaces                │
  ├───────────────────────────┼──────────────────────────────────┼───────────────────────────────────────────────────────┼───────────────────────────────────────┤
  │ ErrEntityNotFound         │ storage.entity_not_found         │ NotFound, HasEntityRef                                │ engine.ts (2x)                        │
  ├───────────────────────────┼──────────────────────────────────┼───────────────────────────────────────────────────────┼───────────────────────────────────────┤
  │ ErrEntityNotRegistered    │ storage.entity_not_registered    │ Invariant + data { entityType: string }               │ schema.ts (1x)                        │
  ├───────────────────────────┼──────────────────────────────────┼───────────────────────────────────────────────────────┼───────────────────────────────────────┤
  │ ErrFieldNotFound          │ storage.field_not_found          │ NotFound + data { entityType: string; field: string } │ engine.ts (1x), query-builder.ts (1x) │
  ├───────────────────────────┼──────────────────────────────────┼───────────────────────────────────────────────────────┼───────────────────────────────────────┤
  │ ErrCollectionNotSupported │ storage.collection_not_supported │ NotImplemented                                        │ engine.ts loadCollection (1x)         │
  ├───────────────────────────┼──────────────────────────────────┼───────────────────────────────────────────────────────┼───────────────────────────────────────┤
  │ ErrInvalidFieldMapping    │ storage.invalid_field_mapping    │ Invariant                                             │ table-def.ts (1x)                     │
  └───────────────────────────┴──────────────────────────────────┴───────────────────────────────────────────────────────┴───────────────────────────────────────┘
  Notes:
  - ErrEntityNotRegistered is Invariant — if an entity def isn't registered, it's a setup bug, not a runtime condition
  - ErrFieldNotFound carries entityType + field — useful for both engine and query-builder cases

  ---
  Execution boundary — new packages/execution-local/src/errors.ts

  Shared by both execution-local and execution-sqlite (they're the same domain).
  Error: ErrUnknownEntityType
  Code: execution.unknown_entity_type
  Facets: NotFound + data { entityType: string }
  Replaces: default-task-runner.ts (3x)
  ────────────────────────────────────────
  Error: ErrNoResolver
  Code: execution.no_resolver
  Facets: NotFound + data { entityType: string }
  Replaces: default-task-runner.ts (2x)
  ────────────────────────────────────────
  Error: ErrNoCollectionLoader
  Code: execution.no_collection_loader
  Facets: NotFound + data { entityType: string; field: string }
  Replaces: default-task-runner.ts (1x)
  ────────────────────────────────────────
  Error: ErrTaskNotFound
  Code: execution.task_not_found
  Facets: NotFound + data { taskId: string }
  Replaces: in-memory-task-store.ts (2x), sqlite-task-store.ts (1x)
  ────────────────────────────────────────
  Error: ErrLoaderDepsNotSupported
  Code: execution.loader_deps_not_supported
  Facets: NotImplemented + data { loaderName: string }
  Replaces: default-task-runner.ts (1x)
  ────────────────────────────────────────
  Error: ErrNoDepsAvailable
  Code: execution.no_deps_available
  Facets: Invariant + data { loaderName: string }
  Replaces: default-task-runner.ts (1x)
  ---
  Data facets to add

  Two new shared data facets in basic-errors.ts:
  ┌───────────────┬───────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────┐
  │     Facet     │                 Data                  │                                          Used by                                          │
  ├───────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ HasField      │ { entityType: string; field: string } │ Core ErrFieldNotLoaded, Storage ErrFieldNotFound, Execution ErrNoCollectionLoader         │
  ├───────────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ HasLoaderName │ { loaderName: string }                │ Core ErrLoaderResultNotAvailable, Execution ErrLoaderDepsNotSupported, ErrNoDepsAvailable │
  └───────────────┴───────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────┘
  ---
  Summary

  - 3 boundaries: Core, Storage, Execution
  - 14 specific errors replacing 31 throw new Error calls
  - 2 new data facets (HasField, HasLoaderName)
  - 5 generic core errors removed — facets stay, every error is domain-owned
  - Every error tells you what the system was trying to do and which boundary it belongs to