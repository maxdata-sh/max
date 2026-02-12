/**
 * Filesystem-backed ProjectManager implementation.
 *
 * Storage layout:
 *   .max/installations/<connector>/<slug>/installation.json
 *   .max/installations/<connector>/<slug>/credentials.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CredentialStore } from "@max/connector";
import type { ConnectorType, InstallationId } from "@max/core";
import type { ProjectManager } from "./project-manager.js";
import type { PendingInstallation, ManagedInstallation, InstallationInfo } from "./types.js";
import {
  ErrInstallationNotFound,
  ErrInstallationAlreadyExists,
  ErrProjectNotInitialised,
} from "./errors.js";
import { FsCredentialStore } from "./fs-credential-store.js";
import { findProjectRoot } from "./find-project-root.js";

export class FsProjectManager implements ProjectManager {
  constructor(private readonly startDir: string) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  prepare(connector: ConnectorType, name?: string): PendingInstallation {
    const root = findProjectRoot(this.startDir);
    const slug = name ?? this.autoSlug(connector, root);

    if (root !== null && this.installationExists(root, connector, slug)) {
      throw ErrInstallationAlreadyExists.create({ connector, name: slug });
    }

    return { connector, name: slug };
  }

  async commit(pending: PendingInstallation, config: unknown): Promise<ManagedInstallation> {
    const root = this.writeRoot();

    // Race guard: re-check existence at commit time
    if (this.installationExists(root, pending.connector, pending.name)) {
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

    const dir = this.installationDir(root, pending.connector, pending.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "installation.json"),
      JSON.stringify(installation, null, 2),
    );

    return installation;
  }

  credentialStoreFor(installation: PendingInstallation | ManagedInstallation): CredentialStore {
    const root = this.writeRoot();
    const filePath = path.join(
      this.installationDir(root, installation.connector, installation.name),
      "credentials.json",
    );
    return new FsCredentialStore(filePath);
  }

  get(connector: ConnectorType, name?: string): ManagedInstallation {
    const root = this.requireRoot();
    const slug = name ?? this.resolveDefaultSlug(root, connector);
    const filePath = path.join(this.installationDir(root, connector, slug), "installation.json");

    if (!fs.existsSync(filePath)) {
      throw ErrInstallationNotFound.create({ connector, name: slug });
    }

    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  has(connector: ConnectorType, name?: string): boolean {
    const root = findProjectRoot(this.startDir);
    if (root === null) return false;

    try {
      const slug = name ?? this.resolveDefaultSlug(root, connector);
      return this.installationExists(root, connector, slug);
    } catch {
      return false;
    }
  }

  list(): InstallationInfo[] {
    const root = findProjectRoot(this.startDir);
    if (root === null) return [];

    const installationsDir = this.installationsDir(root);
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
        });
      }
    }

    return results.sort(
      (a, b) => a.connector.localeCompare(b.connector) || a.name.localeCompare(b.name),
    );
  }

  async delete(connector: ConnectorType, name?: string): Promise<void> {
    const root = this.requireRoot();
    const slug = name ?? this.resolveDefaultSlug(root, connector);
    const dir = this.installationDir(root, connector, slug);

    if (!fs.existsSync(path.join(dir, "installation.json"))) {
      throw ErrInstallationNotFound.create({ connector, name: slug });
    }

    fs.rmSync(dir, { recursive: true });

    // Clean up empty connector directory
    const connectorDir = path.join(this.installationsDir(root), connector);
    if (fs.existsSync(connectorDir) && fs.readdirSync(connectorDir).length === 0) {
      fs.rmdirSync(connectorDir);
    }
  }

  // --------------------------------------------------------------------------
  // Root resolution
  // --------------------------------------------------------------------------

  /** Walk to find project root, or throw if not in a project. */
  private requireRoot(): string {
    const root = findProjectRoot(this.startDir);
    if (root === null) throw ErrProjectNotInitialised.create({});
    return root;
  }

  /** Walk to find project root, or fall back to startDir for first-time creation. */
  private writeRoot(): string {
    return findProjectRoot(this.startDir) ?? this.startDir;
  }

  // --------------------------------------------------------------------------
  // Path helpers
  // --------------------------------------------------------------------------

  private installationsDir(root: string): string {
    return path.join(root, ".max", "installations");
  }

  private installationDir(root: string, connector: ConnectorType, slug: string): string {
    return path.join(this.installationsDir(root), connector, slug);
  }

  private installationExists(root: string, connector: ConnectorType, slug: string): boolean {
    return fs.existsSync(path.join(this.installationDir(root, connector, slug), "installation.json"));
  }

  // --------------------------------------------------------------------------
  // Slug helpers
  // --------------------------------------------------------------------------

  /**
   * Auto-assign a slug when prepare() is called without one.
   * - No existing installations → "default"
   * - "default" taken → "default-2", "default-3", ...
   */
  private autoSlug(connector: ConnectorType, root: string | null): string {
    if (root === null) return "default";

    const connectorDir = path.join(this.installationsDir(root), connector);
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
  private resolveDefaultSlug(root: string, connector: ConnectorType): string {
    const connectorDir = path.join(this.installationsDir(root), connector);
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
