/**
 * Tests the RPC socket server + SubprocessTransport roundtrip.
 *
 * Creates a socket server with a mock dispatcher, connects a
 * SubprocessTransport client, and verifies request/response flow.
 */

import { describe, test, expect, afterEach } from 'bun:test'
import * as os from 'node:os'
import * as path from 'node:path'
import { MaxError, RpcResponse, type RpcRequest } from '@max/core'
import { createRpcSocketServer, type RpcSocketServer } from '../rpc-socket-server.js'
import { SubprocessTransport } from '../subprocess-transport.js'
import { InstallationClientProxy } from '../../protocols/installation-client-proxy.js'

let server: RpcSocketServer | null = null
let transport: SubprocessTransport | null = null

afterEach(async () => {
  if (transport) {
    await transport.close()
    transport = null
  }
  if (server) {
    server.stop()
    server = null
  }
})

function tmpSocketPath(): string {
  return path.join(os.tmpdir(), `max-test-${crypto.randomUUID().slice(0, 8)}.sock`)
}

describe('RPC socket roundtrip', () => {
  test('basic request/response', async () => {
    const socketPath = tmpSocketPath()

    server = createRpcSocketServer({
      socketPath,
      dispatch: async (req) => {
        return RpcResponse.ok(req.id, { echo: req.method })
      },
    })

    // Small delay for server to bind
    await Bun.sleep(10)

    transport = await SubprocessTransport.connect(socketPath)

    const result = await transport.send({
      id: 'test-1',
      target: '',
      method: 'health',
      args: [],
    })

    expect(result).toEqual({ echo: 'health' })
  })

  test('error propagation', async () => {
    const socketPath = tmpSocketPath()

    server = createRpcSocketServer({
      socketPath,
      dispatch: async (req) => {
        return RpcResponse.error(req.id, MaxError.serialize(new Error('test error')))
      },
    })

    await Bun.sleep(10)
    transport = await SubprocessTransport.connect(socketPath)

    try {
      await transport.send({
        id: 'test-err',
        target: '',
        method: 'fail',
        args: [],
      })
      expect(true).toBe(false) // should not reach
    } catch (err) {
      expect(MaxError.isMaxError(err)).toBe(true)
    }
  })

  test('multiple concurrent requests', async () => {
    const socketPath = tmpSocketPath()

    server = createRpcSocketServer({
      socketPath,
      dispatch: async (req) => {
        // Simulate varying latency
        const delay = req.method === 'slow' ? 50 : 5
        await Bun.sleep(delay)
        return RpcResponse.ok(req.id, { method: req.method })
      },
    })

    await Bun.sleep(10)
    transport = await SubprocessTransport.connect(socketPath)

    const [slow, fast] = await Promise.all([
      transport.send({ id: 'req-slow', target: '', method: 'slow', args: [] }),
      transport.send({ id: 'req-fast', target: '', method: 'fast', args: [] }),
    ])

    expect(slow).toEqual({ method: 'slow' })
    expect(fast).toEqual({ method: 'fast' })
  })

  test('works with InstallationClientProxy', async () => {
    const socketPath = tmpSocketPath()

    // Mock a dispatcher that handles health
    server = createRpcSocketServer({
      socketPath,
      dispatch: async (req) => {
        if (req.method === 'health') {
          return RpcResponse.ok(req.id, { status: 'healthy' })
        }
        if (req.method === 'schema') {
          return RpcResponse.ok(req.id, { namespace: 'test', entities: [] })
        }
        return RpcResponse.error(req.id, MaxError.serialize(new Error(`Unknown: ${req.method}`)))
      },
    })

    await Bun.sleep(10)
    transport = await SubprocessTransport.connect(socketPath)

    const client = new InstallationClientProxy(transport)
    const health = await client.health()
    expect(health.status).toBe('healthy')
  })
})
