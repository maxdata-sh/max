/**
 * Type-checking-only file that validates the SyncPlan DSL.
 * Not a runtime test - just ensures types work correctly.
 */

import { SyncPlan, Step } from "@max/core";
import { AcmeUser, AcmeWorkspace, AcmeProject } from "@max/connector-acme";

// ============================================================================
// Step.forAll - type-safe field names
// ============================================================================

// Valid: scalar fields on AcmeUser
Step.forAll(AcmeUser).loadFields("displayName", "email");

// Valid: all scalar fields
Step.forAll(AcmeUser).loadFields("displayName", "email", "role", "active");

// Valid: ref fields are loadable too
Step.forAll(AcmeProject).loadFields("name", "status", "owner");

// Valid: collection field on AcmeWorkspace
Step.forAll(AcmeWorkspace).loadCollection("users");

// @ts-expect-error - "users" is a collection, not a loadable field
Step.forAll(AcmeWorkspace).loadFields("users");

// @ts-expect-error - "nonexistent" is not a field on AcmeUser
Step.forAll(AcmeUser).loadFields("nonexistent");

// @ts-expect-error - "name" is not a collection field on AcmeWorkspace
Step.forAll(AcmeWorkspace).loadCollection("name");

// @ts-expect-error - AcmeUser has no collection fields
Step.forAll(AcmeUser).loadCollection("name");

// ============================================================================
// Step.forRoot / Step.forOne - same type safety via refs
// ============================================================================

const wsRef = AcmeWorkspace.ref("ws1");

// Valid
Step.forRoot(wsRef).loadFields("name");
Step.forRoot(wsRef).loadCollection("users");
Step.forOne(wsRef).loadFields("name");

// @ts-expect-error - "users" is collection, not loadable field
Step.forOne(wsRef).loadFields("users");

// ============================================================================
// Full SyncPlan composition
// ============================================================================

const rootWsRef = AcmeWorkspace.ref("root");

// Sequential steps with concurrent group
const plan = SyncPlan.create([
  Step.forRoot(rootWsRef).loadCollection("users"),
  Step.forAll(AcmeUser).loadFields("displayName", "email"),
  Step.concurrent([
    Step.forAll(AcmeWorkspace).loadCollection("projects"),
    Step.forAll(AcmeProject).loadFields("name", "status"),
  ]),
]);

// Plan is data-only
const _steps = plan.steps;
