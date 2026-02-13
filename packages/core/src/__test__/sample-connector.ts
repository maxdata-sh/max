/**
 * Sample connector definitions for type checking.
 *
 * This file validates that the type system:
 * 1. Compiles without errors on valid code
 * 2. Catches errors on invalid field access (via @ts-expect-error)
 * 3. Demonstrates ref creation, engine.load, engine.store patterns
 */

import { Fields } from "../fields-selector.js";
import type { Engine } from "../engine.js";
import {AcmeProject, AcmeTask} from "@max/connector-acme";
import {Scope} from "../scope.js";
import {EntityInput} from "../entity-input.js";

// ============================================================================
// Usage Examples (Type Checking)
// ============================================================================

declare const engine: Engine;

async function examples() {
  // --- Rich Refs ---
  const taskRef = AcmeTask.ref("T123");

  // Ref properties are accessible
  taskRef.entityDef;
  taskRef.entityType;
  taskRef.id;
  taskRef.scope.kind;
  taskRef.toString();

  const y = taskRef.upgradeScope(Scope.system("asdf"))

  // --- Load all fields ---
  const result = await engine.load(taskRef, Fields.ALL);

  // Access via .get()
  const title1: string = result.get("title");
  const priority1: string = result.get("priority");

  // Access via .fields proxy
  const title2: string = result.fields.title;
  const priority2: string = result.fields.priority;

  // Ref fields
  const assigneeRef = result.fields.assignee;

  // Following refs
  const assignee = await engine.load(assigneeRef, Fields.select("displayName", "email"));
  const assigneeName: string = assignee.fields.displayName;
  const assigneeEmail: string = assignee.fields.email;

  // --- Partial load ---
  const partial = await engine.load(taskRef, Fields.select("description", "status"));

  // Loaded fields are accessible
  partial.get("description");
  partial.fields.description;
  partial.get("status");
  partial.fields.status;

  // @ts-expect-error - priority not in selector
  partial.get("priority");

  // @ts-expect-error - priority not in selector
  partial.fields.priority;

  // @ts-expect-error - nonexistent field
  partial.get("isPrivate");

  // --- EntityInput for store ---
  const input = EntityInput.create(AcmeTask.ref("T789"), {
    title: "new-task",
    description: "A new task",
  });

  const newRef = await engine.store(input);

  // Using from() helper
  const input2 = EntityInput.from(AcmeTask, "M456", {
    title: "another task",
  });

  await engine.store(input2);

  // --- Query ---
  const tasks = await engine
    .query(AcmeTask)
    .where("status", "=", "done")
    .limit(10)
    .select("title", "description");

  for (const t of tasks) {
    const title: string = t.fields.title;
    const descr: string = t.fields.description;
  }

  // --- Type errors for invalid field access ---

  // @ts-expect-error - 'foo' is not a field on AcmeTask
  result.get("foo");

  // @ts-expect-error - 'bar' is not a field on AcmeTask
  result.fields.bar;

  // @ts-expect-error - wrong type assignment
  const wrongType: number = result.fields.title;

  // @ts-expect-error - wrong value type in query
  engine.query(AcmeTask).where("status", "=", 123);

  // Silence unused variable warnings
  void [title1, title2, priority1, priority2, assigneeName, assigneeEmail, newRef, wrongType];
}

// Ensure the examples function is used (prevents unused warning)
void examples;
