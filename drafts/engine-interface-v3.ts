/**
 * Engine Interface Design v3
 *
 * Refinements:
 * - EntityInput as complete upsert request (def + id + fields)
 * - Fixed EntityResultAny compatibility
 * - Rich Ref that carries entity type, id, reference kind
 * - Proxy as .fields (additive, not replacement)
 * - Domain and ReferenceType concepts
 */

// ============================================================================
// PART 1: Domain (Installation Context)
// ============================================================================

/**
 * Domain identifies the installation/tenant context.
 *
 * Local domain: single installation, installationId optional
 * Global domain: multi-tenant, installationId required
 */
export type Domain = LocalDomain | GlobalDomain;

export interface LocalDomain {
  kind: "local";
}

export interface GlobalDomain {
  kind: "global";
  installationId: string;
}

export const Domain = {
  local(): LocalDomain {
    return { kind: "local" };
  },
  global(installationId: string): GlobalDomain {
    return { kind: "global", installationId };
  },
} as const;

// ============================================================================
// PART 2: Reference Types (Direct, Indirect, IdOnly)
// ============================================================================

/**
 * ReferenceKind distinguishes how we're pointing to an entity.
 *
 * - direct: Entity exists in Max's DB, we have the atomId
 * - indirect: Entity in upstream, identified by upstreamId
 * - id-only: Minimal reference, just atomId (no type info at runtime)
 */
export type ReferenceKind = "direct" | "indirect" | "id-only";

// ============================================================================
// PART 3: Rich Reference
// ============================================================================

/**
 * Ref - a rich reference object.
 *
 * Carries all information needed to identify an entity:
 * - Entity type (runtime)
 * - ID (upstream or atom)
 * - Reference kind
 * - Domain (optional)
 *
 * Usage:
 *   const ref = SlackChannel.ref("C123");
 *   engine.load(ref, Fields.ALL);  // ref is self-sufficient
 *
 *   ref.entityDef;  // SlackChannel
 *   ref.id;         // "C123"
 *   ref.kind;       // "indirect" (not yet in DB)
 */
export interface Ref<E extends EntityDefAny = EntityDefAny> {
  /** The entity definition (runtime) */
  readonly entityDef: E;

  /** The entity type name (convenience) */
  readonly entityType: string;

  /** The upstream ID or atom ID depending on kind */
  readonly id: string;

  /** What kind of reference this is */
  readonly kind: ReferenceKind;

  /** Atom ID if this is a direct reference */
  readonly atomId?: string;

  /** Domain context */
  readonly domain?: Domain;

  /** Serialize to string form */
  toString(): string;

  /** Check if this ref points to the same entity as another */
  equals(other: RefAny): boolean;
}

/** Any Ref - for functions that accept any reference */
export type RefAny = Ref<EntityDefAny>;

/** Helper class for creating Refs */
export class RefOf<E extends EntityDefAny> implements Ref<E> {
  constructor(
    readonly entityDef: E,
    readonly id: string,
    readonly kind: ReferenceKind = "indirect",
    readonly atomId?: string,
    readonly domain?: Domain
  ) {}

  get entityType(): string {
    return this.entityDef.name;
  }

  toString(): string {
    if (this.kind === "direct" || this.kind === "id-only") {
      return `atm:${this.atomId}`;
    }
    if (this.domain?.kind === "global") {
      return `egl:${this.domain.installationId}:${this.entityType}:${this.id}`;
    }
    return `elo:${this.entityType}:${this.id}`;
  }

  equals(other: RefAny): boolean {
    if (this.atomId && other.atomId) {
      return this.atomId === other.atomId;
    }
    return this.entityType === other.entityType && this.id === other.id;
  }

  /** Upgrade to direct ref when we have an atomId */
  withAtomId(atomId: string): RefOf<E> {
    return new RefOf(this.entityDef, this.id, "direct", atomId, this.domain);
  }

