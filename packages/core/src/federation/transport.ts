/**
 * Transport — Uniform message passing. Implementation-agnostic.
 *
 * The pipe between a parent and a child. What flows through it (the protocol)
 * is level-specific; how it flows (the transport) is deployment-specific.
 *
 * Implementations:
 *   - InProcessTransport: direct method calls, no serialization
 *   - UnixSocketTransport: JSONL over Unix socket (current daemon model)
 *   - HttpTransport: HTTP to a remote server
 *   - DockerTransport: mapped port or socket to a container
 *
 * Type safety comes from the protocol layer that wraps the transport.
 * The transport itself is an untyped pipe — this is intentional, as it
 * must work uniformly across all deployment strategies.
 */

export interface Transport {
  send(message: unknown): Promise<unknown>
}
