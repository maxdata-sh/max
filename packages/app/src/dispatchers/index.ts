/**
 * Dispatchers — Node-level RPC dispatch.
 *
 * Each dispatcher composes handlers for one node type and serves as
 * the entry point for all incoming RPC calls to that node.
 */

export { InstallationDispatcher } from "./installation-dispatcher.js"
export { WorkspaceDispatcher } from "./workspace-dispatcher.js"
