export type CredentialStoreConfig =
  | { type: 'fs'; path?: string }
  | { type: 'in-memory', initialSecrets?: Record<string,string> }
  /** More could come later:
  | { type: 'vault'; url: string }
  | { type: 'keychain';  }
  */

export type ResolvedCredentialStoreConfig =
  | { type: 'fs'; path: string }
  | { type: 'in-memory', initialSecrets: Record<string,string> }

