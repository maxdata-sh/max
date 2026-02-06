/**
 * Resolver - Maps entity fields to loaders.
 *
 * Each entity has a resolver that declares which loader provides each field.
 * Multiple fields can point to the same loader (batching opportunity).
 *
 * @example
 * const AcmeUserResolver = Resolver.for(AcmeUser, {
 *   name: BasicUserLoader.field("user_name"),
 *   email: BasicUserLoader.field("email"),
 *   avatarUrl: ProfileLoader.field("avatar_url"),
 * });
 */

import { StaticTypeCompanion } from "./companion.js";
import type { EntityDefAny } from "./entity-def.js";
import type { EntityFields } from "./field-types.js";
import type { ContextDefAny } from "./context-def.js";
import type { FieldAssignment, LoaderAny } from "./loader.js";

// ============================================================================
// Resolver Interface
// ============================================================================

/**
 * FieldMapping - Internal representation of how a field is resolved.
 */
export interface FieldMapping {
  /** The loader that provides this field */
  readonly loader: LoaderAny;

  /** Source field name in loader output (if different from entity field) */
  readonly sourceField: string | undefined;
}

/**
 * Resolver<E, TContext> - Maps entity fields to loaders.
 *
 * Use Resolver.for() to create.
 */
export interface Resolver<
  E extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny
> {
  /** The entity this resolver is for */
  readonly entity: E;

  /** All loaders used by this resolver */
  readonly loaders: readonly LoaderAny[];

  /** Field mappings (field name → loader info) */
  readonly fieldMappings: Partial<Record<keyof EntityFields<E>, FieldMapping>>;

  /**
   * Get the loader for a specific field.
   */
  getLoaderForField<K extends keyof EntityFields<E>>(field: K): LoaderAny | undefined;

  /**
   * Get all fields that use a specific loader.
   */
  getFieldsForLoader(loader: LoaderAny): (keyof EntityFields<E>)[];
}

/** Any resolver */
export type ResolverAny = Resolver<EntityDefAny, ContextDefAny>;

// ============================================================================
// Resolver Implementation
// ============================================================================

class ResolverImpl<E extends EntityDefAny, TContext extends ContextDefAny>
  implements Resolver<E, TContext>
{
  readonly loaders: readonly LoaderAny[];
  readonly fieldMappings: Partial<Record<keyof EntityFields<E>, FieldMapping>>;

  constructor(
    readonly entity: E,
    fieldAssignments: Partial<Record<keyof EntityFields<E>, FieldAssignment>>
  ) {
    // Build field mappings from assignments
    const mappings: Partial<Record<keyof EntityFields<E>, FieldMapping>> = {};
    const loaderSet = new Set<LoaderAny>();

    for (const [fieldName, assignment] of Object.entries(fieldAssignments)) {
      if (assignment) {
        mappings[fieldName as keyof EntityFields<E>] = {
          loader: assignment.loader,
          sourceField: assignment.sourceField,
        };
        loaderSet.add(assignment.loader);
      }
    }

    this.fieldMappings = mappings;
    this.loaders = Array.from(loaderSet);
  }

  getLoaderForField<K extends keyof EntityFields<E>>(field: K): LoaderAny | undefined {
    const mapping = this.fieldMappings[field];
    return mapping?.loader;
  }

  getFieldsForLoader(loader: LoaderAny): (keyof EntityFields<E>)[] {
    const fields: (keyof EntityFields<E>)[] = [];

    for (const [fieldName, mapping] of Object.entries(this.fieldMappings)) {
      if (mapping?.loader === loader) {
        fields.push(fieldName as keyof EntityFields<E>);
      }
    }

    return fields;
  }
}

// ============================================================================
// Resolver Static Companion
// ============================================================================

export const Resolver = StaticTypeCompanion({
  /**
   * Create a resolver for an entity.
   *
   * @example
   * const AcmeUserResolver = Resolver.for(AcmeUser, {
   *   name: BasicUserLoader.field("user_name"),
   *   email: BasicUserLoader.field("email"),
   *   avatarUrl: ProfileLoader.field("avatar_url"),
   * });
   */
  for<E extends EntityDefAny, TContext extends ContextDefAny = ContextDefAny>(
    entity: E,
    fields: Partial<{
      [K in keyof EntityFields<E>]: FieldAssignment<E>;
    }>
  ): Resolver<E, TContext> {
    return new ResolverImpl(entity, fields);
  },
});
