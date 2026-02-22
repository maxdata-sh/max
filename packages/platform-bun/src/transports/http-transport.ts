import { ErrNotImplemented, RpcRequest, Transport } from '@max/core'

export class HttpTransport implements Transport {
  static async connect(url: string) {
    return new HttpTransport(url)
  }

  constructor(baseUrl: string) {}

  send(request: RpcRequest): Promise<unknown> {
    throw ErrNotImplemented.create({}, 'HTTP Transport not yet implemented')
  }
  close(): Promise<void> {
    throw ErrNotImplemented.create({}, 'HTTP Transport not yet implemented')
  }
}
