/**
 * @max/connector - Connector interface for Max
 */

// Schema (re-export from core for backward compatibility)
export { Schema as ConnectorSchema } from "@max/core";
export type { EntityRelationship } from "@max/core";

// ConnectorDef (both type and value via companion object pattern)
export { ConnectorDef } from "./connector-def.js";
export type { ConnectorName, ConnectorDefAny } from "./connector-def.js";

// Credential (factory for typed credential definitions)
export { Credential } from "./credential.js";
export type {
  StringCredential,
  OAuthCredential,
  OAuthAccessRef,
  OAuthRefreshRef,
  OAuthRefreshResult,
  CredentialRef,
} from "./credential.js";

// CredentialStore (platform storage layer)
export { StubbedCredentialStore, InMemoryCredentialStore } from "./credential-store.js";
export type { CredentialStore } from "./credential-store.js";

// Credential errors (needed by CredentialStore implementations)
export { ErrCredentialNotFound } from "./errors.js";

// CredentialProvider (batteries-included connector-facing layer)
export { CredentialProvider, InMemoryCredentialProvider } from "./credential-provider.js";
export type { CredentialHandle } from "./credential-provider.js";

// Installation (live configured instance of a connector)
export { Installation } from "./installation.js";
export type { HealthStatus } from "./installation.js";

// ConnectorModule (bundled connector export: def + initialise)
export { ConnectorModule } from "./connector-module.js";
export type { ConnectorModuleAny } from "./connector-module.js";

// ConnectorRegistry (maps connector names to lazy-loaded modules)
export * from "./connector-registry.js";
export type { ConnectorRegistryEntry } from "./connector-registry.js";

// Onboarding (step pipeline for connector setup)
export { OnboardingFlow, InputStep, ValidationStep, SelectStep, CustomStep } from "./onboarding.js";
export type {
  OnboardingFlowAny,
  OnboardingContext,
  OnboardingStep,
  FieldDescriptor,
  SelectOption,
} from "./onboarding.js";
