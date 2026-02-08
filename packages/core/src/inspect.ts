import util, {InspectOptions} from 'node-inspect-extracted'

/** Assign a custom inspect renderer to a class prototype. Use in a `static {}` block. */
export function Inspect<T>(cls: { prototype: T }, fn: (self: T) => { format: string; params: any[] }): void {
  (cls.prototype as any)[inspect] = function(this: T, depth: number, options: InspectOptions) {
    const data = fn(this)
    return util.formatWithOptions({ ...options, depth: (depth ?? 2) - 1 }, data.format, ...data.params || [])
  }
}

export const inspect: unique symbol = Symbol.for('nodejs.util.inspect.custom')
