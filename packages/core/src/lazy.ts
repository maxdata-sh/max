/** Allows for lazily computing properties */
export class Lazy<T extends object> {
  #values = {} as any
  readonly read: Readonly<T>

  constructor(fieldBuilders: { [k in keyof T]: () => T[k] }) {
    this.read = new Proxy({} as T, {
      get: (_target, prop) => {
        if (prop in this.#values) {
          return this.#values[prop]
        }
        const loader = fieldBuilders[prop as keyof T]
        if (!loader) return undefined
        this.#values[prop] = loader()
        return this.#values[prop]
      },
    })
  }
}

export class LazyG<T> {
  private cache: Partial<T> = {}
  private providers: T

  // We add 'ThisType<LazyG<T>>' to the input object type
  constructor(providers: () => T & ThisType<LazyG<T>>) {
    this.providers = providers()
  }

  public get<K extends keyof T>(key: K): T[K] {
    if (!(key in this.cache)) {
      // Note: we must call the provider with 'this' context
      // so 'this.get' works inside the provider functions
      const provider = this.providers[key] as unknown as () => T[K]
      this.cache[key] = provider.call(this)
    }
    return this.cache[key]!
  }
}

new LazyG(() => ({
  foo() {
    return 1
  },
  bar() {
    return this.get('foo')
  },
}))

export type LazyProviders<T> = {
  [K in keyof T]: () => T[K]
}

export interface LazyOne<T> {
  get: T
}

export class LazyX<T extends object> {
  #cache = {} as any
  #providers: LazyProviders<T>

  // The public "magic" object
  public readonly read: T

  constructor(init: (proxy: T) => LazyProviders<T> & ThisType<T>) {
    // 1. Get the provider definitions
    // We pass an empty object cast as T initially to help with the function signature
    this.#providers = init(null as any)

    // 2. Create the Proxy
    this.read = new Proxy({} as T, {
      get: (_, prop: string | symbol) => {
        if (typeof prop === 'symbol') return undefined

        if (!(prop in this.#cache)) {
          const loader = this.#providers[prop as keyof T]
          if (!loader) return undefined

          // 3. Execute with 'this.read' (the proxy) as the context
          // This allows "this.otherField" to work inside the loader
          this.#cache[prop] = loader.call(this.read)
        }

        return this.#cache[prop]
      },
    })
  }

  static once<F>(fn: () => F): LazyOne<F> {
    let done = false
    let value: F
    return {
      get get() {
        if (!done) {
          value = fn()
          done = true
        }
        return value
      },
    }
  }
}




type FieldBuilders<T> = { [k in keyof T]: () => T[k] }

export function makeLazy<T extends object>(fields: FieldBuilders<T>){
  const cache = {} as any
  const proxy = new Proxy({} as T, {
    get: (_, prop: string | symbol) => {
      if (typeof prop === 'symbol') return undefined

      if (!(prop in cache)) {
        const loader = fields[prop as keyof T]
        if (!loader) return undefined

        // 3. Execute with 'this.read' (the proxy) as the context
        // This allows "this.otherField" to work inside the loader
        cache[prop] = loader.call(proxy)
      }

      return cache[prop]
    }
  })
  return proxy
}

const lazily: unique symbol = Symbol('_lazily')
export type Lazily<T extends object> = T //& {[lazily]:true}

export function makeLazyF<T extends object>(fields: (self:T) => FieldBuilders<T>){
  return makeLazy(fields(null as any))
}

export function iife<T>(f:() => T): T {
  return f()
}
