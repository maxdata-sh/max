/**
 * Transport — RPC communication infrastructure.
 */

export { createRpcSocketServer, type RpcSocketServer, type RpcSocketServerOptions, type RpcDispatchFn } from './rpc-socket-server.js'
export { SubprocessTransport } from './subprocess-transport.js'