  /** Create an indirect ref */
  static indirect<E extends EntityDefAny>(def: E, id: string, domain?: Domain): Ref<E> {
    return new RefOf(def, id, "indirect", undefined, domain);
  }

  /** Create a direct ref */
  static direct<E extends EntityDefAny>(def: E, id: string, atomId: string, domain?: Domain): Ref<E> {
    return new RefOf(def, id, "direct", atomId, domain);
  }
}

// ============================================================================
// PART 4: Field Definitions
// ============================================================================

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
export type FieldDefinitions = Record<string, FieldDef>;

export const Field = {
  string: (): ScalarField<"string"> => ({ kind: "scalar", type: "string" }),
  number: (): ScalarField<"number"> => ({ kind: "scalar", type: "number" }),
  boolean: (): ScalarField<"boolean"> => ({ kind: "scalar", type: "boolean" }),
  date: (): ScalarField<"date"> => ({ kind: "scalar", type: "date" }),
  ref: <T extends EntityDefAny>(target: T): RefField<T> => ({ kind: "ref", target }),
  collection: <T extends EntityDefAny>(target: T): CollectionField<T> => ({ kind: "collection", target }),
} as const;

/** Extract TypeScript type for a field */
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
// PART 5: EntityDef
// ============================================================================

export interface EntityDef<Fields extends FieldDefinitions = FieldDefinitions> {
  readonly name: string;
  readonly fields: Fields;

  /** Create a reference to an entity of this type */
  ref(id: string, domain?: Domain): Ref<this>;
}

export type EntityDefAny = EntityDef<FieldDefinitions>;

// ============================================================================
// PART 6: Pagination
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

  static from<T>(items: T[], hasMore: boolean, cursor?: string): Page<T> {
    return new PageOf(items, hasMore, cursor);
  }
}

// ============================================================================
// PART 7: EntityInput (Complete Upsert Request)
// ============================================================================

/**
 * EntityInput - a complete upsert request.
 * Contains everything needed to store an entity.
 * Can be passed around, returned from functions, etc.
 */
export interface EntityInput<E extends EntityDefAny = EntityDefAny> {
  /** Reference to the entity (carries type + id) */
  readonly ref: Ref<E>;

  /** Field values to store */
  readonly fields: Partial<EntityFields<E>>;
}

/** Any EntityInput */
export type EntityInputAny = EntityInput<EntityDefAny>;

/** Helper class for creating EntityInput */
export class EntityInputOf<E extends EntityDefAny> implements EntityInput<E> {
  constructor(
    readonly ref: Ref<E>,
    readonly fields: Partial<EntityFields<E>>
  ) {}

  /** Create from ref and fields */
  static create<E extends EntityDefAny>(
    ref: Ref<E>,
    fields: Partial<EntityFields<E>>
  ): EntityInput<E> {
    return new EntityInputOf(ref, fields);
  }

  /** Create from def, id, and fields */
  static from<E extends EntityDefAny>(
    def: E,
    id: string,
    fields: Partial<EntityFields<E>>
  ): EntityInput<E> {
    return new EntityInputOf(def.ref(id), fields);
  }
}

// ============================================================================
// PART 8: Fields Selector
// ============================================================================

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

export type FieldSelector<E extends EntityDefAny> =
  | FieldsSelect<E, keyof EntityFields<E>>
  | FieldsAll;

export const Fields = {
  select<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ...fields: K[]
  ): FieldsSelect<E, K> {
    return { kind: "select", fields };
  },

  ALL: { kind: "all" } as FieldsAll,
} as const;

// ============================================================================
// PART 9: EntityResult (with .fields proxy)
// ============================================================================

/**
 * Proxy type for direct field access via .fields
 */
export type FieldsProxy<
  E extends EntityDefAny,
  Loaded extends keyof EntityFields<E>
> = {
  readonly [K in Loaded]: EntityFields<E>[K];
};

