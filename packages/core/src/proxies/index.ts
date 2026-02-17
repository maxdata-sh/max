/**
 * Proxies — Proxy+Handler pairs for interfaces that cross process boundaries.
 *
 * Each interface (Engine, Supervised) has a paired proxy (caller-side) and
 * handler (receiver-side), co-located in this package.
 */

export { EngineProxy } from "./engine-proxy.js"
export { EngineHandler } from "./engine-handler.js"
export { SupervisedProxy } from "./supervised-proxy.js"
export { SupervisedHandler } from "./supervised-handler.js"
export { LoopbackTransport, type DispatchFn } from "./loopback-transport.js"
