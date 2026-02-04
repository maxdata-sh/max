/**
 * APPROACH A: Types-First (Maxwell Pattern)
 *
 * Types are inferred from runtime definitions.
 * Single source of truth - no codegen.
 */

// ============================================================================
// PART 1: Framework primitives (lives in @max/core)
// ============================================================================

/** Marker for reference types */
declare const RefBrand: unique symbol;
type Ref<T> = string & { [RefBrand]: T };

/** Marker for collection types */
declare const CollectionBrand: unique symbol;
type Collection<T> = string[] & { [CollectionBrand]: T };

/** Field type builders */
interface FieldTypes {
  string(): { _type: string };
  number(): { _type: number };
  boolean(): { _type: boolean };
  date(): { _type: Date };
  ref<T extends EntityDef<any>>(target: T): { _type: Ref<EntityType<T>> };
  collection<T extends EntityDef<any>>(target: T): { _type: Collection<EntityType<T>> };
}

const f: FieldTypes = {
  string: () => ({ _type: "" as any }),
  number: () => ({ _type: 0 as any }),
  boolean: () => ({ _type: false as any }),
  date: () => ({ _type: new Date() as any }),
  ref: () => ({ _type: "" as any }),
  collection: () => ({ _type: [] as any }),
};

/** Extract the TS type from a field definition */
type FieldType<F> = F extends { _type: infer T } ? T : never;

/** Extract fields object type from field definitions */
type FieldsType<F extends Record<string, { _type: any }>> = {
  [K in keyof F]: FieldType<F[K]>;
};

/** Entity definition - the runtime object that also carries type info */
interface EntityDef<T> {
  name: string;
  _phantom: T;
  ref(id: string): Ref<T>;
  // Runtime schema access
  schema: { fields: Record<string, any> };
}

/** Extract the entity type from an EntityDef */
type EntityType<D> = D extends EntityDef<infer T> ? T : never;

/** Define an entity - infers types from the fields config */
function defineEntity<
  Name extends string,
  Fields extends Record<string, { _type: any }>
>(config: {
  name: Name;
  fields: Fields;
}): EntityDef<FieldsType<Fields>> {
  return {
    name: config.name,
    _phantom: {} as any,
    ref: (id: string) => id as any,
    schema: { fields: config.fields },
  };
}

/** Facet definition */
function defineFacet<Fields extends Record<string, { _type: any }>>(config: {
  name: string;
  fields: Fields;
}) {
  return config;
}

/** Entity with facet */
function defineEntityWithFacets<
  Name extends string,
  Fields extends Record<string, { _type: any }>,
  Facets extends Array<{ fields: Record<string, { _type: any }> }>
>(config: {
  name: Name;
  fields: Fields;
  facets: Facets;
}): EntityDef<
  FieldsType<Fields> & FieldsType<Facets[number]["fields"]>
> {
  return {
    name: config.name,
    _phantom: {} as any,
    ref: (id: string) => id as any,
    schema: { fields: { ...config.fields, ...config.facets.reduce((acc, f) => ({ ...acc, ...f.fields }), {}) } },
  };
}

/** Engine interface */
interface Engine {
  load<T>(ref: Ref<T>): Promise<T>;
  store<T>(def: EntityDef<T>, data: T): Promise<Ref<T>>;
  query<T>(def: EntityDef<T>): QueryBuilder<T>;
}

interface QueryBuilder<T> {
  where<K extends keyof T>(field: K, op: "=" | ">" | "<", value: T[K]): QueryBuilder<T>;
  limit(n: number): QueryBuilder<T>;
  execute(): Promise<T[]>;
}

// ============================================================================
// PART 2: Connector definition (lives in @max/connector-slack)
// ============================================================================

// --- Facets ---

const Deeplinkable = defineFacet({
  name: "Deeplinkable",
  fields: {
    deeplink: f.string(),
  },
});

// --- Forward declarations for circular refs ---
// (This is where types-first gets tricky)
declare const SlackTeam: EntityDef<{
  name: string;
  domain: string;
  channels: Collection<{ name: string; team: Ref<any> }>;
}>;

