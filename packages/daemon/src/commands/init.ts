import { Command } from "../command.js";
import { Param } from "../param.js";
import { DaemonContext } from "../context.js";
import { FsProjectManager } from "../project-manager/fs-project-manager.js";
import { findProjectRoot } from "../project-manager/find-project-root.js";
import { ErrCannotInitialiseProject } from "../project-manager/errors.js";

export const initCommand = Command.define({
  name: "init",
  desc: "Initialise a new Max project in the current directory",
  context: DaemonContext,
  params: {
    force: Param.boolean({ desc: "Create a project here even if one exists in a parent directory" }),
  },
  run({ force }, _ctx) {
    const dir = process.cwd();
    const existingRoot = findProjectRoot(dir);

    if (existingRoot && !force) {
      throw ErrCannotInitialiseProject.create({ maxProjectRoot: existingRoot }, "project already exists. Use --force to create a nested project here");
    }

    FsProjectManager.init(dir);
    return `Initialised Max project at ${dir}\n`;
  },
});
