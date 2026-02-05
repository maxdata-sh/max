/**
 * Sample connector definitions for type checking.
 *
 * This file validates that the type system:
 * 1. Compiles without errors on valid code
 * 2. Catches errors on invalid field access (via @ts-expect-error)
 * 3. Demonstrates ref creation, engine.load, engine.store patterns
 */

import { EntityInputOf } from "../entity-input.js";
import { Fields } from "../fields-selector.js";
import type { Engine } from "../engine.js";
import {AcmeProject, AcmeTask} from "@max/connector-acme";
import {Scope} from "../scope.js";

// ============================================================================
// Usage Examples (Type Checking)
// ============================================================================

declare const engine: Engine;

async function examples() {
  // --- Rich Refs ---
  const channelRef = AcmeTask.ref("C123");

  // Ref properties are accessible
  channelRef.entityDef;   // SlackChannel
  channelRef.entityType;  // "SlackChannel"
  channelRef.id;          // "C123"
  channelRef.scope.kind;        // "indirect"
  channelRef.toString();  // "elo:SlackChannel:C123"

  const y  = channelRef.upgradeScope(Scope.system("asdf"))


  // --- Load all fields ---
  const result = await engine.load(channelRef, Fields.ALL);

  // Access via .get()
  const title1: string = result.get("title");
  const priority1: number = result.get("priority");

  // Access via .fields proxy
  const title2: string = result.fields.title;
  const priority2: number = result.fields.priority;


  // Ref fields
  const projectRef = result.fields.project;
  const assigneeRef = result.fields.assignee;

  // Following refs
  const creator = await engine.load(assigneeRef, Fields.select("name", "email"));
  const creatorName: string = creator.fields.name;
  const creatorEmail: string = creator.fields.email;

  // --- Partial load ---
  const partial = await engine.load(channelRef, Fields.select("description", "completed"));

  // Loaded fields are accessible
  partial.get("description");
  partial.fields.description;
  partial.get("completed");
  partial.fields.completed;

  // @ts-expect-error - team not in selector
  partial.get("team");

  // @ts-expect-error - team not in selector
  partial.fields.team;

  // @ts-expect-error - isPrivate not in selector
  partial.get("isPrivate");

  // --- EntityInput for store ---
  const input = EntityInputOf.create(AcmeTask.ref("T789"), {
    title: "new-task",
    description: "A new task",
    project: AcmeProject.ref("P123"),
  });

  const newRef = await engine.store(input);

  // Using from() helper
  const input2 = EntityInputOf.from(AcmeTask, "M456", {
    title: "another task",
    project: AcmeProject.ref("P123")
  });

  await engine.store(input2);

  // --- Query ---
  const tasks = await engine
    .query(AcmeTask)
    .where("completed", "=", false)
    .limit(10)
    .select("title", "description");

  for (const t of tasks) {
    const title: string = t.fields.title;
    const descr: string = t.fields.description;
  }

  // --- Type errors for invalid field access ---

  // @ts-expect-error - 'foo' is not a field on SlackChannel
  result.get("foo");

  // @ts-expect-error - 'bar' is not a field on SlackChannel
  result.fields.bar;

  // @ts-expect-error - wrong type assignment
  const wrongType: number = result.fields.name;

  // @ts-expect-error - wrong value type in query
  engine.query(AcmeTask).where("completed", "=", "not-a-boolean");

  // Silence unused variable warnings
  void [title1, title2, priority1, priority2, projectRef, creatorName, creatorEmail, newRef, wrongType];
}

// Ensure the examples function is used (prevents unused warning)
void examples;
