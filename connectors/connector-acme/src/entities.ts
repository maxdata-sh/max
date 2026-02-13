/**
 * Acme entity definitions — aligned with the real @max/acme API.
 *
 * Ordered leaf-first to avoid forward references in const declarations.
 * Interfaces are hoisted and can reference each other freely.
 */

import {
  EntityDef,
  Field,
  type ScalarField,
  type RefField,
  type CollectionField,
} from "@max/core";

// ============================================================================
// AcmeUser (leaf — no refs)
// ============================================================================

export interface AcmeUser extends EntityDef<{
  displayName: ScalarField<"string">;
  email: ScalarField<"string">;
  role: ScalarField<"string">;
  active: ScalarField<"boolean">;
}> {}

export const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  displayName: Field.string(),
  email: Field.string(),
  role: Field.string(),
  active: Field.boolean(),
});

// ============================================================================
// AcmeTask (refs AcmeUser — already defined above)
// ============================================================================

export interface AcmeTask extends EntityDef<{
  title: ScalarField<"string">;
  description: ScalarField<"string">;
  status: ScalarField<"string">;
  priority: ScalarField<"string">;
  assignee: RefField<AcmeUser>;
}> {}

export const AcmeTask: AcmeTask = EntityDef.create("AcmeTask", {
  title: Field.string(),
  description: Field.string(),
  status: Field.string(),
  priority: Field.string(),
  assignee: Field.ref(AcmeUser),
});

// ============================================================================
// AcmeProject (refs AcmeUser, collection of AcmeTask — both defined above)
// ============================================================================

export interface AcmeProject extends EntityDef<{
  name: ScalarField<"string">;
  description: ScalarField<"string">;
  status: ScalarField<"string">;
  owner: RefField<AcmeUser>;
  tasks: CollectionField<AcmeTask>;
}> {}

export const AcmeProject: AcmeProject = EntityDef.create("AcmeProject", {
  name: Field.string(),
  description: Field.string(),
  status: Field.string(),
  owner: Field.ref(AcmeUser),
  tasks: Field.collection(AcmeTask),
});

// ============================================================================
// AcmeWorkspace (collections of AcmeUser, AcmeProject — both defined above)
// ============================================================================

export interface AcmeWorkspace extends EntityDef<{
  name: ScalarField<"string">;
  users: CollectionField<AcmeUser>;
  projects: CollectionField<AcmeProject>;
}> {}

export const AcmeWorkspace: AcmeWorkspace = EntityDef.create("AcmeWorkspace", {
  name: Field.string(),
  users: Field.collection(AcmeUser),
  projects: Field.collection(AcmeProject),
});

// ============================================================================
// AcmeRoot (singleton — collection of AcmeWorkspace)
// ============================================================================

export interface AcmeRoot extends EntityDef<{
  workspaces: CollectionField<AcmeWorkspace>;
}> {}

export const AcmeRoot: AcmeRoot = EntityDef.create("AcmeRoot", {
  workspaces: Field.collection(AcmeWorkspace),
});
