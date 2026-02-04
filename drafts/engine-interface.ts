/**
 * Engine Interface Design
 *
 * Core principle: We load FIELDS, not entities.
 * An entity is never "fully loaded" - it's a collection of fields,
 * some of which may be loaded, others not.
 */

// ============================================================================
// PART 1: Foundational Types
// ============================================================================

/** Branded string for type-safe references */
declare const RefBrand: unique symbol;
export type Ref<T extends EntityDef> = string & { [RefBrand]: T };

/**
 * EntityDef - the runtime object that also serves as the type.
 *
 * Usage:
 *   SlackMessage.ref("123")     // value context: creates a Ref
 *   Ref<typeof SlackMessage>    // type context: types a reference
 *
 * The `Fields` type parameter carries the full field definitions.
 */
export interface EntityDef<Fields extends FieldDefinitions = FieldDefinitions> {
  readonly name: string;
  readonly fields: Fields;

  /** Create a typed reference to an entity of this type */
  ref(id: string): Ref<this>;
}

/** Field definition - describes a single field */
export type FieldDef =
  | { kind: "scalar"; type: "string" | "number" | "boolean" | "date" }
  | { kind: "ref"; target: EntityDef }
  | { kind: "collection"; target: EntityDef };

/** All fields for an entity */
export type FieldDefinitions = Record<string, FieldDef>;

/** Extract the TypeScript type for a field */
export type FieldType<F extends FieldDef> =
  F extends { kind: "scalar"; type: "string" } ? string :
  F extends { kind: "scalar"; type: "number" } ? number :
  F extends { kind: "scalar"; type: "boolean" } ? boolean :
  F extends { kind: "scalar"; type: "date" } ? Date :
  F extends { kind: "ref"; target: infer T } ? Ref<T & EntityDef> :
  F extends { kind: "collection"; target: infer T } ? Ref<T & EntityDef>[] :
  never;

/** Extract all field types for an entity */
export type EntityFields<E extends EntityDef> = {
  [K in keyof E["fields"]]: FieldType<E["fields"][K]>;
};

// ============================================================================
// PART 2: Result Types
// ============================================================================

/**
 * EntityResult - wrapper around loaded entity data.
 *
 * Key insight: Not all fields are necessarily loaded.
 * The result tracks what was requested and what's available.
 */
export interface EntityResult<
  E extends EntityDef,
  Loaded extends keyof EntityFields<E> = keyof EntityFields<E>
> {
  /** The entity definition */
  readonly def: E;

  /** The reference to this entity */
  readonly ref: Ref<E>;

  /**
   * Access a loaded field.
   * Only fields in `Loaded` are accessible without potentially being undefined.
   */
  get<K extends Loaded>(field: K): EntityFields<E>[K];

  /**
   * Access a field that may or may not be loaded.
   * Returns undefined if not loaded.
   */
  maybeGet<K extends keyof EntityFields<E>>(field: K): EntityFields<E>[K] | undefined;

  /**
   * Check if a field is loaded
   */
  has(field: keyof EntityFields<E>): boolean;

  /**
   * Get all loaded field names
   */
  loadedFields(): Loaded[];
}

/**
 * FieldResult - result of loading a single field.
 */
export interface FieldResult<E extends EntityDef, K extends keyof EntityFields<E>> {
  readonly ref: Ref<E>;
  readonly field: K;
  readonly value: EntityFields<E>[K];
}

/**
 * CollectionResult - result of loading a collection field.
 * Includes pagination info.
 */
export interface CollectionResult<E extends EntityDef, K extends keyof EntityFields<E>> {
  readonly ref: Ref<E>;
  readonly field: K;
  readonly items: EntityFields<E>[K] extends Ref<infer T>[] ? Ref<T & EntityDef>[] : never;
  readonly hasMore: boolean;
  readonly cursor?: string;
}

// ============================================================================
// PART 3: Engine Interface
// ============================================================================

export interface Engine {
  /**
   * Load specific fields of an entity.
   * Returns a result with only those fields guaranteed to be present.
   */
  load<E extends EntityDef, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    fields: K[]
  ): Promise<EntityResult<E, K>>;

  /**
   * Load a single field of an entity.
   */
  loadField<E extends EntityDef, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    field: K
  ): Promise<FieldResult<E, K>>;

  /**
   * Load a collection field with pagination.
   */
  loadCollection<E extends EntityDef, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    field: K,
    options?: { cursor?: string; limit?: number }
  ): Promise<CollectionResult<E, K>>;

  /**
   * Store field values for an entity.
   * Creates the entity if it doesn't exist.
   */
  store<E extends EntityDef>(
    def: E,
    id: string,
    fields: Partial<EntityFields<E>>
  ): Promise<Ref<E>>;

  /**
   * Query entities of a given type.
   */
  query<E extends EntityDef>(def: E): QueryBuilder<E>;
}

export interface QueryBuilder<E extends EntityDef> {
  /** Filter by field value */
  where<K extends keyof EntityFields<E>>(
    field: K,
    op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains",
    value: EntityFields<E>[K]
  ): QueryBuilder<E>;

  /** Limit results */
  limit(n: number): QueryBuilder<E>;

  /** Skip results */
  offset(n: number): QueryBuilder<E>;

  /** Order by field */
  orderBy<K extends keyof EntityFields<E>>(
    field: K,
    direction?: "asc" | "desc"
  ): QueryBuilder<E>;

