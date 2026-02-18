/**
 * Filesystem-backed ProjectManager implementation.
 *
 * Storage layout:
 *   .max/installations/<connector>/<slug>/installation.json
 *   .max/installations/<connector>/<slug>/credentials.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {CredentialStore} from "@max/connector";
import type {ConnectorType, InstallationId} from "@max/core";
import type {ProjectManager} from "./project-manager.js";
import type {InstallationInfo, ManagedInstallation, PendingInstallation} from "./types.js";
import {ErrInstallationAlreadyExists, ErrInstallationNotFound, ErrProjectNotInitialised,} from "./errors.js";
import {FsCredentialStore} from "../credential-store/fs-credential-store.js";
import {findProjectRoot} from "./find-project-root.js";

/** @deprecated: The "project-manager" concept is poorly defined now that we have {Global,Workspace,Installation}Max
 *  What this really is is a file-system-based installation registry with extra steps.
 *  We should rename / distribute accordingly.
 *  It certainly doens't belong in federation package - maybe @max/platform-bun
 *  FIXME
 * */
export class FsProjectManager implements ProjectManager {
  constructor(private readonly maxProjectRoot: string) {
    const root = findProjectRoot(maxProjectRoot)
    if (root !== maxProjectRoot){
      if (!root) throw ErrProjectNotInitialised.create({maxProjectRoot:maxProjectRoot}, `${root}`);
    }
  }

  /** Initialise a new Max project at `dir` and return a ProjectManager for it. */
  static init(dir: string): FsProjectManager {
    fs.mkdirSync(path.join(dir, ".max"), { recursive: true });
    const configPath = path.join(dir, "max.json");
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({}, null, 2));
    }
    return new FsProjectManager(dir);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  prepare(connector: ConnectorType, name?: string): PendingInstallation {
    const slug = name ?? this.autoSlug(connector);

    if (this.installationExists(connector, slug)) {
      throw ErrInstallationAlreadyExists.create({ connector, name: slug });
    }

    return { connector, name: slug };
  }

  async commit(pending: PendingInstallation, config: unknown): Promise<ManagedInstallation> {
    // Race guard: re-check existence at commit time
    if (this.installationExists(pending.connector, pending.name)) {
      throw ErrInstallationAlreadyExists.create({
        connector: pending.connector,
        name: pending.name,
      });
    }

    const id: InstallationId = crypto.randomUUID();
    const connectedAt = new Date().toISOString();

    const installation: ManagedInstallation = {
      connector: pending.connector,
      name: pending.name,
      id,
      config,
      connectedAt,
    };

    const dir = this.installationDir(pending.connector, pending.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "installation.json"),
      JSON.stringify(installation, null, 2),
    );

    return installation;
  }

  credentialStoreFor(installation: PendingInstallation | ManagedInstallation): CredentialStore {
    const filePath = path.join(
      this.installationDir(installation.connector, installation.name),
      "credentials.json",
    );
    return new FsCredentialStore(filePath);
  }

  get(connector: ConnectorType, name?: string): ManagedInstallation {
    const slug = name ?? this.resolveDefaultSlug(connector);
    const filePath = path.join(this.installationDir(connector, slug), "installation.json");

    if (!fs.existsSync(filePath)) {
      throw ErrInstallationNotFound.create({ connector, name: slug });
    }

    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  has(connector: ConnectorType, name?: string): boolean {
    try {
      const slug = name ?? this.resolveDefaultSlug(connector);
      return this.installationExists(connector, slug);
    } catch {
      return false;
    }
  }

  list(): InstallationInfo[] {
    const installationsDir = this.installationsDir();
    if (!fs.existsSync(installationsDir)) return [];

    const results: InstallationInfo[] = [];

    for (const connectorEntry of fs.readdirSync(installationsDir, { withFileTypes: true })) {
      if (!connectorEntry.isDirectory()) continue;

      const connectorPath = path.join(installationsDir, connectorEntry.name);

      for (const slugEntry of fs.readdirSync(connectorPath, { withFileTypes: true })) {
        if (!slugEntry.isDirectory()) continue;

        const filePath = path.join(connectorPath, slugEntry.name, "installation.json");
        if (!fs.existsSync(filePath)) continue;

        const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ManagedInstallation;
        results.push({
          connector: data.connector,
          name: data.name,
          id: data.id,
          connectedAt: data.connectedAt,
          location: `file://${filePath}`
        });
      }
    }

    return results.sort(
      (a, b) => a.connector.localeCompare(b.connector) || a.name.localeCompare(b.name),
    );
  }

  dataPathFor(installation: ManagedInstallation): string {
    return path.join(this.installationDir(installation.connector, installation.name), "data.db");
  }

  async delete(connector: ConnectorType, name?: string): Promise<void> {
    const slug = name ?? this.resolveDefaultSlug(connector);
    const dir = this.installationDir(connector, slug);

    if (!fs.existsSync(path.join(dir, "installation.json"))) {
      throw ErrInstallationNotFound.create({ connector, name: slug });
    }

    fs.rmSync(dir, { recursive: true });

    // Clean up empty connector directory
    const connectorDir = path.join(this.installationsDir(), connector);
    if (fs.existsSync(connectorDir) && fs.readdirSync(connectorDir).length === 0) {
      fs.rmdirSync(connectorDir);
    }
  }

  // --------------------------------------------------------------------------
  // Path helpers
  // --------------------------------------------------------------------------

  private installationsDir(): string {
    return path.join(this.maxProjectRoot, ".max", "installations");
  }

  private installationDir(connector: ConnectorType, slug: string): string {
    return path.join(this.installationsDir(), connector, slug);
  }

  private installationExists(connector: ConnectorType, slug: string): boolean {
    return fs.existsSync(path.join(this.installationDir(connector, slug), "installation.json"));
  }

  // --------------------------------------------------------------------------
  // Slug helpers
  // --------------------------------------------------------------------------

  /**
   * Auto-assign a slug when prepare() is called without one.
   * - No existing installations → "default"
   * - "default" taken → "default-2", "default-3", ...
   */
  private autoSlug(connector: ConnectorType): string {
    const connectorDir = path.join(this.installationsDir(), connector);
    if (!fs.existsSync(connectorDir)) return "default";

    const slugs = fs
      .readdirSync(connectorDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    if (!slugs.includes("default")) return "default";

    let n = 2;
    while (slugs.includes(`default-${n}`)) n++;
    return `default-${n}`;
  }

  /**
   * Resolve which slug to use when name is omitted on get/has/delete.
   * - If "default" exists, use it
   * - If exactly one installation exists, use that
   * - Otherwise, throw
   */
  private resolveDefaultSlug(connector: ConnectorType): string {
    const connectorDir = path.join(this.installationsDir(), connector);
    if (!fs.existsSync(connectorDir)) {
      throw ErrInstallationNotFound.create({ connector });
    }

    const slugs = fs
      .readdirSync(connectorDir, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          fs.existsSync(path.join(connectorDir, d.name, "installation.json")),
      )
      .map((d) => d.name);

    if (slugs.length === 0) {
      throw ErrInstallationNotFound.create({ connector });
    }

    if (slugs.includes("default")) return "default";
    if (slugs.length === 1) return slugs[0];

    // Multiple installations, none named "default" — ambiguous
    throw ErrInstallationNotFound.create({ connector });
  }
}
