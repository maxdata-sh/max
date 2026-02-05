/** Use when defining a companion object for a type.
 *  For example, Ref (the type) and Ref (the companion object)
 *
 *  This function achieves nothing at runtime - it simply acts as a self-documenting marker that aids discovery.
 * */
export function StaticTypeCompanion<const Companion>(t:Companion): Companion {
  return t
}