/**
 * EntityResult - wrapper around loaded entity data.
 *
 * Two ways to access fields:
 * - result.get("name")     - explicit, type-safe
 * - result.fields.name     - proxy, feels like object access
 */
export interface EntityResult<
  E extends EntityDefAny = EntityDefAny,
  Loaded extends keyof EntityFields<E> = keyof EntityFields<E>
> {
  readonly def: E;
  readonly ref: Ref<E>;

  /** Proxy for direct field access */
  readonly fields: FieldsProxy<E, Loaded>;

  /** Explicit field access */
  get<K extends Loaded>(field: K): EntityFields<E>[K];

  /** Access field that may not be loaded */
  maybeGet<K extends keyof EntityFields<E>>(field: K): EntityFields<E>[K] | undefined;

  /** Check if field is loaded */
  has(field: keyof EntityFields<E>): boolean;

  /** Get loaded field names */
  loadedFields(): (Loaded extends string ? Loaded : never)[];

  /** Convert to plain object */
  toObject(): { [K in Loaded]: EntityFields<E>[K] };
}

/**
 * EntityResultAny - accepts any EntityResult.
 *
 * Note: toObject() returns Record<string, unknown> for compatibility.
 */
export interface EntityResultAny {
  readonly def: EntityDefAny;
  readonly ref: RefAny;
  readonly fields: Record<string, unknown>;
  get(field: string): unknown;
  maybeGet(field: string): unknown;
  has(field: string): boolean;
  loadedFields(): string[];
  toObject(): Record<string, unknown>;
}

// Verify compatibility
type _CheckCompatibility = EntityResult<EntityDefAny, string> extends EntityResultAny ? true : never;

/** Helper class implementing EntityResult */
export class EntityResultOf<
  E extends EntityDefAny,
  Loaded extends keyof EntityFields<E>
> implements EntityResult<E, Loaded> {
  private readonly data: Map<string, unknown>;
  readonly fields: FieldsProxy<E, Loaded>;

  constructor(
    readonly def: E,
    readonly ref: Ref<E>,
    data: { [K in Loaded]: EntityFields<E>[K] }
  ) {
    this.data = new Map(Object.entries(data));

    // Create proxy for .fields access
    this.fields = new Proxy({} as FieldsProxy<E, Loaded>, {
      get: (_, prop: string) => {
        if (!this.data.has(prop)) {
          throw new Error(`Field '${prop}' not loaded`);
        }
        return this.data.get(prop);
      },
      has: (_, prop: string) => this.data.has(prop),
      ownKeys: () => Array.from(this.data.keys()),
      getOwnPropertyDescriptor: (_, prop: string) => {
        if (this.data.has(prop)) {
          return { configurable: true, enumerable: true, value: this.data.get(prop) };
        }
        return undefined;
      },
    });
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

  loadedFields(): (Loaded extends string ? Loaded : never)[] {
    return Array.from(this.data.keys()) as (Loaded extends string ? Loaded : never)[];
  }

  toObject(): { [K in Loaded]: EntityFields<E>[K] } {
    return Object.fromEntries(this.data) as { [K in Loaded]: EntityFields<E>[K] };
  }

  static from<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    data: { [P in K]: EntityFields<E>[P] }
  ): EntityResult<E, K> {
    return new EntityResultOf(ref.entityDef, ref, data);
  }
}

// ============================================================================
// PART 10: Engine Interface
// ============================================================================

export interface Engine {
  /**
   * Load specific fields of an entity.
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
   * Load a single field directly.
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
  ): Promise<Page<RefAny>>; // TODO: type the collection target properly

  /**
   * Store entity data.
   * Accepts a complete EntityInput (self-sufficient).
   */
  store<E extends EntityDefAny>(input: EntityInput<E>): Promise<Ref<E>>;

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

  refs(): Promise<Ref<E>[]>;
  select<K extends keyof EntityFields<E>>(...fields: K[]): Promise<EntityResult<E, K>[]>;
  selectAll(): Promise<EntityResult<E, keyof EntityFields<E>>[]>;
}