// --- Entity definitions ---

const SlackUser = defineEntity({
  name: "SlackUser",
  fields: {
    name: f.string(),
    email: f.string(),
    avatarUrl: f.string(),
    isAdmin: f.boolean(),
  },
});

const SlackChannel = defineEntityWithFacets({
  name: "SlackChannel",
  fields: {
    name: f.string(),
    topic: f.string(),
    isPrivate: f.boolean(),
    team: f.ref(SlackTeam),
    members: f.collection(SlackUser),
    creator: f.ref(SlackUser),
  },
  facets: [Deeplinkable],
});

const SlackMessage = defineEntity({
  name: "SlackMessage",
  fields: {
    text: f.string(),
    timestamp: f.date(),
    channel: f.ref(SlackChannel),
    author: f.ref(SlackUser),
  },
});

// ============================================================================
// PART 3: Usage (lives in user code / CLI)
// ============================================================================

declare const engine: Engine;

async function example() {
  // --- Creating references ---
  const channelRef = SlackChannel.ref("C123456");
  const userRef = SlackUser.ref("U789");

  // --- Loading entities ---
  const channel = await engine.load(channelRef);

  // Type-safe field access
  channel.name;        // string
  channel.topic;       // string
  channel.isPrivate;   // boolean
  channel.team;        // Ref<SlackTeam>
  channel.members;     // Collection<SlackUser>
  channel.deeplink;    // string (from facet)

  // @ts-expect-error - unknown field
  channel.unknownField;

  // --- Following references ---
  const creator = await engine.load(channel.creator);
  creator.name;        // string
  creator.email;       // string

  // --- Queries ---
  const publicChannels = await engine
    .query(SlackChannel)
    .where("isPrivate", "=", false)
    .limit(10)
    .execute();

  for (const ch of publicChannels) {
    console.log(ch.name, ch.topic);
  }

  // --- Storing entities ---
  const newMessageRef = await engine.store(SlackMessage, {
    text: "Hello world",
    timestamp: new Date(),
    channel: channelRef,
    author: userRef,
  });
}

// ============================================================================
// PART 4: Resolver definition (connector author writes this)
// ============================================================================

interface LoaderContext {
  apiClient: any; // Slack API client
  installationId: string;
}

interface Loader<TEntity, TContext> {
  name: string;
  entity: EntityDef<TEntity>;
  load(ref: Ref<TEntity>, ctx: TContext): Promise<Partial<TEntity>>;
}

function defineLoader<TEntity, TContext>(config: {
  name: string;
  entity: EntityDef<TEntity>;
  load: (ref: Ref<TEntity>, ctx: TContext) => Promise<Partial<TEntity>>;
}): Loader<TEntity, TContext> {
  return config;
}

const SlackChannelLoader = defineLoader({
  name: "SlackChannelLoader",
  entity: SlackChannel,
  load: async (ref, ctx: LoaderContext) => {
    // const data = await ctx.apiClient.conversations.info({ channel: ref });
    return {
      name: "general",
      topic: "Company-wide announcements",
      isPrivate: false,
      deeplink: `https://slack.com/...`,
      // team, members, creator would come from other loaders or be refs
    };
  },
});

// ============================================================================
// OBSERVATIONS / PAIN POINTS
// ============================================================================

/*
 * GOOD:
 * - Single source of truth
 * - No codegen step
 * - Types flow through naturally
 * - ref() method is discoverable
 *
 * AWKWARD:
 * - Forward declarations needed for circular refs (see SlackTeam above)
 * - Facet composition requires a separate function (defineEntityWithFacets)
 * - Deep generic inference can produce cryptic errors
 * - The f.ref(SlackTeam) requires SlackTeam to be defined first (ordering matters)
 *
 * QUESTIONS:
 * - How do we handle the circular reference problem elegantly?
 * - Can we make facets compose more naturally?
 * - What happens when inference fails deep in the generic chain?
 */
