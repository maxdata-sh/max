/**
 * EngineHandler — Receiver-side mirror of EngineProxy.
 *
 * Receives a method name and args from the wire, dispatches to the
 * real Engine implementation. Co-located with EngineProxy in @max/core.
 *
 * Adding a method to Engine requires updating:
 * 1. Engine interface — compiler error if proxy doesn't implement it
 * 2. EngineProxy — add the method (to satisfy the interface)
 * 3. EngineHandler — add the case (caught by roundtrip test)
 */

import type { Engine } from "../engine.js"
import type { Scope } from "../scope.js"
import { ErrUnknownMethod } from "../federation/rpc-errors.js"

export class EngineHandler<TScope extends Scope = Scope> {
  constructor(private readonly engine: Engine<TScope>) {}

  dispatch(method: string, args: readonly unknown[]): Promise<unknown> {

    switch (method) {
      case 'load':
        return this.engine.load(args[0] as any, args[1] as any)
      case 'loadField':
        return this.engine.loadField(args[0] as any, args[1] as any)
      case 'loadCollection':
        return this.engine.loadCollection<any,any>(args[0] as any, args[1] as any, args[2] as any)
      case 'store':
        return this.engine.store(args[0] as any)
      case 'loadPage':
        return this.engine.loadPage(args[0] as any, args[1] as any, args[2] as any)
      case 'query':
        return this.engine.query(args[0] as any)
      default:
        throw ErrUnknownMethod.create({ target: 'engine', method })
    }
  }
}
