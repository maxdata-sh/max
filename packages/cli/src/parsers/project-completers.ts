import { LazyX, makeLazy, makeLazyF} from '@max/core'
import { ValueParser, type ValueParserResult } from '@optique/core/valueparser'
import type { Suggestion } from '@optique/core/parser'
import { message, text } from '@optique/core/message'
import { ErrConnectorNotFound } from '@max/federation'
import type { WorkspaceClient } from '@max/federation'
import { Fmt } from '@max/core'

export class ProjectCompleters {
  lazy = makeLazy({

    /** Completer for connector names (sources) */
    connectorSource: (): ValueParser<'async', string> => {
      const getWorkspace = this.workspaceThunk
      return {
        $mode: 'async',
        metavar: 'SOURCE',
        async parse(input: string): Promise<ValueParserResult<string>> {
          const ws = await getWorkspace()
          return ws.connectorSchema(input).then(
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
          const ws = await getWorkspace()
          const sources = await ws.listConnectors()
          for (const source of sources) {
            yield { kind: 'literal', text: source.name, description: message`${source.name}` }
          }
        },
      }
    },

    /** Completer for installed connectors */
    installedConnectorSource: (): ValueParser<'async', string> => {
      const getWorkspace = this.workspaceThunk
      const fmt = this.fmt
      return {
        $mode: 'async',
        metavar: 'CONNECTOR',
        async parse(input: string): Promise<ValueParserResult<string>> {
          const ws = await getWorkspace()
          return ws.connectorSchema(input).then(
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
          const ws = await getWorkspace()
          const connectors = await ws.listConnectors()
          const installations = await ws.listInstallations()
          const installed = new Set(installations.map((i) => i.connector))

          for (const c of connectors) {
            if (installed.has(c.name)) {
              yield { kind: 'literal', text: c.name, description: message`${c.name}` }
            }
          }
          for (const c of connectors) {
            if (!installed.has(c.name)) {
              yield {
                kind: 'literal',
                text: c.name,
                description: message`${text(fmt.red('\u2717'))} no installations`,
              }
            }
          }
        },
      }
    },

    /** Completer for installation names */
    installationName: (): ValueParser<'async', string> => {
      const getWorkspace = this.workspaceThunk
      const fmt = this.fmt
      return {
        $mode: 'async',
        metavar: 'NAME',
        async parse(input: string): Promise<ValueParserResult<string>> {
          return { success: true, value: input }
        },
        format(value: string): string {
          return value
        },
        async *suggest(): AsyncGenerator<Suggestion> {
          const ws = await getWorkspace()
          const installations = await ws.listInstallations()
          for (const inst of installations) {
            yield {
              kind: 'literal',
              text: inst.name,
              description: message`${text(fmt.dim(inst.connector))}:${inst.name}`,
            }
          }
        },
      }
    },
  })

  get connectorSource() {
    return this.lazy.connectorSource
  }

  /** Connector source that prioritises connectors with installations. */
  get installedConnectorSource() {
    return this.lazy.installedConnectorSource
  }

  get installationName() {
    return this.lazy.installationName
  }

  constructor(
    private workspaceThunk: () => Promise<WorkspaceClient>,
    private fmt: Fmt
  ) {}
}
