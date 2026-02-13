/**
 * Onboarding — Step pipeline for connector setup.
 *
 * An OnboardingFlow is an ordered list of steps that collect config and credentials
 * from a user. The platform interprets and renders each step type (CLI prompts, web UI, etc).
 *
 * Key property: credentials go directly to the credential store during collection.
 * They never appear in the accumulated config. The flow produces only plain config (TConfig).
 */

import { StaticTypeCompanion } from "@max/core";
import type { CredentialStore } from "./credential-store.js";
import type { StringCredential } from "./credential.js";

// ============================================================================
// OnboardingContext
// ============================================================================

/** Platform services available to onboarding steps. */
export interface OnboardingContext {
  readonly credentialStore: CredentialStore;
}

// ============================================================================
// FieldDescriptor
// ============================================================================

/** Describes a single config field collected during InputStep. */
export interface FieldDescriptor {
  readonly label: string;
  readonly type: "string" | "number" | "boolean";
  readonly required?: boolean;
  readonly default?: string | number | boolean;
}

// ============================================================================
// SelectOption
// ============================================================================

/** A single choice in a SelectStep. */
export interface SelectOption {
  readonly label: string;
  readonly value: string;
}

// ============================================================================
// Step Types (discriminated union on `kind`)
// ============================================================================

/**
 * InputStep — Declarative field and credential collection.
 *
 * `fields` produce plain config values (added to accumulated state).
 * `credentials` produce secrets (written to credential store, NOT accumulated).
 */
export interface InputStep {
  readonly kind: "input";
  readonly label: string;
  readonly description?: string;
  readonly fields?: Record<string, FieldDescriptor>;
  readonly credentials?: Record<string, StringCredential>;
}

/**
 * ValidationStep — Runs a check against accumulated state + credential store.
 *
 * Throws on failure. The runner catches the error and presents it to the user.
 */
export interface ValidationStep {
  readonly kind: "validation";
  readonly label: string;
  readonly validate: (
    accumulated: Record<string, unknown>,
    ctx: OnboardingContext,
  ) => Promise<void>;
}

/**
 * SelectStep — Presents dynamically-fetched options, user picks one (or many).
 *
 * The selected value is added to accumulated state under `field`.
 */
export interface SelectStep {
  readonly kind: "select";
  readonly label: string;
  readonly field: string;
  readonly multiple?: boolean;
  readonly options: (
    accumulated: Record<string, unknown>,
    ctx: OnboardingContext,
  ) => Promise<SelectOption[]>;
}

/**
 * CustomStep — Escape hatch for arbitrary async work.
 *
 * Returns additions to the accumulated state.
 */
export interface CustomStep {
  readonly kind: "custom";
  readonly label: string;
  readonly execute: (
    accumulated: Record<string, unknown>,
    ctx: OnboardingContext,
  ) => Promise<Record<string, unknown>>;
}

/** Union of all onboarding step types. */
export type OnboardingStep = InputStep | ValidationStep | SelectStep | CustomStep;

// ============================================================================
// Step Factories
// ============================================================================

export const InputStep = StaticTypeCompanion({
  create(opts: Omit<InputStep, "kind">): InputStep {
    return { kind: "input", ...opts };
  },
});

export const ValidationStep = StaticTypeCompanion({
  create(opts: Omit<ValidationStep, "kind">): ValidationStep {
    return { kind: "validation", ...opts };
  },
});

export const SelectStep = StaticTypeCompanion({
  create(opts: Omit<SelectStep, "kind">): SelectStep {
    return { kind: "select", ...opts };
  },
});

export const CustomStep = StaticTypeCompanion({
  create(opts: Omit<CustomStep, "kind">): CustomStep {
    return { kind: "custom", ...opts };
  },
});

// ============================================================================
// OnboardingFlow
// ============================================================================

/**
 * OnboardingFlow — Ordered list of steps that produce TConfig.
 *
 * The TConfig generic is a phantom type that ensures type alignment
 * between the flow's output and ConnectorModule.initialise(config: TConfig, ...).
 */
export interface OnboardingFlow<TConfig = unknown> {
  readonly steps: readonly OnboardingStep[];
}

export type OnboardingFlowAny = OnboardingFlow<unknown>;

export const OnboardingFlow = StaticTypeCompanion({
  create<TConfig = unknown>(steps: OnboardingStep[]): OnboardingFlow<TConfig> {
    return { steps: Object.freeze([...steps]) };
  },
});
