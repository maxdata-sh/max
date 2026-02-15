/**
 * Stand-in ProjectManager for when no .max project exists.
 * Throws ErrProjectNotInitialised on every method call.
 */

import type { ProjectManager } from "./project-manager.js";
import { ErrProjectNotInitialised } from "./errors.js";

export class UninitializedProjectManager implements ProjectManager {
  constructor(private readonly path: string) {}

  prepare(): never { return this.fail(); }
  commit(): never { return this.fail(); }
  credentialStoreFor(): never { return this.fail(); }
  get(): never { return this.fail(); }
  has(): never { return this.fail(); }
  list(): never { return this.fail(); }
  delete(): never { return this.fail(); }

  private fail(): never {
    throw ErrProjectNotInitialised.create({ maxProjectRoot: this.path });
  }
}
