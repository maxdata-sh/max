/**
 * ConnectorRegistry — Maps connector names to their modules.
 *
 * Supports local modules (in the codebase) with lazy loading and caching.
 * Remote modules deferred to future work.
 */

import { StaticTypeCompanion } from "@max/core";
import type { ConnectorModuleAny } from "./connector-module.js";
import {
  ErrConnectorNotFound,
  ErrConnectorAlreadyRegistered,
  ErrAddLocalNotSupported,
} from "./errors.js";

// ============================================================================
// ConnectorRegistryEntry
// ============================================================================

export interface ConnectorRegistryEntry {
  name: string;
  source: "local" | "remote";
}

// ============================================================================
// ConnectorRegistry Interface
// ============================================================================

export interface ConnectorRegistry {
  /** Register a local connector by path. Reads package.json for the name. */
  addLocal(loader: () => Promise<{ default: ConnectorModuleAny }>): void;

  /** Register a local connector with an explicit name. */
  addLocalNamed(name: string, loader: () => Promise<{ default: ConnectorModuleAny }>): void;

  /** Resolve a connector by name. Lazy-loads and caches. */
  resolve(name: string): Promise<ConnectorModuleAny>;

  /** List registered connectors without loading them. */
  list(): ConnectorRegistryEntry[];
}

// ============================================================================
// ConnectorRegistry Implementation
// ============================================================================

type ConnectorLoader = () => Promise<{ default: ConnectorModuleAny }>;

export class InMemoryConnectorRegistry implements ConnectorRegistry {
  private loaders = new Map<string, ConnectorLoader>();
  private cache = new Map<string, ConnectorModuleAny>();

  addLocal(loader: ConnectorLoader): void {
    // Eager-resolve: load the module to read its def.name
    // This is a trade-off — we need the name to register it.
    // For truly lazy registration, use addLocalNamed().
    throw ErrAddLocalNotSupported.create({});
  }

  addLocalNamed(name: string, loader: ConnectorLoader): void {
    if (this.loaders.has(name)) {
      throw ErrConnectorAlreadyRegistered.create({ connector: name });
    }
    this.loaders.set(name, loader);
  }

  async resolve(name: string): Promise<ConnectorModuleAny> {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const loader = this.loaders.get(name);
    if (!loader) {
      throw ErrConnectorNotFound.create({ connector: name });
    }

    const imported = await loader();
    const mod = imported.default;
    this.cache.set(name, mod);
    return mod;
  }

  list(): ConnectorRegistryEntry[] {
    return [...this.loaders.keys()].map((name) => ({
      name,
      source: "local" as const,
    }));
  }
}
