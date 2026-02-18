import { GlobalConfig } from '../config/global-config.js'
import {
  ErrCannotInitialiseProject,
  findProjectRoot,
  FsProjectManager,
} from '../project-manager/index.js'

export interface MaxGlobalAppDependencies {
  config: GlobalConfig
}

export class MaxGlobalApp {
  constructor(public deps: MaxGlobalAppDependencies) {}

  async initProjectAtPath(params: { path: string; force?: boolean }) {
    const dir = params.path
    const existingRoot = findProjectRoot(dir)

    if (existingRoot && !params.force) {
      // TODO: We'll need to rewrite the error on this boundary (at the cli level) to tell the user to use --force!
      throw ErrCannotInitialiseProject.create(
        { maxProjectRoot: existingRoot },
        'you are already in a max project! Use `force=true` to create one here anyway.'
      )
    }

    // FIXME: This should be something that's dependency injected
    FsProjectManager.init(dir)

    // TODO - return a result of some well-typed form, not a string
    // return `Initialised Max project at ${dir}\n`;
    console.log({ params })
  }
}
