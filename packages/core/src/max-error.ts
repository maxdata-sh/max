/**
 * MaxError - Composable error system with facets and boundaries.
 *
 * Errors are composed from facets (marker traits and data traits) instead of
 * class inheritance. Three discrimination axes: exact type (code), facet, domain.
 * Boundaries own error definitions and provide wrap() for cause chains.
 */

import {StaticTypeCompanion} from "./companion.js";
import {UnionToIntersection} from "./type-system-utils.js";
import {inspect, Inspect} from "./inspect.js";

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
  create(data: MergeFacetProps<Fs>, context?: string, cause?: MaxError): MaxError<Fs>;
  is(err: unknown): err is MaxError<Fs>;
}

// ============================================================================
// ErrorBoundary Interface
// ============================================================================

export interface ErrorBoundary {
  readonly domain: string;
  /** Define an error within this boundary. Code is prefixed with the domain. */
  define<const Fs extends readonly ErrFacetAny[]>(
    code: string,
    opts: { facets: Fs; message: (data: MergeFacetProps<Fs>) => string },
  ): ErrorDef<Fs>;
  /** Check if an error belongs to this boundary's domain */
  is(err: unknown): boolean;
  /**
   * Wrap a function in this boundary. If it throws:
   * - Same-domain MaxErrors pass through unwrapped
   * - Everything else is wrapped with a cause chain
   *
   * Two overloads:
   * - wrap(fn) — safety net, uses generic "{domain}.error"
   * - wrap(errDef, fn) — intent wrap, uses the specified error
   */
  wrap<T>(fn: () => T): T;
  wrap<T>(errDef: ErrorDef, fn: () => T): T;
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
  readonly cause?: MaxError;
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
  cause?: MaxErrorJSON;
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract stack frames, stripping the error message line and the internal create() frame */
function stackFrames(stack: string | undefined): string {
  if (!stack) return "";
  const first = stack.indexOf("\n    at ");
  if (first === -1) return "";
  // If the first frame is the internal create() call, skip it
  const secondFrame = stack.indexOf("\n    at ", first + 1);
  if (secondFrame !== -1 && stack.slice(first, secondFrame).includes("at create (")) {
    return stack.slice(secondFrame + 1);
  }
  return stack.slice(first + 1);
}

/** Format a cause chain for inspect output */
function formatCauseChain(err: MaxErrorImpl, indent: string, opts: { colors?: boolean }): string {
  const dim = opts.colors ? "\x1b[2m" : "";
  const red = opts.colors ? "\x1b[31m" : "";
  const reset = opts.colors ? "\x1b[0m" : "";

  let result = "";
  let current: MaxErrorImpl | undefined = err.cause as MaxErrorImpl | undefined;
  let depth = indent;

  while (current) {
    const hasData = Object.keys(current.data).length > 0;
    result += `\n${depth}${dim}caused by:${reset} ${red}MaxError[${current.code}]${reset}: ${current.message}`;
    if (hasData) {
      result += `\n${depth}  ${JSON.stringify(current.data)}`;
    }
    const frames = stackFrames(current.stack);
    if (frames) {
      result += "\n" + frames.split("\n").map(line => depth + line).join("\n");
    }
    current = current.cause as MaxErrorImpl | undefined;
    depth += "  ";
  }

  return result;
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
  override cause?: MaxErrorImpl;

  static {
    Inspect(this, (self, opts) => {
      const hasData = Object.keys(self.data).length > 0;
      const frames = stackFrames(self.stack);

      const red = opts.colors ? "\x1b[31m" : "";
      const reset = opts.colors ? "\x1b[0m" : "";
      let format = `${red}MaxError[${self.code}]${reset}: ${self.message}`;
      const params: any[] = [];

      if (hasData) {
        format += "\n  %O";
        params.push(self.data);
      }
      if (frames) {
        format += "\n" + frames;
      }
      if (self.cause) {
        format += formatCauseChain(self, "  ", opts);
      }

      return { format, params };
    });
  }

  constructor(
    code: string,
    domain: string,
    message: string,
    facetNames: ReadonlySet<string>,
    data: Record<string, unknown>,
    context?: string,
    cause?: MaxErrorImpl,
  ) {
    const fullMessage = context ? `${message} — ${context}` : message;
    super(fullMessage);
    this.name = `MaxError[${code}]`;
    this.code = code;
    this.domain = domain;
    this.context = context;
    this.data = { ...data };
    this.facetNames = facetNames;
    if (cause) this.cause = cause;
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
    if (this.cause) {
      json.cause = this.cause.toJSON();
    }
    return json;
  }
}

// ============================================================================
// Internal: create an ErrorDef
// ============================================================================

function defineError<const Fs extends readonly ErrFacetAny[]>(
  fullCode: string,
  domain: string,
  opts: { facets: Fs; message: (data: MergeFacetProps<Fs>) => string },
): ErrorDef<Fs> {
  const facetNames = Object.freeze(new Set(opts.facets.map((f) => f.name)));

  return Object.freeze({
    code: fullCode,
    domain,
    facets: opts.facets,

    create(data: MergeFacetProps<Fs>, context?: string, cause?: MaxError): MaxError<Fs> {
      const message = opts.message(data);
      return new MaxErrorImpl(
        fullCode,
        domain,
        message,
        facetNames,
        data as Record<string, unknown>,
        context,
        cause as MaxErrorImpl | undefined,
      ) as unknown as MaxError<Fs>;
    },

    is(err: unknown): err is MaxError<Fs> {
      return err instanceof MaxErrorImpl && (err as MaxErrorImpl).code === fullCode;
    },
  });
}

// ============================================================================
// Internal: create a boundary wrap function
// ============================================================================

function boundaryWrap<T>(domain: string, genericDef: ErrorDef, errDefOrFn: ErrorDef | (() => T), maybeFn?: () => T): T {
  const errDef = typeof errDefOrFn === "function" ? genericDef : errDefOrFn;
  const fn = typeof errDefOrFn === "function" ? errDefOrFn : maybeFn!;

  try {
    const result = fn();
    // Handle async: if the result is a promise, catch its rejection
    if (result && typeof (result as any).then === "function") {
      return (result as any).then(undefined, (thrown: unknown) => {
        throw wrapAtBoundary(domain, errDef, thrown);
      }) as T;
    }
    return result;
  } catch (thrown) {
    throw wrapAtBoundary(domain, errDef, thrown);
  }
}

function wrapAtBoundary(domain: string, errDef: ErrorDef, thrown: unknown): MaxError {
  // Same-domain MaxErrors pass through unwrapped
  if (thrown instanceof MaxErrorImpl && thrown.domain === domain) {
    throw thrown;
  }

  // Ensure the cause is a MaxError
  const cause = thrown instanceof MaxErrorImpl
    ? thrown as MaxError
    : MaxError.wrap(thrown);

  return errDef.create({} as any, undefined, cause);
}

// ============================================================================
// MaxError Companion
// ============================================================================

/** Static methods for MaxError */
export const MaxError = StaticTypeCompanion({
  /**
   * Define a new error type with a code, facets, and message function.
   * The code's prefix before the first "." becomes the domain.
   *
   * Prefer using boundary.define() instead for domain-owned errors.
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
    return defineError(code, domain, opts);
  },

  /**
   * Create an error boundary for a domain. Errors defined via the boundary
   * are automatically prefixed with the domain and bound to it.
   */
  boundary(domain: string): ErrorBoundary {
    // Auto-create the generic boundary error for wrap() safety net
    const genericDef = defineError(`${domain}.error`, domain, {
      facets: [] as const,
      message: () => `${domain} error`,
    });

    return {
      domain,

      define<const Fs extends readonly ErrFacetAny[]>(
        code: string,
        opts: { facets: Fs; message: (data: MergeFacetProps<Fs>) => string },
      ): ErrorDef<Fs> {
        return defineError(`${domain}.${code}`, domain, opts);
      },

      is(err: unknown): boolean {
        return err instanceof MaxErrorImpl && (err as MaxErrorImpl).domain === domain;
      },

      wrap<T>(errDefOrFn: ErrorDef | (() => T), maybeFn?: () => T): T {
        return boundaryWrap(domain, genericDef, errDefOrFn, maybeFn);
      },
    };
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
