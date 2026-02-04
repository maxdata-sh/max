/**
 * Engine Interface Design v2
 *
 * Refinements:
 * - *Any convention for generic interfaces
 * - Helper classes for complex construction
 * - Reusable concepts (Pagination, EntityInput)
 * - Fields selector pattern for load()
 * - Proxy approach sketch
 */

// ============================================================================
// PART 1: Foundational Types
// ============================================================================

/** Branded string for type-safe references */
declare const RefBrand: unique symbol;
export type Ref<E extends EntityDefAny> = string & { [RefBrand]: E };

/** Any ref - for functions that don't care about the entity type */
export type RefAny = Ref<EntityDefAny>;

// --- Field Definition Helpers (less verbose) ---

export type ScalarType = "string" | "number" | "boolean" | "date";

export interface ScalarField<T extends ScalarType = ScalarType> {
  kind: "scalar";
  type: T;
}

export interface RefField<T extends EntityDefAny = EntityDefAny> {
  kind: "ref";
  target: T;
}

export interface CollectionField<T extends EntityDefAny = EntityDefAny> {
  kind: "collection";
  target: T;
}

export type FieldDef = ScalarField | RefField | CollectionField;

// Shorthand constructors for field definitions
export const Field = {
  string: (): ScalarField<"string"> => ({ kind: "scalar", type: "string" }),
  number: (): ScalarField<"number"> => ({ kind: "scalar", type: "number" }),
  boolean: (): ScalarField<"boolean"> => ({ kind: "scalar", type: "boolean" }),
  date: (): ScalarField<"date"> => ({ kind: "scalar", type: "date" }),
  ref: <T extends EntityDefAny>(target: T): RefField<T> => ({ kind: "ref", target }),
  collection: <T extends EntityDefAny>(target: T): CollectionField<T> => ({ kind: "collection", target }),
} as const;

/** All fields for an entity */
export type FieldDefinitions = Record<string, FieldDef>;

/** Extract the TypeScript type for a field */
export type FieldType<F extends FieldDef> =
  F extends ScalarField<"string"> ? string :
  F extends ScalarField<"number"> ? number :
  F extends ScalarField<"boolean"> ? boolean :
  F extends ScalarField<"date"> ? Date :
  F extends RefField<infer T> ? Ref<T> :
  F extends CollectionField<infer T> ? Ref<T>[] :
  never;

/** Extract all field types for an entity */
export type EntityFields<E extends EntityDefAny> = {
  [K in keyof E["fields"]]: FieldType<E["fields"][K]>;
};

// ============================================================================
// PART 2: EntityDef
// ============================================================================

/**
 * EntityDef - the runtime object that also serves as the type.
 */
export interface EntityDef<Fields extends FieldDefinitions = FieldDefinitions> {
  readonly name: string;
  readonly fields: Fields;
  ref(id: string): Ref<this>;
}

/** Any EntityDef - for functions that accept any entity */
export type EntityDefAny = EntityDef<FieldDefinitions>;

// ============================================================================
// PART 3: Pagination (reusable concept)
// ============================================================================

export interface Page<T> {
  readonly items: T[];
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly total?: number;
}

export interface PageRequest {
  cursor?: string;
  limit?: number;
}

/** Helper class for creating Page instances */
export class PageOf<T> implements Page<T> {
  constructor(
    readonly items: T[],
    readonly hasMore: boolean,
    readonly cursor?: string,
    readonly total?: number
  ) {}

  static empty<T>(): Page<T> {
    return new PageOf([], false);
  }

  static single<T>(item: T): Page<T> {
    return new PageOf([item], false);
  }

  static from<T>(items: T[], hasMore: boolean, cursor?: string): Page<T> {
    return new PageOf(items, hasMore, cursor);
  }
}

// ============================================================================
// PART 4: EntityInput (for store operations)
// ============================================================================

/**
 * EntityInput - the shape for creating/updating entities.
 * Can be passed around and returned from other methods.
 */
export type EntityInput<E extends EntityDefAny> = Partial<EntityFields<E>>;

/** Any EntityInput - for functions that don't care about entity type */
export type EntityInputAny = EntityInput<EntityDefAny>;

// ============================================================================
// PART 5: Fields Selector (for load operations)
// ============================================================================

