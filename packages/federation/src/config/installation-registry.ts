export type InstallationRegistryConfig =
  | { type: 'in-memory' }
  | { type: 'fs'; workspaceRoot?: string }


export type ResolvedInstallationRegistryConfig =
  | { type: 'max-json', maxJsonPath: string }
  | { type: "in-memory" }

