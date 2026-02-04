/**
 * APPROACH B: Schema-First (Codegen)
 *
 * Schema is written as data, types are generated.
 * Clear separation between schema definition and type usage.
 */

// ============================================================================
// PART 1: Schema definition DSL (lives in @max/core)
// ============================================================================

/** Schema definition types - these are DATA, not types */
interface SchemaFieldDef {
  type: "string" | "number" | "boolean" | "date" | "ref" | "collection";
  target?: string; // For ref/collection: the entity name
  required?: boolean;
  description?: string;
}

interface SchemaEntityDef {
  name: string;
  description?: string;
  facets?: string[];
  fields: Record<string, SchemaFieldDef>;
}

interface SchemaFacetDef {
  name: string;
  description?: string;
  fields: Record<string, SchemaFieldDef>;
}

interface ConnectorSchemaDef {
  connector: string;
  facets?: Record<string, SchemaFacetDef>;
  entities: Record<string, SchemaEntityDef>;
}

// ============================================================================
// PART 2: Schema definition (connector author writes this)
// This could also be YAML/JSON - showing TS for comparison
// ============================================================================

const slackSchema: ConnectorSchemaDef = {
  connector: "slack",

  facets: {
    Deeplinkable: {
      name: "Deeplinkable",
      fields: {
        deeplink: { type: "string" },
      },
    },
  },

  entities: {
    SlackUser: {
      name: "SlackUser",
      fields: {
        name: { type: "string", required: true },
        email: { type: "string" },
        avatarUrl: { type: "string" },
        isAdmin: { type: "boolean" },
      },
    },

    SlackTeam: {
      name: "SlackTeam",
      fields: {
        name: { type: "string", required: true },
        domain: { type: "string" },
        channels: { type: "collection", target: "SlackChannel" },
      },
    },

    SlackChannel: {
      name: "SlackChannel",
      facets: ["Deeplinkable"],
      fields: {
        name: { type: "string", required: true },
        topic: { type: "string" },
        isPrivate: { type: "boolean" },
        team: { type: "ref", target: "SlackTeam" },
        members: { type: "collection", target: "SlackUser" },
        creator: { type: "ref", target: "SlackUser" },
      },
    },

    SlackMessage: {
      name: "SlackMessage",
      fields: {
        text: { type: "string", required: true },
        timestamp: { type: "date" },
        channel: { type: "ref", target: "SlackChannel" },
        author: { type: "ref", target: "SlackUser" },
      },
    },
  },
};

// ============================================================================
// PART 3: Generated types (output of `max generate`)
// This is what the codegen produces - clean, simple, readable
// ============================================================================

// --- Generated: slack.generated.ts ---

import type { Ref, Collection, EntityDef } from "@max/core";

// Facets
export interface Deeplinkable {
  deeplink: string;
}

// Entities
export interface SlackUser {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean | null;
}

export interface SlackTeam {
  name: string;
  domain: string | null;
  channels: Collection<SlackChannel>;
}

export interface SlackChannel extends Deeplinkable {
  name: string;
  topic: string | null;
  isPrivate: boolean | null;
  team: Ref<SlackTeam>;
  members: Collection<SlackUser>;
  creator: Ref<SlackUser>;
}

export interface SlackMessage {
  text: string;
  timestamp: Date | null;
  channel: Ref<SlackChannel>;
  author: Ref<SlackUser>;
}

// Entity definitions (runtime objects with type info)
export declare const SlackUserDef: EntityDef<SlackUser>;
export declare const SlackTeamDef: EntityDef<SlackTeam>;
export declare const SlackChannel: EntityDef<SlackChannel>;
export declare const SlackMessage: EntityDef<SlackMessage>;

// Convenience ref creators
export declare function slackUserRef(id: string): Ref<SlackUser>;
export declare function slackTeamRef(id: string): Ref<SlackTeam>;
export declare function slackChannelRef(id: string): Ref<SlackChannel>;
export declare function slackMessageRef(id: string): Ref<SlackMessage>;

// --- End generated ---

// ============================================================================
// PART 4: Framework types (lives in @max/core)
// These are much simpler than Approach A - no inference gymnastics
// ============================================================================

declare const RefBrand: unique symbol;
// Ref and Collection are simple branded types
type Ref<T> = string & { [RefBrand]: T };

declare const CollectionBrand: unique symbol;
type Collection<T> = string[] & { [CollectionBrand]: T };

interface EntityDef<T> {
  name: string;
  ref(id: string): Ref<T>;
  schema: SchemaEntityDef;
}

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
// PART 5: Usage (lives in user code / CLI)
// ============================================================================

declare const engine: Engine;

async function example() {
  // --- Creating references ---
  const channelRef = slackChannelRef("C123456");
  // Or: SlackChannelDef.ref("C123456")
  const userRef = slackUserRef("U789");

  // --- Loading entities ---
  const channel = await engine.load(channelRef);


  // Type-safe field access - types are explicit and simple
  channel.name;        // string
  channel.topic;       // string | null
  channel.isPrivate;   // boolean | null
  channel.team;        // Ref<SlackTeam>
  channel.members;     // Collection<SlackUser>
  channel.deeplink;    // string (from Deeplinkable facet)

  // @ts-expect-error - unknown field
  channel.unknownField;

  // --- Following references ---
  const creator = await engine.load(channel.creator);
  creator.name;        // string
  creator.email;       // string | null

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
    // channel: channelRef,
    channel: SlackMessage.ref('123'),
    author: userRef,
  });
}

// ============================================================================
// PART 6: Resolver definition (connector author writes this)
// ============================================================================

interface LoaderContext {
  apiClient: any;
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
    return {
      name: "general",
      topic: "Company-wide announcements",
      isPrivate: false,
      deeplink: `https://slack.com/...`,
      team: SlackTeamDef.ref('123')
    };
  },
});

// ============================================================================
// PART 7: What codegen could also produce
// ============================================================================

/*
 * Beyond types, codegen could generate:
 *
 * 1. Runtime schema registry
 *    export const SlackSchema = { entities: {...}, facets: {...} }
 *
 * 2. Validators
 *    export function validateSlackChannel(data: unknown): SlackChannel
 *
 * 3. SQL migrations
 *    CREATE TABLE slack_channel (...)
 *
 * 4. Documentation
 *    Markdown docs for each entity
 *
 * 5. CLI completions
 *    max query slack.channel --where name=...
 */

// ============================================================================
// OBSERVATIONS / PAIN POINTS
// ============================================================================

/*
 * GOOD:
 * - Generated types are simple and readable
 * - No inference complexity - types are explicit
 * - Circular references just work (SlackTeam refs SlackChannel, vice versa)
 * - Error messages are clear
 * - Schema can include things types can't (descriptions, deprecations)
 * - One codegen step can produce types, validators, docs, etc.
 *
 * AWKWARD:
 * - Requires a build step: `max generate` before `bun build`
 * - Schema and types can drift if codegen not run
 * - Two files to maintain (schema + look at generated)
 * - Schema DSL is less "TypeScript native"
 *
 * QUESTIONS:
 * - How do we make the codegen step seamless? (watch mode? IDE plugin?)
 * - Where does the schema live? .ts file? YAML? JSON?
 * - How do we version/migrate schemas?
 */