/**
 * FieldSelector - specify which fields to load.
 * Prevents accidental "load everything" calls.
 */
export type FieldSelector<E extends EntityDefAny> =
  | FieldsSelect<E, keyof EntityFields<E>>
  | FieldsAll;

export interface FieldsSelect<
  E extends EntityDefAny,
  K extends keyof EntityFields<E>
> {
  kind: "select";
  fields: K[];
}

export interface FieldsAll {
  kind: "all";
}

/** Helper for creating field selectors */
export const Fields = {
  select<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ...fields: K[]
  ): FieldsSelect<E, K> {
    return { kind: "select", fields };
  },

  ALL: { kind: "all" } as FieldsAll
} as const;

// Convenience: "*" can also mean all
export type FieldSelectorShorthand<E extends EntityDefAny> =
  | FieldSelector<E>
  | "*"
  | (keyof EntityFields<E>)[];

// ============================================================================
// PART 6: EntityResult
// ============================================================================

/**
 * EntityResult - wrapper around loaded entity data.
 * Tracks which fields were loaded at the type level.
 */
export interface EntityResult<
  E extends EntityDefAny,
  Loaded extends keyof EntityFields<E> = keyof EntityFields<E>
> {
  readonly def: E;
  readonly ref: Ref<E>;

  /** Access a loaded field (type-safe - only loaded fields allowed) */
  get<K extends Loaded>(field: K): EntityFields<E>[K];

  /** Access a field that may not be loaded */
  maybeGet<K extends keyof EntityFields<E>>(field: K): EntityFields<E>[K] | undefined;

  /** Check if a field is loaded */
  has(field: keyof EntityFields<E>): boolean;

  /** Get all loaded field names */
  loadedFields(): Loaded[];

  /** Get as plain object (only loaded fields) */
  toObject(): Pick<EntityFields<E>, Loaded>;
}

/** Any EntityResult - for functions that don't care about specifics */
export type EntityResultAny = EntityResult<EntityDefAny, string>;

/** Helper class for creating EntityResult instances */
export class EntityResultOf<
  E extends EntityDefAny,
  Loaded extends keyof EntityFields<E>
> implements EntityResult<E, Loaded> {
  private readonly data: Map<string, unknown>;

  constructor(
    readonly def: E,
    readonly ref: Ref<E>,
    data: Partial<EntityFields<E>>
  ) {
    this.data = new Map(Object.entries(data));
  }

  get<K extends Loaded>(field: K): EntityFields<E>[K] {
    if (!this.data.has(field as string)) {
      throw new Error(`Field '${String(field)}' not loaded`);
    }
    return this.data.get(field as string) as EntityFields<E>[K];
  }

  maybeGet<K extends keyof EntityFields<E>>(field: K): EntityFields<E>[K] | undefined {
    return this.data.get(field as string) as EntityFields<E>[K] | undefined;
  }

  has(field: keyof EntityFields<E>): boolean {
    return this.data.has(field as string);
  }

  loadedFields(): Loaded[] {
    return Array.from(this.data.keys()) as Loaded[];
  }

  toObject(): Pick<EntityFields<E>, Loaded> {
    return Object.fromEntries(this.data) as Pick<EntityFields<E>, Loaded>;
  }

  /** Factory: create from partial data */
  static from<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    def: E,
    ref: Ref<E>,
    data: Pick<EntityFields<E>, K>
  ): EntityResult<E, K> {
    return new EntityResultOf(def, ref, data);
  }
}

// ============================================================================
// PART 7: Proxy Approach (alternative to .get())
// ============================================================================

/**
 * EntityProxy - alternative to EntityResult using Proxy.
 * Direct property access instead of .get()
 *
 * Trade-offs:
 * - Pro: Cleaner syntax (result.name vs result.get("name"))
 * - Pro: Feels more like working with plain objects
 * - Con: Harder to distinguish loaded vs unloaded at type level
 * - Con: "Magic" behavior - less explicit
 */

export type EntityProxy<
  E extends EntityDefAny,
  Loaded extends keyof EntityFields<E> = keyof EntityFields<E>
> = {
  readonly [K in Loaded]: EntityFields<E>[K];
} & {
  readonly $ref: Ref<E>;
  readonly $def: E;
  readonly $has: (field: keyof EntityFields<E>) => boolean;
  readonly $loadedFields: () => Loaded[];
};

