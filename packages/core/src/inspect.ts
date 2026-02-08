import util, {InspectOptions} from 'node-inspect-extracted'

/**
 * Assign a custom inspect renderer to a class prototype.
 * Call inside a `static {}` block — assigns once to the prototype, not per instance.
 *
 * The `fn` receives the instance as `self` and returns a format string with params.
 * Format specifiers (%s, %O, %d, etc.) are handled by `util.formatWithOptions`,
 * which provides colored output, depth-aware object rendering, etc.
 *
 * ```typescript
 * class MyThing {
 *   static {
 *     Inspect(this, (self) => ({
 *       format: "MyThing( %s | %O )",
 *       params: [self.kind, self.data],
 *     }));
 *   }
 * }
 * ```
 */
export function Inspect<T>(cls: { prototype: T }, fn: (self: T) => { format: string; params: any[] }): void {
  (cls.prototype as any)[inspect] = function(this: T, depth: number, options: InspectOptions) {
    const data = fn(this)
    return util.formatWithOptions({ ...options, depth: (depth ?? 2) - 1 }, data.format, ...data.params || [])
  }
}

export const inspect: unique symbol = Symbol.for('nodejs.util.inspect.custom')
