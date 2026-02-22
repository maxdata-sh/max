export type TaskStoreConfig =
  | { type: 'sqlite'; dbPath?: string }
  | { type: 'in-memory' }


export type ResolvedTaskStoreConfig =
  | { type: 'sqlite'; dbPath: string }
  | { type: 'in-memory' }

