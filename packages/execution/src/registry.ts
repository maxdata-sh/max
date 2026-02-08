/**
 * Registry - Resolves serialised names back to runtime objects.
 *
 * Tasks reference entities and loaders by name (for persistence).
 * The registry resolves these names back to runtime objects at execution time.
 * Built from the resolvers passed to the executor at startup.
 */

import type {
  EntityDefAny,
  EntityType,
  LoaderName,
  LoaderAny,
  ResolverAny,
} from "@max/core";

// ============================================================================
// ExecutionRegistry
// ============================================================================

export interface ExecutionRegistry {
  /** Look up an EntityDef by its name */
  getEntity(name: EntityType): EntityDefAny | undefined;

  /** Look up a Loader by its name */
  getLoader(name: LoaderName): LoaderAny | undefined;

  /** Get the resolver for an entity type */
  getResolver(entityType: EntityType): ResolverAny | undefined;

  /** All registered resolvers */
  readonly resolvers: readonly ResolverAny[];
}
