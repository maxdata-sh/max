export type EngineConfig =
  | { type: 'sqlite'; path?: string }
  | { type: 'in-memory' }
/** More could come later:
 * | { type: 'postgres'; connection: string }
 */

export type ResolvedEngineConfig =
  | { type: 'sqlite'; path: string }
/** For now, in-memory is only supported by virtue of sqlite's :memory: */
  // | { type: "in-memory" }
