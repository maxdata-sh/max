// If you're doing a `.filter()` use this instead of `x => value !== null etc` because this will pass the type
// information along so the compiler knows we have no null/undefined left.
export const nonNullable = <T>(value: T): value is NonNullable<T> => {
  return value !== null && value !== undefined
}
