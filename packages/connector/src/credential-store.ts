/**
 * CredentialStore — Platform-provided storage for secrets scoped to an installation.
 *
 * Dumb key-value storage. Appropriate for encryption, auditing, persistence.
 * Connectors interact with credentials through CredentialProvider, not the store directly.
 */

import { ErrCredentialNotFound } from "./errors.js";

// ============================================================================
// CredentialStore Interface
// ============================================================================

export interface CredentialStore {
  /** Retrieve a secret by name */
  get(name: string): Promise<string>;

  /** Store a secret by name */
  set(name: string, value: string): Promise<void>;

  /** Check if a credential exists */
  has(name: string): Promise<boolean>;

  /** Remove a credential */
  delete(name: string): Promise<void>;

  /** List all credential names (not values) */
  keys(): Promise<string[]>;
}

// ============================================================================
// InMemoryCredentialStore (testing implementation)
// ============================================================================

class InMemoryCredentialStore implements CredentialStore {
  private store: Map<string, string>;

  constructor(initial?: Record<string, string>) {
    this.store = new Map(initial ? Object.entries(initial) : []);
  }

  async get(name: string): Promise<string> {
    if (!this.store.has(name)) {
      throw ErrCredentialNotFound.create({ credential: name });
    }
    return this.store.get(name)!;
  }

  async set(name: string, value: string): Promise<void> {
    this.store.set(name, value);
  }

  async has(name: string): Promise<boolean> {
    return this.store.has(name);
  }

  async delete(name: string): Promise<void> {
    this.store.delete(name);
  }

  async keys(): Promise<string[]> {
    return [...this.store.keys()];
  }
}

// ============================================================================
// Testing stub
// ============================================================================

export class StubbedCredentialStore extends InMemoryCredentialStore {}
