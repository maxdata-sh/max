/** Allows for lazily computing properties */
export class Lazy<T extends object> {
  #values = {} as any
  constructor(private fieldBuilders: { [k in keyof T]: () => T[k] }) {}

  /** TODO: replace with proxy */
  read<K extends keyof T>(k: K): T[K] {
    if (k in this.#values) {
      return this.#values[k]
    } else {
      const loader = this.fieldBuilders[k]
      this.#values[k] = loader()
      return this.#values[k]
    }
  }
}