  /** Execute and return refs only */
  refs(): Promise<Ref<E>[]>;

  /** Execute and return results with specified fields loaded */
  select<K extends keyof EntityFields<E>>(
    ...fields: K[]
  ): Promise<EntityResult<E, K>[]>;
}

// ============================================================================
// PART 4: Example Entity Definitions (what codegen produces)
// ============================================================================

// The codegen produces both the interface type AND the runtime value
// with the same name. TypeScript distinguishes by context.

// --- SlackUser ---
export interface SlackUser extends EntityDef<{
  name: { kind: "scalar"; type: "string" };
  email: { kind: "scalar"; type: "string" };
  avatarUrl: { kind: "scalar"; type: "string" };
  isAdmin: { kind: "scalar"; type: "boolean" };
}> {}

export declare const SlackUser: SlackUser;

// --- SlackTeam ---
export interface SlackTeam extends EntityDef<{
  name: { kind: "scalar"; type: "string" };
  domain: { kind: "scalar"; type: "string" };
  channels: { kind: "collection"; target: typeof SlackChannel };
}> {}

export declare const SlackTeam: SlackTeam;

// --- SlackChannel ---
export interface SlackChannel extends EntityDef<{
  name: { kind: "scalar"; type: "string" };
  topic: { kind: "scalar"; type: "string" };
  isPrivate: { kind: "scalar"; type: "boolean" };
  team: { kind: "ref"; target: typeof SlackTeam };
  members: { kind: "collection"; target: typeof SlackUser };
  creator: { kind: "ref"; target: typeof SlackUser };
}> {}

export declare const SlackChannel: SlackChannel;

// --- SlackMessage ---
export interface SlackMessage extends EntityDef<{
  text: { kind: "scalar"; type: "string" };
  timestamp: { kind: "scalar"; type: "date" };
  channel: { kind: "ref"; target: typeof SlackChannel };
  author: { kind: "ref"; target: typeof SlackUser };
}> {}

export declare const SlackMessage: SlackMessage;

// ============================================================================
// PART 5: Usage Examples
// ============================================================================

declare const engine: Engine;

async function examples() {
  // --- Creating refs ---
  const channelRef = SlackChannel.ref("C123");
  const userRef = SlackUser.ref("U456");

  // --- Load specific fields ---
  const result = await engine.load(channelRef, ["name", "topic"]);

  result.get("name");    // string - guaranteed loaded
  result.get("topic");   // string - guaranteed loaded
  // @ts-expect-error - 'team' not in loaded fields
  result.get("team");

  result.maybeGet("team");  // Ref<SlackTeam> | undefined - might be loaded
  result.has("team");       // boolean - check if loaded

  // --- Load single field ---
  const nameResult = await engine.loadField(channelRef, "name");
  nameResult.value;  // string


  // --- Load collection ---
  const membersResult = await engine.loadCollection(channelRef, "members", { limit: 50 });
  membersResult.items;    // Ref<SlackUser>[]
  membersResult.hasMore;  // boolean
  membersResult.cursor;   // string | undefined

  // Paginate
  if (membersResult.hasMore) {
    const nextPage = await engine.loadCollection(channelRef, "members", {
      cursor: membersResult.cursor,
      limit: 50
    });
  }

  // --- Store ---
  // @Comment: Let's introduce an EntityInput - because i want others to be able to pass around / return an "EntityInput" from other methods.
  const newRef = await engine.store(SlackChannel, "C789", {
    name: "new-channel",
    topic: "A new channel",
    isPrivate: false,
    team: SlackTeam.ref("T123"),
    creator: userRef,
  });

  // --- Query ---
  const publicChannels = await engine
    .query(SlackChannel)
    .where("isPrivate", "=", false)
    .orderBy("name")
    .limit(10)
    .select("name", "topic");

  for (const ch of publicChannels) {
    ch.get("name");   // string
    ch.get("topic");  // string
  }

  // Just get refs
  const channelRefs = await engine
    .query(SlackChannel)
    .where("isPrivate", "=", false)
    .refs();

  // --- Follow references ---
  const channel = await engine.load(channelRef, ["creator"]);
  const creatorRef = channel.get("creator");  // Ref<SlackUser>

  const creator = await engine.load(creatorRef, ["name", "email"]);
  creator.get("name");   // string
  creator.get("email");  // string
}

// ============================================================================
// OBSERVATIONS & OPEN QUESTIONS
// ============================================================================

/*
 * WHAT THIS ACHIEVES:
 *
 * 1. Type-safe field access - only loaded fields are accessible via .get()
 * 2. Same name for value and type - SlackChannel works in both contexts
 * 3. Partial loading is first-class - load() takes field list
 * 4. Collections are refs, not inline data
 * 5. Pagination built into collection loading
 * 6. Query builder is type-safe
 *
 * OPEN QUESTIONS:
 *
 * 1. EntityResult interface - is this the right shape?
 *    Alternative: make it more record-like with Proxy magic?
 *
 * 2. How do facets fit in?
 *    Does SlackChannel extend both EntityDef AND Deeplinkable?
 *
 * 3. The field definitions are very verbose in the interface.
 *    Can we simplify what codegen produces?
 *
 * 4. Should load() without field list load all fields? Or error?
 *
 * 5. How does this connect to loaders/resolvers?
 *    When engine.load() is called, who decides how to fetch?
 */
