/**
 * MaxError - Composable error system with facets and boundaries.
 *
 * Errors are composed from facets (marker traits and data traits) instead of
 * class inheritance. Three discrimination axes: exact type (code), facet, domain.
 *
 * Two wrapping mechanisms:
 * - ErrorDef.wrap(fn) — intent wrap: "if this fails, the error is X"
 * - Boundary.wrap(data, fn) — domain entry: "you're entering this boundary with this context"
 */

import {StaticTypeCompanion} from "./companion.js";
import {UnionToIntersection} from "./type-system-utils.js";
import {inspect, Inspect} from "./inspect.js";
import util from "node-inspect-extracted";

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

/** Phantom type carrier for error-local custom props */
export interface ErrProps<T extends Record<string, unknown> = {}> {
  readonly _kind: "props";
  readonly _phantom?: T;
}

/** Extract the data type from an ErrProps */
export type InferPropsData<P> = P extends ErrProps<infer T> ? T : {};

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

  /** Declare error-local custom props (phantom type only) */
  props<T extends Record<string, unknown>>(): ErrProps<T> {
    return { _kind: "props" } as ErrProps<T>;
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

export interface ErrorDef<
  Fs extends readonly ErrFacetAny[] = readonly ErrFacetAny[],
  D extends Record<string, unknown> = {},
> {
  readonly code: string;
  readonly domain: string;
  readonly facets: Fs;
  create(data: MergeFacetProps<Fs> & D, context?: string, cause?: MaxError): MaxError<Fs>;
  is(err: unknown): err is MaxError<Fs> & { readonly data: MergeFacetProps<Fs> & D };

  /** Intent wrap: run fn, if it throws, wrap the error in this ErrorDef */
  wrap<T>(fn: () => T): T;
  wrap<T>(data: MergeFacetProps<Fs> & D, fn: () => T): T;
}

// ============================================================================
// ErrorBoundary Interface
// ============================================================================

export interface ErrorBoundary<D extends Record<string, unknown> = {}> {
  readonly domain: string;
  /** Define an error within this boundary. Code is prefixed with the domain. */
  define<const Fs extends readonly ErrFacetAny[], P extends ErrProps = ErrProps>(
    code: string,
    opts: { customProps?: P; facets: Fs; message: (data: MergeFacetProps<Fs> & InferPropsData<P>) => string },
  ): ErrorDef<Fs, InferPropsData<P>>;
  /** Check if an error belongs to this boundary's domain */
  is(err: unknown): boolean;
  /**
   * Domain entry wrap: run fn within this boundary.
   * If anything escapes, wraps in a thin boundary error carrying the provided data.
   * Same-domain MaxErrors pass through unwrapped.
   */
  wrap<T>(fn: () => T): T;
  wrap<T>(data: D, fn: () => T): T;
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
  prettyPrint(opts?: { color?: boolean; includeStackTrace?: boolean }): string;
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



/** Convert any thrown value to a MaxError, preserving stack */
function asMaxError(thrown: unknown): MaxError {
  if (thrown instanceof MaxErrorImpl) return thrown as MaxError;
  const message = thrown instanceof Error ? thrown.message : typeof thrown === "string" ? thrown : String(thrown);
  const wrapped = new MaxErrorImpl("unknown", "unknown", message, Object.freeze(new Set<string>()), {});
  if (thrown instanceof Error && thrown.stack) wrapped.stack = thrown.stack;
  return wrapped as MaxError;
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
      return {
        format: self.prettyPrint({color: opts.colors, includeStackTrace: true}),
        params:[]
      }
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

  prettyPrint(opts?: { color?: boolean; includeStackTrace?: boolean }): string {
    const color = opts?.color ?? false;
    const includeStack = opts?.includeStackTrace ?? false;

    const red = color ? "\x1b[31m" : "";
    const dim = color ? "\x1b[2m" : "";
    const reset = color ? "\x1b[0m" : "";

    const lines: string[] = [];

    // Top-level error
    lines.push(`MaxError: ` + formatErrorLine(this, "", { red, dim, reset }, !this.cause));

    // Cause chain
    let current: MaxErrorImpl | undefined = this.cause;
    let indent = "  ";
    while (current) {
      const last = !current.cause
      lines.push(`${indent}${dim}└ caused by:${reset} ${formatErrorLine(current, indent, { red, dim, reset }, last)}`);
      current = current.cause;
      indent += "  ";
    }

    // Stack trace at the end
    if (includeStack) {
      const frames = stackFrames(this.stack);
      if (frames) {
        // lines.push("");
        lines.push(`  ${dim}➝ Stack trace:${reset}`);
        for (const frame of frames.split("\n")) {
          if (frame.trim()) lines.push(`${dim}${frame}${reset}`);
        }
      }
    }

    return lines.join("\n");
  }
}

function formatErrorLine(
  err: MaxErrorImpl,
  indent: string,
  c: { red: string; dim: string; reset: string },
  isLast: boolean
): string {
  const hasData = Object.keys(err.data).length > 0;
  let line = `${c.red}${err.code}${c.reset}: ${err.message}`;
  if (hasData) {
    const connectorChar = isLast ? '└' : '├'
    line += `\n${indent}  ${c.dim}${connectorChar} data: ${JSON.stringify(err.data)}${c.reset}`;
  }
  return line;
}

// ============================================================================
// Internal: try/catch wrapper for both sync and async
// ============================================================================

function tryCatchWrap<T>(fn: () => T, onError: (thrown: unknown) => never): T {
  try {
    const result = fn();
    if (result && typeof (result as any).then === "function") {
      return (result as any).then(undefined, (thrown: unknown) => {
        onError(thrown);
      }) as T;
    }
    return result;
  } catch (thrown) {
    onError(thrown);
  }
}

// ============================================================================
// Internal: create an ErrorDef
// ============================================================================

function defineError<const Fs extends readonly ErrFacetAny[], D extends Record<string, unknown> = {}>(
  fullCode: string,
  domain: string,
  opts: { facets: Fs; message: (data: MergeFacetProps<Fs> & D) => string },
): ErrorDef<Fs, D> {
  const facetNames = Object.freeze(new Set(opts.facets.map((f) => f.name)));

  function create(data: MergeFacetProps<Fs> & D, context?: string, cause?: MaxError): MaxError<Fs> {
    const message = opts.message(data);
    const err = new MaxErrorImpl(
      fullCode,
      domain,
      message,
      facetNames,
      data as Record<string, unknown>,
      context,
      cause as MaxErrorImpl | undefined,
    ) as unknown as MaxError<Fs>;
    Error.captureStackTrace(err, create)
    return err
  }

  return Object.freeze({
    code: fullCode,
    domain,
    facets: opts.facets,
    create,

    is(err: unknown): err is MaxError<Fs> & { readonly data: MergeFacetProps<Fs> & D } {
      return err instanceof MaxErrorImpl && (err as MaxErrorImpl).code === fullCode;
    },

    wrap<T>(dataOrFn: (MergeFacetProps<Fs> & D) | (() => T), maybeFn?: () => T): T {
      const data = typeof dataOrFn === "function" ? ({} as MergeFacetProps<Fs> & D) : dataOrFn;
      const fn = typeof dataOrFn === "function" ? dataOrFn : maybeFn!;
      return tryCatchWrap(fn, (thrown) => {
        throw create(data, undefined, asMaxError(thrown));
      });
    },
  });
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
  define<const Fs extends readonly ErrFacetAny[], P extends ErrProps = ErrProps>(
    code: string,
    opts: {
      customProps?: P;
      facets: Fs;
      message: (data: MergeFacetProps<Fs> & InferPropsData<P>) => string;
    },
  ): ErrorDef<Fs, InferPropsData<P>> {
    const dotIdx = code.indexOf(".");
    const domain = dotIdx === -1 ? code : code.slice(0, dotIdx);
    return defineError(code, domain, opts);
  },

  /**
   * Create an error boundary for a domain.
   * Errors defined via the boundary are automatically prefixed with the domain.
   *
   * Optionally declare customProps that boundary.wrap() will require:
   *   const Connector = MaxError.boundary("connector", {
   *     customProps: ErrFacet.props<{ connectorId: string }>(),
   *   });
   *   Connector.wrap({ connectorId: "acme" }, fn);
   */
  boundary<P extends ErrProps = ErrProps>(domain: string, opts?: { customProps?: P }): ErrorBoundary<InferPropsData<P>> {
    type BD = InferPropsData<P>;

    // The boundary's thin error — carries boundary data when wrapping
    const boundaryErrorDef = defineError<readonly [], BD>(`${domain}.error`, domain, {
      facets: [] as const,
      message: () => `${domain} error`,
    });

    return {
      domain,

      define<const Fs extends readonly ErrFacetAny[], PP extends ErrProps = ErrProps>(
        code: string,
        opts: { customProps?: PP; facets: Fs; message: (data: MergeFacetProps<Fs> & InferPropsData<PP>) => string },
      ): ErrorDef<Fs, InferPropsData<PP>> {
        return defineError(`${domain}.${code}`, domain, opts);
      },

      is(err: unknown): boolean {
        return err instanceof MaxErrorImpl && (err as MaxErrorImpl).domain === domain;
      },

      wrap<T>(dataOrFn: BD | (() => T), maybeFn?: () => T): T {
        const data = typeof dataOrFn === "function" ? ({} as BD) : dataOrFn;
        const fn = typeof dataOrFn === "function" ? dataOrFn : maybeFn!;
        return tryCatchWrap(fn as () => T, (thrown) => {
          // Same-domain MaxErrors pass through unwrapped
          if (thrown instanceof MaxErrorImpl && thrown.domain === domain) {
            throw thrown;
          }
          throw boundaryErrorDef.create(data, undefined, asMaxError(thrown));
        });
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
   * Convert any value to a MaxError, preserving stack.
   * If already a MaxError, returns it unchanged.
   */
  wrap(err: unknown): MaxError {
    return asMaxError(err);
  },
});