/** Any EntityProxy */
export type EntityProxyAny = EntityProxy<EntityDefAny, string>;

/** Create a proxy from data */
function createEntityProxy<E extends EntityDefAny, K extends keyof EntityFields<E>>(
  def: E,
  ref: Ref<E>,
  data: Pick<EntityFields<E>, K>
): EntityProxy<E, K> {
  const base = {
    $ref: ref,
    $def: def,
    $has: (field: keyof EntityFields<E>) => field in data,
    $loadedFields: () => Object.keys(data) as K[],
  };

  return new Proxy({ ...base, ...data } as EntityProxy<E, K>, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      throw new Error(`Field '${String(prop)}' not loaded`);
    },
  });
}

// ============================================================================
// PART 8: Engine Interface
// ============================================================================

export interface Engine {
  /**
   * Load specific fields of an entity.
   * Must specify which fields via Fields.select() or Fields.all() or "*"
   */
  load<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    fields: FieldsSelect<E, K>
  ): Promise<EntityResult<E, K>>;

  load<E extends EntityDefAny>(
    ref: Ref<E>,
    fields: FieldsAll | "*"
  ): Promise<EntityResult<E, keyof EntityFields<E>>>;

  /**
   * Load a single field.
   */
  loadField<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    field: K
  ): Promise<EntityFields<E>[K]>;

  /**
   * Load a collection field with pagination.
   */
  loadCollection<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    field: K,
    options?: PageRequest
  ): Promise<Page<Ref<E>>>; // TODO: properly type the collection target

  /**
   * Store field values for an entity.
   */
  store<E extends EntityDefAny>(
    def: E,
    id: string,
    input: EntityInput<E>
  ): Promise<Ref<E>>;

  /**
   * Query entities.
   */
  query<E extends EntityDefAny>(def: E): QueryBuilder<E>;
}

export interface QueryBuilder<E extends EntityDefAny> {
  where<K extends keyof EntityFields<E>>(
    field: K,
    op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains",
    value: EntityFields<E>[K]
  ): QueryBuilder<E>;

  limit(n: number): QueryBuilder<E>;
  offset(n: number): QueryBuilder<E>;
  orderBy<K extends keyof EntityFields<E>>(field: K, dir?: "asc" | "desc"): QueryBuilder<E>;

  /** Execute and return refs only */
  refs(): Promise<Ref<E>[]>;

  /** Execute with specific fields loaded */
  select<K extends keyof EntityFields<E>>(...fields: K[]): Promise<EntityResult<E, K>[]>;

  /** Execute with all fields loaded */
  selectAll(): Promise<EntityResult<E, keyof EntityFields<E>>[]>;
}

/** Any QueryBuilder */
export type QueryBuilderAny = QueryBuilder<EntityDefAny>;

// ============================================================================
// PART 9: Example Entity Definitions (codegen output)
// ============================================================================

// Simplified with Field helpers

export interface SlackUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
  avatarUrl: ScalarField<"string">;
  isAdmin: ScalarField<"boolean">;
}> {}
export declare const SlackUser: SlackUser;

export interface SlackTeam extends EntityDef<{
  name: ScalarField<"string">;
  domain: ScalarField<"string">;
  channels: CollectionField<typeof SlackChannel>;
}> {}
export declare const SlackTeam: SlackTeam;

export interface SlackChannel extends EntityDef<{
  name: ScalarField<"string">;
  topic: ScalarField<"string">;
  isPrivate: ScalarField<"boolean">;
  team: RefField<typeof SlackTeam>;
  members: CollectionField<typeof SlackUser>;
  creator: RefField<typeof SlackUser>;
}> {}
export declare const SlackChannel: SlackChannel;

export interface SlackMessage extends EntityDef<{
  text: ScalarField<"string">;
  timestamp: ScalarField<"date">;
  channel: RefField<typeof SlackChannel>;
  author: RefField<typeof SlackUser>;
}> {}
export declare const SlackMessage: SlackMessage;

// ============================================================================
// PART 10: Usage Examples
// ============================================================================

declare const engine: Engine;

