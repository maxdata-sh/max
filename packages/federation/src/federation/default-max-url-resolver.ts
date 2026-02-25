import { MaxUrlResolver, ResolvedTarget } from './max-url-resolver.js'
import { MaxUrl } from '@max/core'
import { MaxClientResolver } from './max-client-resolver.js'
import {
  ErrInstallationNotResolved,
  ErrRemoteUrlNotSupported,
  ErrWorkspaceNotResolved,
} from '../errors/errors.js'

export class DefaultMaxUrlResolver implements MaxUrlResolver {
  constructor(private targets: MaxClientResolver) {}

  async resolve(url: MaxUrl): Promise<ResolvedTarget> {
    if (!url.isLocal) {
      throw ErrRemoteUrlNotSupported.create({ url: url.toString() })
    }

    const globalClient = this.targets.global()

    // Level 0: Global
    if (url.level === 'global') {
      return { level: 'global', global: globalClient }
    }

    // Level 1: Workspace
    const ws = this.targets.workspace(url.workspace!)
    if (!ws) {
      throw ErrWorkspaceNotResolved.create({ segment: url.workspace!, url: url.toString() })
    }

    if (url.level === 'workspace') {
      return { level: 'workspace', global: globalClient, workspace: ws }
    }

    // Level 2: Installation (async — may require listing installations over the wire)
    const inst = await this.targets.installation(url.installation!, ws)
    if (!inst) {
      throw ErrInstallationNotResolved.create({
        segment: url.installation!,
        workspace: url.workspace!,
        url: url.toString(),
      })
    }

    return {
      level: 'installation',
      global: globalClient,
      workspace: ws,
      installation: inst,
    }
  }
}
