export class Resolver<A, B> {
  private constructor(private fn: (a: A) => B) {}
  resolve(config: A): B {
    return this.fn(config)
  }
  static create<T,U>(fn:(a:T) => U): Resolver<T,U> {
    return new this(fn)
  }
  static async<T,U>(fn: (a:T) => Promise<U>): AsyncResolver<T, U> {
    return new this(fn)
  }
}


export type AsyncResolver<T, U> = Resolver<T, Promise<U>>
