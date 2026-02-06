/**
 * Acme entity definitions for testing.
 */

import {
  EntityDef,
  type ScalarField,
  type RefField,
  type CollectionField,
} from "@max/core";

// ============================================================================
// AcmeUser
// ============================================================================

export interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
  age: ScalarField<"number">;
  isAdmin: ScalarField<"boolean">;
}> {}

export const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: { kind: "scalar", type: "string" },
  email: { kind: "scalar", type: "string" },
  age: { kind: "scalar", type: "number" },
  isAdmin: { kind: "scalar", type: "boolean" },
});

// ============================================================================
// AcmeTeam
// ============================================================================

export interface AcmeTeam extends EntityDef<{
  name: ScalarField<"string">;
  description: ScalarField<"string">;
  owner: RefField<typeof AcmeUser>;
  members: CollectionField<typeof AcmeUser>;
}> {}

export const AcmeTeam: AcmeTeam = EntityDef.create("AcmeTeam", {
  name: { kind: "scalar", type: "string" },
  description: { kind: "scalar", type: "string" },
  owner: { kind: "ref", target: AcmeUser },
  members: { kind: "collection", target: AcmeUser },
});

// ============================================================================
// AcmeProject
// ============================================================================

export interface AcmeProject extends EntityDef<{
  name: ScalarField<"string">;
  status: ScalarField<"string">;
  createdAt: ScalarField<"date">;
  team: RefField<typeof AcmeTeam>;
  lead: RefField<typeof AcmeUser>;
}> {}

export const AcmeProject: AcmeProject = EntityDef.create("AcmeProject", {
  name: { kind: "scalar", type: "string" },
  status: { kind: "scalar", type: "string" },
  createdAt: { kind: "scalar", type: "date" },
  team: { kind: "ref", target: AcmeTeam },
  lead: { kind: "ref", target: AcmeUser },
});

// ============================================================================
// AcmeTask
// ============================================================================

export interface AcmeTask extends EntityDef<{
  title: ScalarField<"string">;
  description: ScalarField<"string">;
  priority: ScalarField<"number">;
  completed: ScalarField<"boolean">;
  project: RefField<typeof AcmeProject>;
  assignee: RefField<typeof AcmeUser>;
}> {}

export const AcmeTask: AcmeTask = EntityDef.create("AcmeTask", {
  title: { kind: "scalar", type: "string" },
  description: { kind: "scalar", type: "string" },
  priority: { kind: "scalar", type: "number" },
  completed: { kind: "scalar", type: "boolean" },
  project: { kind: "ref", target: AcmeProject },
  assignee: { kind: "ref", target: AcmeUser },
});
