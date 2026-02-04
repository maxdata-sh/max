/**
 * Sample connector definitions for type checking.
 *
 * This file validates that the type system:
 * 1. Compiles without errors on valid code
 * 2. Catches errors on invalid field access (via @ts-expect-error)
 * 3. Demonstrates ref creation, engine.load, engine.store patterns
 */

import type { Domain } from "../domain.js";
import type { EntityDef } from "../entity-def.js";
import { EntityInputOf } from "../entity-input.js";
import type {CollectionField, FieldDefinitions, RefField, ScalarField} from "../field.js";
import { Fields } from "../fields-selector.js";
import {Ref, RefOf} from "../ref.js";
import type { Engine } from "../engine.js";

// ============================================================================
// Entity Definitions
// ============================================================================

class EntityDefImpl<T extends FieldDefinitions> implements EntityDef<T> {
  readonly fields: T;
  readonly name: string;

  constructor(name: string, fields: T) {
    this.fields = fields
    this.name = name
  }

  ref(id: string, domain?: Domain): Ref<this> {
    return undefined; // TODO: Implement creation of Ref
  }
}

interface SlackUser extends EntityDef<{
  name: ScalarField<"string">
  email: ScalarField<"string">
  avatarUrl: ScalarField<"string">
  isAdmin: ScalarField<"boolean">
}> {}

const SlackUser: SlackUser = new EntityDefImpl("SlackUser", {
  name: { kind: "scalar", type: "string" },
  email: { kind: "scalar", type: "string" },
  avatarUrl: { kind: "scalar", type: "string" },
  isAdmin: { kind: "scalar", type: "boolean" },
});

interface SlackTeam extends EntityDef<{
  name: ScalarField<"string">
  domain: ScalarField<"string">
  channels: CollectionField<SlackChannel>
}> {}

const SlackTeam: SlackTeam = new EntityDefImpl("SlackTeam", {
  name: { kind: "scalar", type: "string" },
  domain: { kind: "scalar", type: "string" },
  channels: { kind: "collection", target: null! as typeof SlackChannel }, // Circular ref, assigned below
})


interface SlackChannel extends EntityDef<{
  name: ScalarField<"string">;
  topic: ScalarField<"string">;
  isPrivate: ScalarField<"boolean">;
  team: RefField<SlackTeam>;
  members: CollectionField<SlackUser>;
  creator: RefField<SlackUser>;
}> {}


const SlackChannel: SlackChannel = new EntityDefImpl("SlackChannel", {
    name: { kind: "scalar", type: "string" },
    topic: { kind: "scalar", type: "string" },
    isPrivate: { kind: "scalar", type: "boolean" },
    team: { kind: "ref", target: SlackTeam },
    members: { kind: "collection", target: SlackUser },
    creator: { kind: "ref", target: SlackUser },
});

// Wire up circular reference
(SlackTeam.fields as { channels: CollectionField<SlackChannel> }).channels = {
  kind: "collection",
  target: SlackChannel,
};


interface SlackMessage extends EntityDef<{
  text: ScalarField<"string">;
  timestamp: ScalarField<"date">;
  channel: RefField<SlackChannel>;
  author: RefField<SlackUser>;
}> {}

const SlackMessage: SlackMessage = new EntityDefImpl("SlackMessage", {
    text: { kind: "scalar", type: "string" },
    timestamp: { kind: "scalar", type: "date" },
    channel: { kind: "ref", target: SlackChannel },
    author: { kind: "ref", target: SlackUser },
});

// ============================================================================
// Usage Examples (Type Checking)
// ============================================================================

declare const engine: Engine;

async function examples() {
  // --- Rich Refs ---
  const channelRef = SlackChannel.ref("C123");

  // Ref properties are accessible
  channelRef.entityDef;   // SlackChannel
  channelRef.entityType;  // "SlackChannel"
  channelRef.id;          // "C123"
  channelRef.kind;        // "indirect"
  channelRef.toString();  // "elo:SlackChannel:C123"
  channelRef.domain;      // undefined


  // --- Load all fields ---
  const result = await engine.load(channelRef, Fields.ALL);

  // Access via .get()
  const name1: string = result.get("name");
  const topic1: string = result.get("topic");
  const isPrivate1: boolean = result.get("isPrivate");

  // Access via .fields proxy
  const name2: string = result.fields.name;
  const topic2: string = result.fields.topic;
  const isPrivate2: boolean = result.fields.isPrivate;

  // Ref fields
  const teamRef = result.fields.team;
  const creatorRef = result.fields.creator;

  // Following refs
  const creator = await engine.load(creatorRef, Fields.select("name", "email"));
  const creatorName: string = creator.fields.name;
  const creatorEmail: string = creator.fields.email;

  // --- Partial load ---
  const partial = await engine.load(channelRef, Fields.select("name", "topic"));

  // Loaded fields are accessible
  partial.get("name");
  partial.fields.name;
  partial.get("topic");
  partial.fields.topic;

  // @ts-expect-error - team not in selector
  partial.get("team");

  // @ts-expect-error - team not in selector
  partial.fields.team;

  // @ts-expect-error - isPrivate not in selector
  partial.get("isPrivate");

  // --- EntityInput for store ---
  const input = EntityInputOf.create(SlackChannel.ref("C789"), {
    name: "new-channel",
    topic: "A new channel",
    team: SlackTeam.ref("T123"),
  });

  const newRef = await engine.store(input);

  // Using from() helper
  const input2 = EntityInputOf.from(SlackMessage, "M456", {
    text: "Hello world",
    timestamp: new Date(),
    channel: SlackChannel.ref("C123"),
    author: SlackUser.ref("U999"),
  });

  await engine.store(input2);

  // --- Query ---
  const publicChannels = await engine
    .query(SlackChannel)
    .where("isPrivate", "=", false)
    .limit(10)
    .select("name", "topic");

  for (const ch of publicChannels) {
    const chName: string = ch.fields.name;
    const chTopic: string = ch.fields.topic;
  }

  // --- Type errors for invalid field access ---

  // @ts-expect-error - 'foo' is not a field on SlackChannel
  result.get("foo");

  // @ts-expect-error - 'bar' is not a field on SlackChannel
  result.fields.bar;

  // @ts-expect-error - wrong type assignment
  const wrongType: number = result.fields.name;

  // @ts-expect-error - wrong value type in query
  engine.query(SlackChannel).where("isPrivate", "=", "not-a-boolean");

  // Silence unused variable warnings
  void [name1, name2, topic1, topic2, isPrivate1, isPrivate2, teamRef, creatorName, creatorEmail, newRef, wrongType];
}

// Ensure the examples function is used (prevents unused warning)
void examples;
