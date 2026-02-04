/**
 * @max/core - Core types and interfaces for Max
 */

// Domain
export { Domain } from "./domain.js";
export type { LocalDomain, GlobalDomain } from "./domain.js";

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
export type { FieldType, EntityFields, CollectionTarget, CollectionKeys } from "./field-types.js";

// Entity definition
export type { EntityDef, EntityDefAny } from "./entity-def.js";

// References
export { RefOf } from "./ref.js";
export type { ReferenceKind, Ref, RefAny } from "./ref.js";

// Entity input
export { EntityInputOf } from "./entity-input.js";
export type { EntityInput, EntityInputAny } from "./entity-input.js";

// Entity result
export { EntityResultOf } from "./entity-result.js";
export type {
  FieldsProxy,
  EntityResult,
  EntityResultAny,
} from "./entity-result.js";

// Fields selector
export { Fields } from "./fields-selector.js";
export type { FieldsSelect, FieldsAll, FieldSelector } from "./fields-selector.js";

// Pagination
export { PageOf } from "./pagination.js";
export type { Page, PageRequest } from "./pagination.js";

// Engine
export type { Engine, QueryBuilder, QueryBuilderAny } from "./engine.js";
