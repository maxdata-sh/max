export type SyncMetaConfig =
  //
  | { type: 'sqlite'; dbPath?: string }
  | { type: 'in-memory' }

export type ResolvedSyncMetaConfig =
  //
  | { type: 'sqlite'; dbPath: string }
  | { type: 'in-memory' }

