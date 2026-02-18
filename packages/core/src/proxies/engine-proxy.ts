/**
 * EngineProxy — Proxies Engine<TScope> over a Transport.
 *
 * Every Engine method takes serializable inputs and returns serializable
 * outputs, so the proxy is a thin RPC forwarder. No fluent chains,
 * no accumulated state — just request-response.
 *
 * Lifecycle (start/stop) is a no-op — the real engine's lifecycle is
 * managed by the node that hosts it, not the caller.
 *
 * Owned by the Engine interface, not by any provider package.
 */

import { LifecycleManager } from "../lifecycle.js"
import type { Transport } from "../federation/transport.js"
import type { RpcRequest } from "../federation/rpc.js"
import type { Engine } from "../engine.js"
import type { Scope } from "../scope.js"
import type { EntityDefAny } from "../entity-def.js"
import type { EntityInput } from "../entity-input.js"
import type { EntityResult } from "../entity-result.js"
import type { EntityFields, EntityFieldsKeys, EntityFieldsPick } from '../field-types.js'
import type { CollectionKeys, CollectionTargetRef } from "../field-types.js"
import type { FieldsAll, FieldsSelect } from "../fields-selector.js"
import type { Page, PageRequest } from "../pagination.js"
import type { EntityQuery, SelectProjection, RefsProjection, AllProjection } from "../query.js"
import type { Ref } from "../ref.js"

export class EngineProxy<TScope extends Scope = Scope> implements Engine<TScope> {
  /** No-op lifecycle — the real engine's lifecycle is the host node's concern. */
  lifecycle = LifecycleManager.on({})

  constructor(
    private readonly transport: Transport,
    private readonly target: string = "engine",
  ) {}

  // --------------------------------------------------------------------------
  // load
  // --------------------------------------------------------------------------

  async load<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    ref: Ref<E>,
    fields: FieldsSelect<E, K>,
  ): Promise<EntityResult<E, K>>

  async load<E extends EntityDefAny>(
    ref: Ref<E>,
    fields: FieldsAll | "*",
  ): Promise<EntityResult<E, EntityFieldsKeys<E>>>

  async load(ref: Ref<any>, fields: unknown): Promise<any> {
    return this.rpc("load", ref, fields)
  }

  // --------------------------------------------------------------------------
  // loadField
  // --------------------------------------------------------------------------

  async loadField<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    ref: Ref<E>,
    field: K,
  ): Promise<EntityFields<E>[K]> {
    return this.rpc("loadField", ref, field)
  }

  // --------------------------------------------------------------------------
  // loadCollection
  // --------------------------------------------------------------------------

  async loadCollection<E extends EntityDefAny, K extends CollectionKeys<E>>(
    ref: Ref<E>,
    field: K,
    options?: PageRequest,
  ): Promise<Page<CollectionTargetRef<E, K>>> {
    return this.rpc("loadCollection", ref, field, options)
  }

  // --------------------------------------------------------------------------
  // store
  // --------------------------------------------------------------------------

  async store<E extends EntityDefAny>(input: EntityInput<E>): Promise<Ref<E>> {
    return this.rpc("store", input)
  }

  // --------------------------------------------------------------------------
  // loadPage
  // --------------------------------------------------------------------------

  loadPage<E extends EntityDefAny>(
    def: E,
    projection: RefsProjection,
    page?: PageRequest,
  ): Promise<Page<Ref<E>>>

  loadPage<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    def: E,
    projection: SelectProjection<E,K>,
    page?: PageRequest,
  ): Promise<Page<EntityResult<E, K>>>

  loadPage<E extends EntityDefAny>(
    def: E,
    projection: AllProjection,
    page?: PageRequest,
  ): Promise<Page<EntityResult<E, EntityFieldsKeys<E>>>>

  async loadPage(def: any, projection: any, page?: any): Promise<any> {
    return this.rpc("loadPage", def, projection, page)
  }

  // --------------------------------------------------------------------------
  // query
  // --------------------------------------------------------------------------

  query<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    query: EntityQuery<E, SelectProjection<E,K>>,
  ): Promise<Page<EntityResult<E, K>>>

  query<E extends EntityDefAny>(
    query: EntityQuery<E, RefsProjection>,
  ): Promise<Page<Ref<E>>>

  query<E extends EntityDefAny>(
    query: EntityQuery<E, AllProjection>,
  ): Promise<Page<EntityResult<E, EntityFieldsKeys<E>>>>

  async query(query: any): Promise<any> {
    return this.rpc("query", query)
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private rpc(method: string, ...args: unknown[]): Promise<any> {
    const request: RpcRequest = { id: crypto.randomUUID(), target: this.target, method, args }
    return this.transport.send(request)
  }
}
