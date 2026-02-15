import { LazyX } from '@max/core'
import { ValueParser, type ValueParserResult } from '@optique/core/valueparser'
import type { Suggestion } from '@optique/core/parser'
import { message } from '@optique/core/message'
import { ErrConnectorNotFound, MaxProjectApp } from '@max/app'

export class ProjectCompleters {

  get connectorSource() {
    return this._connectorSource.get
  }
  private _connectorSource = LazyX.once((): ValueParser<'async', string> => {
    const app = this.app
    return {
      $mode: 'async',
      metavar: 'SOURCE',
      async parse(input: string): Promise<ValueParserResult<string>> {
        return app.connectorRegistry.resolve(input).then(
          () => ({ success: true, value: input }),
          (e): ValueParserResult<string> => {
            if (ErrConnectorNotFound.is(e)) {
              return { success: false, error: message`${e.message}` }
            } else {
              return { success: false, error: e.message }
            }
          }
        )
      },
      format(value: string): string {
        return value
      },
      async *suggest(): AsyncGenerator<Suggestion> {
        const sources = app.connectorRegistry.list()
        for (const source of sources) {
          yield { kind: 'literal', text: source.name, description: message`${source.name}` }
        }
      },
    }
  })

  constructor(private app: MaxProjectApp) {}

}
