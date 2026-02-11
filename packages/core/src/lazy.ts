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