async function examples() {
  const channelRef = SlackChannel.ref("C123");
  const userRef = SlackUser.ref("U456");

  // --- Load with explicit field selection ---
  const result = await engine.load(channelRef, Fields.select("name", "topic"));

  result.get("name");    // string
  result.get("topic");   // string
  // @ts-expect-error - 'team' not in selected fields
  result.get("team");

  // --- Load all fields ---
  const full = await engine.load(channelRef, Fields.ALL);
  // or
  const full2 = await engine.load(channelRef, "*");

  full.get("team");  // Ref<SlackTeam> - all fields available

  // --- Load single field ---
  const name = await engine.loadField(channelRef, "name");
  // name is string directly, not wrapped

  // --- Load collection with pagination ---
  const membersPage = await engine.loadCollection(channelRef, "members", { limit: 50 });

  membersPage.items;    // Ref<SlackUser>[]
  membersPage.hasMore;  // boolean

  if (membersPage.hasMore) {
    const nextPage = await engine.loadCollection(channelRef, "members", {
      cursor: membersPage.cursor,
      limit: 50,
    });
  }

  // --- Store with EntityInput ---
  const input: EntityInput<typeof SlackChannel> = {
    name: "new-channel",
    topic: "A new channel",
    team: SlackTeam.ref("T123"),
  };

  // Can pass input around, return from functions, etc.
  const newRef = await engine.store(SlackChannel, "C789", input);

  // --- Query ---
  const publicChannels = await engine
    .query(SlackChannel)
    .where("isPrivate", "=", false)
    .orderBy("name")
    .limit(10)
    .select("name", "topic");

  for (const ch of publicChannels) {
    ch.get("name");
  }

  // --- Functions that accept any entity result ---
  function logResult(result: EntityResultAny): void {
    console.log(`Loaded ${result.loadedFields().length} fields for ${result.ref}`);
  }



  logResult(result);  // Works

  // --- Proxy approach comparison ---
  // If we used proxies instead:
  const proxy = createEntityProxy(SlackChannel, channelRef, { name: "general", topic: "chat" });

  proxy.name;    // string - direct access
  proxy.topic;   // string
  proxy.$ref;    // the ref
  proxy.$has("team");  // false
}

// ============================================================================
// PART 11: Facets - Open Question
// ============================================================================

/*
 * OPTION A: Facets as field names (simple)
 *
 * interface FileLike {
 *   filename: string;
 *   sizeBytes: number;
 * }
 *
 * interface GDriveFile extends EntityDef<{...}>, FileLike {}
 *
 * Problem: "name" collision if multiple facets have "name"
 *
 *
 * OPTION B: Facets as namespaced fields
 *
 * interface GDriveFile extends EntityDef<{
 *   fileLike: FacetField<FileLike>;  // { filename, sizeBytes }
 *   userLike: FacetField<UserLike>;  // { name, email }
 * }> {}
 *
 * Access: file.get("fileLike").filename
 *         file.get("userLike").name
 *
 * No collision - facets are separate namespaces.
 *
 *
 * OPTION C: Hybrid - namespaced in storage, flattened in type if no collision
 *
 * If a facet has unique field names, they're accessible directly.
 * If there's a collision, must use namespace.
 *
 *
 * QUESTION: Do facets with same field coalesce?
 *
 * If GDriveFile implements FileLike and TeamLike, and both have "name":
 * - Coalesce: one "name" field, both facets share it
 * - Separate: "fileLike.name" and "teamLike.name" are distinct
 *
 * Coalesce is simpler but may not always make semantic sense.
 * Separate is more explicit but verbose.
 *
 * Recommendation: Start with namespaced (Option B), explicit over magic.
 * Can add flattening sugar later if it proves useful.
 */

// ============================================================================
// OBSERVATIONS
// ============================================================================

/*
 * WHAT'S NEW IN V2:
 *
 * 1. *Any convention - EntityResultAny, QueryBuilderAny, etc.
 * 2. Helper classes - PageOf, EntityResultOf with factory methods
 * 3. Reusable concepts - Page<T>, PageRequest, EntityInput
 * 4. Fields selector - explicit load() field selection
 * 5. Proxy sketch - alternative DX for comparison
 * 6. Simplified field definitions - ScalarField<"string"> etc.
 *
 * STILL TO DECIDE:
 *
 * 1. Proxy vs .get() - what's the preferred DX?
 * 2. Facets - namespaced vs flat?
 * 3. How does this connect to storage layer?
 */
