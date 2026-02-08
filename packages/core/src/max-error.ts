/**
 * MaxError - Composable error system with facets.
 *
 * Errors are composed from facets (marker traits and data traits) instead of
 * class inheritance. Three discrimination axes: exact type (code), facet, domain.
 */

import {StaticTypeCompanion} from "./companion.js";
import {UnionToIntersection} from "./type-system-utils.js";

// ============================================================================
// Facet Types
// ============================================================================

export interface ErrMarkerFacet {
  readonly kind: "marker";
  readonly name: string;
}

export interface ErrDataFacet<TData extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: "data";
  readonly name: string;
  readonly _data?: TData; // phantom type for compile-time inference
}

export type ErrFacetAny = ErrMarkerFacet | ErrDataFacet<any>;

// ============================================================================
// Facet Companion
// ============================================================================

export const ErrFacet = StaticTypeCompanion({
  /** Create a marker facet (no associated data) */
  marker(name: string): ErrMarkerFacet {
    return Object.freeze({ kind: "marker" as const, name });
  },

  /** Create a data facet with typed associated data */
  data<TData extends Record<string, unknown>>(name: string): ErrDataFacet<TData> {
    return Object.freeze({ kind: "data" as const, name }) as ErrDataFacet<TData>;
  },
});

// ============================================================================
// Type Utilities
// ============================================================================

/** Extract the data type from a facet. Markers contribute {} */
export type FacetProps<F> = F extends ErrDataFacet<infer D> ? D : {};

/** Merge data types from a tuple of facets into a single intersection */
export type MergeFacetProps<Fs extends readonly ErrFacetAny[]> = UnionToIntersection<
  FacetProps<Fs[number]>
>;

// ============================================================================
// ErrorDef Interface
// ============================================================================

export interface ErrorDef<Fs extends readonly ErrFacetAny[] = readonly ErrFacetAny[]> {
  readonly code: string;
  readonly domain: string;
  readonly facets: Fs;
  create(data: MergeFacetProps<Fs>, context?: string): MaxError<Fs>;
  is(err: unknown): err is MaxError<Fs>;
}

// ============================================================================
// MaxError Interface
// ============================================================================

export interface MaxError<Fs extends readonly ErrFacetAny[] = readonly ErrFacetAny[]> extends Error {
  readonly code: string;
  readonly domain: string;
  readonly context?: string;
  readonly data: MergeFacetProps<Fs>;
  readonly facetNames: ReadonlySet<string>;
  toJSON(): MaxErrorJSON;
}

export interface MaxErrorJSON {
  code: string;
  domain: string;
  message: string;
  context?: string;
  data: Record<string, unknown>;
  facets: string[];
  stack?: string;
}

// ============================================================================
// MaxError Implementation (internal)
// ============================================================================

class MaxErrorImpl extends Error implements MaxError {
  readonly code: string;
  readonly domain: string;
  readonly context?: string;
  readonly data: Record<string, unknown>;
  readonly facetNames: ReadonlySet<string>;

  constructor(
    code: string,
    domain: string,
    message: string,
    facetNames: ReadonlySet<string>,
    data: Record<string, unknown>,
    context?: string,
  ) {
    const fullMessage = context ? `${message} — ${context}` : message;
    super(fullMessage);
    this.name = `MaxError[${code}]`;
    this.code = code;
    this.domain = domain;
    this.context = context;
    this.data = { ...data };
    this.facetNames = facetNames;
  }

  toJSON(): MaxErrorJSON {
    const json: MaxErrorJSON = {
      code: this.code,
      domain: this.domain,
      message: this.message,
      data: this.data,
      facets: [...this.facetNames],
      stack: this.stack,
    };
    if (this.context !== undefined) {
      json.context = this.context;
    }
    return json;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    const dataStr = Object.keys(this.data).length > 0
      ? ` ${JSON.stringify(this.data)}`
      : "";
    return `MaxError[${this.code}]${dataStr}: ${this.message}`;
  }
}

// ============================================================================
// MaxError Companion
// ============================================================================

/** Static methods for MaxError */
export const MaxError = StaticTypeCompanion({
  /**
   * Define a new error type with a code, facets, and message function.
   * The code's prefix before the first "." becomes the domain.
   */
  define<const Fs extends readonly ErrFacetAny[]>(
    code: string,
    opts: {
      facets: Fs;
      message: (data: MergeFacetProps<Fs>) => string;
    },
  ): ErrorDef<Fs> {
    const dotIdx = code.indexOf(".");
    const domain = dotIdx === -1 ? code : code.slice(0, dotIdx);
    const facetNames = Object.freeze(new Set(opts.facets.map((f) => f.name)));

    return Object.freeze({
      code,
      domain,
      facets: opts.facets,

      create(data: MergeFacetProps<Fs>, context?: string): MaxError<Fs> {
        const message = opts.message(data);
        return new MaxErrorImpl(
          code,
          domain,
          message,
          facetNames,
          data as Record<string, unknown>,
          context,
        ) as MaxError<Fs>;
      },

      is(err: unknown): err is MaxError<Fs> {
        return err instanceof MaxErrorImpl && (err as MaxErrorImpl).code === code;
      },
    });
  },

  /** Check if a value is any MaxError */
  isMaxError(err: unknown): err is MaxError {
    return err instanceof MaxErrorImpl;
  },

  /**
   * Check if a MaxError has a specific facet.
   * For DataFacet<D>, narrows err.data to include D.
   * Returns false for non-MaxErrors.
   */
  has<F extends ErrFacetAny>(
    err: unknown,
    facet: F,
  ): err is MaxError & { readonly data: FacetProps<F> } {
    return err instanceof MaxErrorImpl && (err as MaxErrorImpl).facetNames.has(facet.name);
  },

  /** Check if a MaxError belongs to a domain */
  inDomain(err: unknown, domain: string): boolean {
    return err instanceof MaxErrorImpl && (err as MaxErrorImpl).domain === domain;
  },

  /**
   * Enrich a MaxError with additional data from a facet.
   * Mutates err.data via Object.assign — the deliberate escape hatch.
   */
  enrich<F extends ErrDataFacet<any>>(
    err: MaxError,
    _facet: F,
    partialData: Partial<FacetProps<F>>,
  ): void {
    Object.assign((err as any).data, partialData);
  },

  /**
   * Wrap a non-MaxError into a generic "unknown" MaxError, preserving stack.
   * If already a MaxError, returns it unchanged.
   */
  wrap(err: unknown): MaxError {
    if (err instanceof MaxErrorImpl) {
      return err as MaxError;
    }

    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : String(err);

    const wrapped = new MaxErrorImpl(
      "unknown",
      "unknown",
      message,
      Object.freeze(new Set<string>()),
      {},
    );

    // Preserve the original stack if available
    if (err instanceof Error && err.stack) {
      wrapped.stack = err.stack;
    }

    return wrapped as MaxError;
  },
});
