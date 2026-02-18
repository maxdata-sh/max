import {StaticTypeCompanion} from "@max/core";

/** Convenience helper for dependency injection */
export interface ServiceProvider<T> {
  provide(): T
}
export interface AsyncServiceProvider<T> extends ServiceProvider<T>{}

export const ServiceProvider = StaticTypeCompanion({
  provideSync<T>(f: () => T){ return f() },
  provideAsync<T>(f: () => Promise<T>){ return f() }
})
