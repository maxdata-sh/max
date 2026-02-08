type PrivateConstructor<TClass = any> = { prototype: TClass };
type AbstractConstructor<TClass> = (abstract new(...args: any) => TClass)
type StandardConstructor<TClass> = (new(...args: any) => TClass)
export type ClassOf<T, TOptionalStatics extends Record<string, any> = {}> = (
  | PrivateConstructor<T>
  | AbstractConstructor<T>
  | StandardConstructor<T>
  ) & TOptionalStatics


/** You're seeing this because a function's been marked in a "Top" or Any-style as Bivariant.
 *  What this means:
 *  - The function receives as input a generic argument E from the interface.
 *  - At the same time, the interface exposes a value with the same generic E as an _output_.
 *  - And this means you (counter-intuitively) cannot assign a Widget<E> to a Widget<Anything>
 *  - Illustrative Example: You cannot supply a KeyHandler<'shift-key> where a KeyHandler<AnyKey> is expected
 *
 *  However - in many cases, especially in internal / framework code - we do not care. It is useful to be able identify,
 *   "I will accept any keyboard handler"
 *
 *  For that reason, you can use this helper type, which simply points out to the compiler: This function produces a T. Don't worry about it.
 *
 *  Intended usage: Use this in an interface _override_ to mark that functions that are causing invariance.
 *
 *  */
export type BivariantFunction<T> = (...args:any[]) => T
/** Convert a union to an intersection */
export type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
    x: infer I,
  ) => void
  ? I
  : never;
