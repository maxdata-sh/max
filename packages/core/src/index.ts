/**
 * @max/core - Core types and interfaces for Max
 */

// Branding utilities
export { hardBrand } from "./brand.js";
export type { SoftBrand, HardBrand, Id } from "./brand.js";

// Scope
export { Scope } from "./scope.js";
export type { LocalScope, SystemScope } from "./scope.js";

// RefKey
export { RefKey } from "./ref-key.js";
export type { EntityType, EntityId, InstallationId, ParsedRefKey } from "./ref-key.js";

// Fields
export { Field } from "./field.js";
export type {
  ScalarType,
  ScalarField,
  RefField,
  CollectionField,
  FieldDef,
  FieldDefinitions,
} from "./field.js";

// Field type utilities
export type { FieldType, EntityFields, CollectionTargetRef, CollectionKeys, NonCollectionKeys } from "./field-types.js";

// Entity definition (EntityDef is both type and value)
export { EntityDef } from "./entity-def.js";
export type { EntityDefAny } from "./entity-def.js";

// References (Ref is both type and value)
export { Ref } from "./ref.js";
export type { RefAny, LocalRef, SystemRef, ScopeUpgradeable } from "./ref.js";

// Entity input (EntityInput is both type and value)
export { EntityInput } from "./entity-input.js";
export type { EntityInputAny } from "./entity-input.js";

// Entity result (EntityResult is both type and value)
export { EntityResult } from "./entity-result.js";
export type { FieldsProxy, EntityResultAny } from "./entity-result.js";

// Fields selector
export { Fields } from "./fields-selector.js";
export type { FieldsSelect, FieldsAll, FieldSelector } from "./fields-selector.js";

// Pagination (Page is both type and value)
export { Page } from "./pagination.js";
export type { PageRequest } from "./pagination.js";

// Engine
export type { Engine, QueryBuilder, QueryBuilderAny } from "./engine.js";

// Batch (Batch is both type and value)
export { Batch } from "./batch.js";
export type { Keyable, KeyableType, BatchAny, BatchBuilder } from "./batch.js";

// Context (class-based pattern)
export { Context, t } from "./context-def.js";
export type {
  ContextClass,
  ContextValues,
  ContextDefAny,
  InferContext,
  ContextSchema,
  TypeDesc,
  StringTypeDesc,
  NumberTypeDesc,
  BooleanTypeDesc,
  InstanceTypeDesc,
} from "./context-def.js";

// Loader (Loader is both type and value)
export { Loader, LoaderResultsImpl } from "./loader.js";
export type {
  LoaderName,
  LoaderStrategy,
  LoaderResults,
  FieldAssignment,
  BaseLoader,
  EntityLoader,
  EntityLoaderBatched,
  CollectionLoader,
  RawLoader,
  LoaderAny,
} from "./loader.js";

// Resolver (Resolver is both type and value)
export { Resolver } from "./resolver.js";
export type { FieldMapping, ResolverAny } from "./resolver.js";

// SyncPlan (SyncPlan and Step are both type and value)
export { SyncPlan, Step } from "./sync-plan.js";
export type {
  SyncStep,
  SyncPlanEntry,
  ConcurrentSteps,
  StepTarget,
  StepOperation,
  ForAllTarget,
  ForRootTarget,
  ForOneTarget,
  LoadFieldsOperation,
  LoadCollectionOperation,
} from "./sync-plan.js";

// Seeder (Seeder is both type and value)
export { Seeder } from "./seeder.js";
export type { SeederAny } from "./seeder.js";

// SyncMeta
export { Duration } from "./sync-meta.js";
export type { SyncMeta } from "./sync-meta.js";

// FlowController
export { NoOpFlowController } from "./flow-controller.js";
export type { FlowController, FlowToken, OperationKind } from "./flow-controller.js";

// Utilities
export { StaticTypeCompanion } from "./companion.js";
export { Lazy } from "./lazy.js";
