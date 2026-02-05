/**
 * Branding utilities for type-safe nominal typing.
 *
 * Brands create distinct types from primitives without runtime overhead.
 */

declare const SoftBrandTag: unique symbol;
declare const HardBrandTag: unique symbol;

/**
 * SoftBrand<U, Name> - A branded type that allows naked U as assignable.
 *
 * Use when you want type safety but don't want to force explicit construction.
 *
 * @example
 * type UserId = SoftBrand<string, 'user-id'>;
 * const id: UserId = "u123";  // ✅ Works - string assignable to UserId
 * const id2: string = id;      // ✅ Works - UserId assignable to string
 *
 * type OrderId = SoftBrand<string, 'order-id'>;
 * const orderId: OrderId = id; // ❌ Error - UserId not assignable to OrderId
 */
export type SoftBrand<U, Name extends string> = U & { [SoftBrandTag]?: Name };

/**
 * HardBrand<U, Name> - A branded type that demands explicit construction.
 *
 * Use when you want to ensure values go through a factory/parser.
 *
 * @example
 * type ValidatedEmail = HardBrand<string, 'validated-email'>;
 * const email: ValidatedEmail = "foo@bar.com";  // ❌ Error - must be branded
 * const email: ValidatedEmail = validateEmail("foo@bar.com");  // ✅ Works
 */
export type HardBrand<U, Name extends string> = U & { [HardBrandTag]: Name, __t?: U };

export type CustomBrand<U,Mark> = U & { [HardBrandTag]: Mark, __t?: U}

/** Pulls the brand target U out of a hard brand */
type ExtractBrandTarget<T extends HardBrand<unknown, string>> = T extends HardBrand<infer U, infer N> ? U : never

/**
 * Id<Name> - Convenience wrapper for soft-branded string identifiers.
 *
 * Most IDs in the system should use this pattern.
 *
 * @example
 * type EntityType = Id<'entity-type'>;
 * type EntityId = Id<'entity-id'>;
 * type InstallationId = Id<'installation-id'>;
 *
 * function loadEntity(type: EntityType, id: EntityId): Entity;
 * loadEntity("AcmeUser", "u123");  // ✅ Works
 * loadEntity("u123", "AcmeUser");  // ❌ Error - swapped arguments caught
 */
export type Id<Name extends string> = SoftBrand<string, Name>;

/**
 * Helper to create a hard-branded value.
 * Use this in factory functions that validate/construct branded values.
 */
export function hardBrand<T extends HardBrand<unknown, string>>(value: ExtractBrandTarget<T>): T {
  return value as T;
}
