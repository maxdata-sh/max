
/** Convenience helper for dependency injection */
export interface ServiceProvider<T> {
  provide(): T
}
export interface AsyncServiceProvider<T> extends ServiceProvider<T>{}
