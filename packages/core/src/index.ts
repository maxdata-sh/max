/**
 * @max/core - Core types and interfaces for Max
 */

// Branding utilities
export { hardBrand } from "./brand.js";
export type { SoftBrand, HardBrand, Id } from "./brand.js";

export * from "./date-util.js"

// Scope
export { Scope } from "./scope.js";
export type { ScopedResource, InstallationScope, WorkspaceScope, GlobalScope } from "./scope.js";

// RefKey
export { RefKey } from "./ref-key.js";
export type { ParsedRefKey } from "./ref-key.js";

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
export * from "./field-types.js";

// Entity definition (EntityDef is both type and value)
export { EntityDef } from "./entity-def.js";
export type { EntityDefAny } from "./entity-def.js";

// Schema (Schema is both type and value)
export { Schema } from "./schema.js";
export type { EntityRelationship } from "./schema.js";

// Schema formatting
export { SchemaPrettyPrinter } from "./schema-pretty-printer.js";

// References (Ref is both type and value)
export { Ref } from "./ref.js";
export type { RefAny, LocalRef, SystemRef, GlobalRef, ScopeUpgradeable } from "./ref.js";

// Max URL (MaxUrl is a class)
export { MaxUrl } from "./max-url.js";
export type { MaxUrlLevel } from "./max-url.js";

// Entity input (EntityInput is both type and value)
export { EntityInput } from "./entity-input.js";
export type { EntityInputAny } from "./entity-input.js";

// Entity result (EntityResult is both type and value)
export { EntityResult } from "./entity-result.js";
export type { FieldsProxy, EntityResultAny } from "./entity-result.js";

// Fields selector
export { Fields } from "./fields-selector.js";
export type { FieldsSelect, FieldsAll, FieldSelector } from "./fields-selector.js";

// Pagination (Page and PageRequest are both type and value)
export { Page, PageRequest } from "./pagination.js";
export type { ResolvedPageRequest } from "./pagination.js";

// MaxPage (MaxPage is both type and value)
export { MaxPage } from "./max-page.js";
export type { MaxPageAny } from "./max-page.js";

// Engine
export type { Engine } from "./engine.js";

// Query (Query is both type and value)
export { Query, Projection } from "./query.js";
export type {
  EntityQuery,
  EntityQueryAny,
  QueryBuilder,
  QueryBuilderAny,
  QueryFilter,
  QueryOrdering,
  RefsProjection,
  SelectProjection,
  AllProjection,
} from "./query.js";

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
export type { SyncMeta } from "./sync-meta.js";

// FlowController
export { NoOpFlowController } from "./flow-controller.js";
export type { FlowController, FlowToken, OperationKind } from "./flow-controller.js";

// Error system (MaxError and ErrFacet are both type and value)
export { MaxError, ErrFacet } from "./max-error.js";
export type { ErrMarkerFacet, ErrDataFacet, ErrFacetAny, ErrProps, InferPropsData, FacetProps, MergeFacetProps, ErrorDef, ErrorBoundary, MaxErrorJSON, SerializedError } from "./max-error.js";

// Standard facets and error definitions
export * from "./errors/errors.js";

// Type system utilities
export type { ClassOf } from "./type-system-utils.js";

// Inspect
export { Inspect, inspect } from "./inspect.js";

// Lifecycle
export { LifecycleManager } from "./lifecycle.js";
export type { Lifecycle, LifecycleMethods, LifecycleStep } from "./lifecycle.js";

// Federation — level-agnostic infrastructure abstractions
export { HealthStatus, StartResult, StopResult, RpcResponse, Rpc, ErrUnknownTarget, ErrUnknownMethod, ErrSyncHandleNotFound, ErrNodeNotFound } from "./federation/index.js";
export * from "./federation";

// Proxies — proxy+handler pairs for interfaces crossing process boundaries
export * from "./proxies";

// Formatting
export { Fmt } from "./fmt.js";

// Utilities
export { StaticTypeCompanion } from "./companion.js";
export * from "./lazy.js";
export {Duration} from "./duration.js";

// Printables
export {Printer, PrintFormatter} from './printable.js'

// ResolverGraph — declarative dependency resolution with cascading
export { ResolverGraph } from './resolver-graph.js'
export type { ResolverFactories } from './resolver-graph.js'

export * from "./core-id-types.js";
export * as MaxConstants from './constants.js'
