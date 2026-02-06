/**
 * Type-checking-only file that validates the SyncPlan DSL.
 * Not a runtime test - just ensures types work correctly.
 */

import { SyncPlan, Step } from "@max/core";
import { AcmeUser, AcmeTeam, AcmeProject } from "@max/connector-acme";

// ============================================================================
// Step.forAll - type-safe field names
// ============================================================================

// ✅ Valid: scalar fields on AcmeUser
Step.forAll(AcmeUser).loadFields("name", "email");

// ✅ Valid: all scalar fields
Step.forAll(AcmeUser).loadFields("name", "email", "age", "isAdmin");

// ✅ Valid: ref fields are loadable too
Step.forAll(AcmeProject).loadFields("name", "status", "team", "lead");

// ✅ Valid: collection field on AcmeTeam
Step.forAll(AcmeTeam).loadCollection("members");

// @ts-expect-error - "members" is a collection, not a loadable field
Step.forAll(AcmeTeam).loadFields("members");

// @ts-expect-error - "nonexistent" is not a field on AcmeUser
Step.forAll(AcmeUser).loadFields("nonexistent");

// @ts-expect-error - "name" is not a collection field
Step.forAll(AcmeTeam).loadCollection("name");

// @ts-expect-error - AcmeUser has no collection fields
Step.forAll(AcmeUser).loadCollection("name");

// ============================================================================
// Step.forRoot / Step.forOne - same type safety via refs
// ============================================================================

const teamRef = AcmeTeam.ref("t1");

// ✅ Valid
Step.forRoot(teamRef).loadFields("name", "description", "owner");
Step.forRoot(teamRef).loadCollection("members");
Step.forOne(teamRef).loadFields("name");

// @ts-expect-error - "members" is collection, not loadable field
Step.forOne(teamRef).loadFields("members");

// ============================================================================
// Full SyncPlan composition
// ============================================================================

const rootRef = AcmeTeam.ref("root");

// ✅ Sequential steps with concurrent group
const plan = SyncPlan.create([
  Step.forRoot(rootRef).loadCollection("members"),
  Step.forAll(AcmeUser).loadFields("name", "email"),
  Step.concurrent([
    Step.forAll(AcmeTeam).loadCollection("members"),
    Step.forAll(AcmeProject).loadFields("name", "status"),
  ]),
]);

// Plan is data-only
const _steps = plan.steps;
