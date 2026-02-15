import {GlobalContext} from "../context/contexts.js";
import {ErrCannotInitialiseProject, findProjectRoot, FsProjectManager} from "../project-manager/index.js";

export const initCommand = ({
  async run(params:{
    path: string
    force?: boolean
  }, ctx: GlobalContext){
    const dir = params.path
    const existingRoot = findProjectRoot(dir);

    if (existingRoot && !params.force) {
      // TODO: We'll need to rewrite the error on this boundary (at the cli level) to tell the user to use --force!
      throw ErrCannotInitialiseProject.create({ maxProjectRoot: existingRoot }, "you are already in a max project! Use `force=true` to create one here anyway.");
    }

    FsProjectManager.init(dir);

    // TODO - return a result of some well-typed form, not a string
    // return `Initialised Max project at ${dir}\n`;

  }
})