export type QueryBuilderAny = QueryBuilder<EntityDefAny>;

// ============================================================================
// PART 11: Example Entity Definitions
// ============================================================================

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
// PART 12: Usage Examples
// ============================================================================

declare const engine: Engine;

async function examples() {
  // --- Rich Refs ---
  const channelRef = SlackChannel.ref("C123");

  channelRef.domain

  channelRef.entityDef;   // SlackChannel
  channelRef.entityType;  // "SlackChannel"
  channelRef.id;          // "C123"
  channelRef.kind;        // "indirect"
  channelRef.toString();  // "elo:SlackChannel:C123"

  // Ref is self-sufficient for all operations
  const result = await engine.load(channelRef, Fields.ALL);

  // --- Two ways to access fields ---

  // Explicit .get()
  result.get("name");     // string
  result.get("topic");    // string

  // Proxy via .fields
  result.fields.name;     // string
  result.fields.topic;    // string

  // Both work - use whichever feels right

  // --- Partial load ---
  const partial = await engine.load(channelRef, Fields.select("name", "topic"));

  partial.get("name");    // string
  partial.fields.name;    // string

  // @ts-expect-error - team not loaded
  partial.get("team");
  // @ts-expect-error - team not loaded
  partial.fields.team;

  // --- EntityInput for store ---
  const input: EntityInput<typeof SlackChannel> = {
    ref: SlackChannel.ref("C789"),
    fields: {
      name: "new-channel",
      topic: "A new channel",
      team: SlackTeam.ref("T123"),
    },
  };

  // Can pass around, return from functions
  const newRef = await engine.store(input);

  // Or use helper
  const input2 = EntityInputOf.create(SlackChannel.ref("C999"), {
    name: "another-channel",
    isPrivate: true,
  });

  await engine.store(input2);

  // --- Functions accepting any result ---
  function logResult(result: EntityResultAny): void {
    console.log(`Entity: ${result.ref.entityType}`);
    console.log(`Loaded: ${result.loadedFields().join(", ")}`);
    console.log(`Data: ${JSON.stringify(result.toObject())}`);
  }

  logResult(result);   // Works
  logResult(partial);  // Works

  // --- Following refs ---
  const creatorRef = result.fields.creator;  // Ref<SlackUser>

  // Ref carries enough info
  creatorRef.entityType;  // "SlackUser"

  const creator = await engine.load(creatorRef, Fields.select("name", "email"));
  creator.fields.name;   // string
  creator.fields.email;  // string

  // --- Query ---
  const publicChannels = await engine
    .query(SlackChannel)
    .where("isPrivate", "=", false)
    .limit(10)
    .select("name", "topic");

  for (const ch of publicChannels) {
    console.log(ch.fields.name, ch.fields.topic);
  }
}

// ============================================================================
// OBSERVATIONS
// ============================================================================

/*
 * WHAT'S NEW IN V3:
 *
 * 1. Rich Ref - carries entityDef, id, kind, domain at runtime
 *    - SlackChannel.ref("C123") is self-sufficient
 *    - No more (def, id) pairs
 *
 * 2. EntityInput - complete upsert request
 *    - { ref, fields } - everything needed for store()
 *    - Can be passed around
 *
 * 3. EntityResultAny - fixed compatibility
 *    - toObject() returns Record<string, unknown>
 *    - Explicit interface rather than type alias
 *
 * 4. .fields proxy - additive
 *    - result.fields.name works
 *    - result.get("name") also works
 *    - User can try both, decide later
 *
 * 5. Domain concept introduced
 *    - LocalDomain / GlobalDomain
 *    - Ref carries domain info
 *
 * STILL TO EXPLORE:
 *
 * 1. How does this connect to storage layer?
 * 2. Facets design
 * 3. Collection typing (target type in Page)
 */
