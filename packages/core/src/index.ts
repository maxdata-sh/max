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
export type { FieldType, EntityFields, CollectionTargetRef, CollectionKeys } from "./field-types.js";

// Entity definition
export { EntityDef } from "./entity-def.js";
export type { EntityDef as EntityDefType, EntityDefAny } from "./entity-def.js";

// References
export { Ref } from "./ref.js";
export type { Ref as RefType, RefAny, LocalRef, SystemRef, ScopeUpgradeable } from "./ref.js";

// Entity input
export { EntityInput } from "./entity-input.js";
export type { EntityInput as EntityInputType, EntityInputAny } from "./entity-input.js";

// Entity result
export { EntityResult } from "./entity-result.js";
export type {
  FieldsProxy,
  EntityResult as EntityResultType,
  EntityResultAny,
} from "./entity-result.js";

// Fields selector
export { Fields } from "./fields-selector.js";
export type { FieldsSelect, FieldsAll, FieldSelector } from "./fields-selector.js";

// Pagination
export { Page } from "./pagination.js";
export type { Page as PageType, PageRequest } from "./pagination.js";

// Engine
export type { Engine, QueryBuilder, QueryBuilderAny } from "./engine.js";
