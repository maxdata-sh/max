/**
 * ProjectManager — manages all connector installations within a Max project.
 *
 * Single authority on where installations live, how they are identified,
 * and how their associated resources (credentials, config) are accessed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CredentialStore } from "@max/connector";
import type { InstallationId } from "@max/core";
import { StaticTypeCompanion } from "@max/core";
import type { PendingInstallation, ManagedInstallation, InstallationInfo } from "./types.js";
import { ErrInstallationNotFound, ErrInstallationAlreadyExists } from "./errors.js";
import { FsCredentialStore } from "./fs-credential-store.js";

// ============================================================================
// ProjectManager Interface
// ============================================================================

export interface ProjectManager {
  /** Create a pending installation. Not persisted until commit. */
  prepare(connector: string, name?: string): PendingInstallation;

  /** Persist a pending installation with its config. Returns the committed installation. */
  commit(pending: PendingInstallation, config: unknown): Promise<ManagedInstallation>;

  /** Get the credential store scoped to an installation (pending or committed). */
  credentialStoreFor(installation: PendingInstallation | ManagedInstallation): CredentialStore;

  /** Load an existing installation by connector and optional slug. */
  get(connector: string, name?: string): ManagedInstallation;

  /** Check if an installation exists for a connector (optionally with a specific slug). */
  has(connector: string, name?: string): boolean;

  /** List all committed installations. */
  list(): InstallationInfo[];

  /** Remove an installation and its associated credentials. */
  delete(connector: string, name?: string): Promise<void>;
}

export const ProjectManager = StaticTypeCompanion({
  create(projectRoot: string): ProjectManager {
    return new FsProjectManager(projectRoot);
  },
});

// ============================================================================
// Filesystem Implementation
// ============================================================================

class FsProjectManager implements ProjectManager {
  private readonly installationsDir: string;

  constructor(private readonly projectRoot: string) {
    this.installationsDir = path.join(projectRoot, ".max", "installations");
  }

  prepare(connector: string, name?: string): PendingInstallation {
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
    const dir = this.installationDir(installation.connector, installation.name);
    return new FsCredentialStore(path.join(dir, "credentials.json"));
  }

  get(connector: string, name?: string): ManagedInstallation {
    const slug = name ?? this.resolveDefaultSlug(connector);
    const filePath = path.join(this.installationDir(connector, slug), "installation.json");

    if (!fs.existsSync(filePath)) {
      throw ErrInstallationNotFound.create({ connector, name: slug });
    }

    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  has(connector: string, name?: string): boolean {
    try {
      const slug = name ?? this.resolveDefaultSlug(connector);
      return this.installationExists(connector, slug);
    } catch {
      return false;
    }
  }

  list(): InstallationInfo[] {
    if (!fs.existsSync(this.installationsDir)) return [];

    const results: InstallationInfo[] = [];

    for (const connectorEntry of fs.readdirSync(this.installationsDir, { withFileTypes: true })) {
      if (!connectorEntry.isDirectory()) continue;

      const connectorPath = path.join(this.installationsDir, connectorEntry.name);

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

  async delete(connector: string, name?: string): Promise<void> {
    const slug = name ?? this.resolveDefaultSlug(connector);
    const dir = this.installationDir(connector, slug);

    if (!fs.existsSync(path.join(dir, "installation.json"))) {
      throw ErrInstallationNotFound.create({ connector, name: slug });
    }

    fs.rmSync(dir, { recursive: true });

    // Clean up empty connector directory
    const connectorDir = path.join(this.installationsDir, connector);
    if (fs.existsSync(connectorDir) && fs.readdirSync(connectorDir).length === 0) {
      fs.rmSync(connectorDir);
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private installationDir(connector: string, slug: string): string {
    return path.join(this.installationsDir, connector, slug);
  }

  private installationExists(connector: string, slug: string): boolean {
    return fs.existsSync(path.join(this.installationDir(connector, slug), "installation.json"));
  }

  /**
   * Auto-assign a slug when prepare() is called without one.
   * - No existing installations → "default"
   * - "default" taken → "default-2", "default-3", ...
   */
  private autoSlug(connector: string): string {
    const connectorDir = path.join(this.installationsDir, connector);
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
  private resolveDefaultSlug(connector: string): string {
    const connectorDir = path.join(this.installationsDir, connector);
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
