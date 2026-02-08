/**
 * MaxPage<E, S> - A page of entity refs with scope-upgradeable cursor.
 *
 * Used when pagination cursors are Refs that must cross scope boundaries.
 * When upgrading scope (local -> system), both items and cursor are upgraded.
 *
 * @example
 * const page: MaxPage<User, LocalScope> = MaxPage.from(refs, true, cursorRef);
 * const upgraded: MaxPage<User, SystemScope> = page.upgradeScope(systemScope);
 */

import type { EntityDefAny } from "./entity-def.js";
import type { Scope, LocalScope } from "./scope.js";
import type { ScopeUpgradeable } from "./ref.js";
import { Ref } from "./ref.js";
import { type RefKey, RefKey as RefKeyUtil } from "./ref-key.js";
import { Page } from "./pagination.js";
import { StaticTypeCompanion } from "./companion.js";

// ============================================================================
// MaxPage Interface
// ============================================================================

/**
 * MaxPage<E, S> - A page of entity references at scope S.
 *
 * E = Entity definition type
 * S = Scope (defaults to Scope union — "any scope")
 *
 * The cursor is a Ref<E, S>, enabling scope upgrading at boundaries.
 */
export interface MaxPage<
  E extends EntityDefAny = EntityDefAny,
  S extends Scope = Scope,
> extends ScopeUpgradeable {
  readonly items: Ref<E, S>[];
  readonly hasMore: boolean;
  readonly cursor?: Ref<E, S>;
  readonly scope: S;

  /** Upgrade all refs (items + cursor) to a new scope */
  upgradeScope<NewS extends Scope>(newScope: NewS): MaxPage<E, NewS>;

  /** Convert to a regular Page, serializing the cursor ref to a RefKey string */
  toPage(): Page<Ref<E, S>>;
}

/** Any MaxPage */
export type MaxPageAny = MaxPage<EntityDefAny, Scope>;

// ============================================================================
// MaxPage Implementation (internal)
// ============================================================================

class MaxPageImpl<E extends EntityDefAny, S extends Scope>
  implements MaxPage<E, S>
{
  constructor(
    readonly items: Ref<E, S>[],
    readonly hasMore: boolean,
    readonly scope: S,
    readonly cursor?: Ref<E, S>,
  ) {}

  upgradeScope<NewS extends Scope>(newScope: NewS): MaxPage<E, NewS> {
    const upgradedItems = this.items.map((ref) => ref.upgradeScope(newScope));
    const upgradedCursor = this.cursor?.upgradeScope(newScope);
    return new MaxPageImpl(upgradedItems, this.hasMore, newScope, upgradedCursor);
  }

  toPage(): Page<Ref<E, S>> {
    const cursorStr = this.cursor?.toKey() as string | undefined;
    return Page.from(this.items, this.hasMore, cursorStr);
  }
}

// ============================================================================
// MaxPage Static Methods (namespace merge)
// ============================================================================

export const MaxPage = StaticTypeCompanion({
  /**
   * Create a MaxPage from refs.
   * Scope is derived from the cursor ref, or the first item, or defaults to local.
   */
  from<E extends EntityDefAny, S extends Scope>(
    items: Ref<E, S>[],
    hasMore: boolean,
    cursor?: Ref<E, S>,
  ): MaxPage<E, S> {
    const scope = (cursor?.scope ?? items[0]?.scope ?? { kind: "local" }) as S;
    return new MaxPageImpl(items, hasMore, scope, cursor);
  },

  /** Create an empty MaxPage in a given scope */
  empty<E extends EntityDefAny, S extends Scope = LocalScope>(
    scope?: S,
  ): MaxPage<E, S> {
    return new MaxPageImpl([], false, (scope ?? { kind: "local" }) as S);
  },

  /**
   * Convert a Page<Ref<E, S>> to a MaxPage by parsing the string cursor as a RefKey.
   *
   * @param page - A regular page of refs
   * @param entityDef - The entity definition (needed to reconstruct the cursor ref)
   * @param scope - The scope for the cursor ref
   */
  fromPage<E extends EntityDefAny, S extends Scope>(
    page: Page<Ref<E, S>>,
    entityDef: E,
    scope: S,
  ): MaxPage<E, S> {
    const cursor = page.cursor
      ? Ref.fromKey(entityDef, page.cursor as RefKey).upgradeScope(scope)
      : undefined;
    return new MaxPageImpl(page.items, page.hasMore, scope, cursor as Ref<E, S> | undefined);
  },
});
