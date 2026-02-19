import type { NodeProvider } from '@max/core'
import type { InstallationClient } from '../protocols/index.js'
import type { InstallationSpec } from '../config/installation-spec.js'

/**
 * Provides Installation nodes.
 *
 * create() receives an InstallationSpec — the provider-agnostic description
 * of what the installation needs to be. The provider handles hosting and
 * transport but does NOT interpret the spec.
 */
export interface InstallationNodeProvider extends NodeProvider<InstallationClient, InstallationSpec> {}
