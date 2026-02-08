/**
 * ExecutionRegistryImpl - Builds lookup maps from resolvers.
 *
 * Resolves serialised names (EntityType, LoaderName) back to
 * runtime objects at execution time.
 */

import type {
  EntityDefAny,
  EntityType,
  LoaderName,
  LoaderAny,
  ResolverAny,
} from "@max/core";
import type {ExecutionRegistry} from "@max/execution";

// ============================================================================
// ExecutionRegistryImpl
// ============================================================================

export class ExecutionRegistryImpl implements ExecutionRegistry {
  private entities = new Map<EntityType, EntityDefAny>();
  private loaders = new Map<LoaderName, LoaderAny>();
  private resolversByEntity = new Map<EntityType, ResolverAny>();

  constructor(readonly resolvers: readonly ResolverAny[]) {
    for (const resolver of resolvers) {
      const entityType = resolver.entity.name as EntityType;
      this.entities.set(entityType, resolver.entity);
      this.resolversByEntity.set(entityType, resolver);

      for (const loader of resolver.loaders) {
        this.loaders.set(loader.name, loader);
      }
    }
  }

  getEntity(name: EntityType): EntityDefAny | undefined {
    return this.entities.get(name);
  }

  getLoader(name: LoaderName): LoaderAny | undefined {
    return this.loaders.get(name);
  }

  getResolver(entityType: EntityType): ResolverAny | undefined {
    return this.resolversByEntity.get(entityType);
  }
}
