#!/usr/bin/env bun

import { Tenant } from "./tenant.ts";
import { startServer } from "./server.ts";

const args = process.argv.slice(2);
const command = args[0];

function flag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function usage(): void {
  console.log(`Usage: acme <command> [options]

Commands:
  start   Start the Acme server for a tenant
  create  Create a new tenant without starting the server
  seed    Seed a tenant with sample data
  list    List all tenants

Options:
  --tenant <name>   Tenant name (required for start/create/seed)
  --port <number>   Port for the HTTP server (default: random)
  --data-dir <path> Directory for tenant storage (default: tenants)`);
}

async function main() {
  const tenantName = flag("tenant");
  const port = flag("port") ? parseInt(flag("port")!, 10) : undefined;
  const dataDir = flag("data-dir");

  switch (command) {
    case "start": {
      if (!tenantName) { console.error("Error: --tenant is required"); process.exit(1); }
      let tenant: Tenant;
      try {
        tenant = Tenant.open(tenantName, dataDir);
        console.log(`Opened existing tenant "${tenantName}"`);
      } catch {
        tenant = Tenant.create({ name: tenantName, storage: "file", dataDir });
        console.log(`Created new tenant "${tenantName}"`);
      }
      const effectivePort = port ?? tenant.getPort();
      const { url } = startServer(tenant, { port: effectivePort });
      console.log(`\nAcme server running at ${url}`);
      console.log(`API Key: ${tenant.getApiKey()}`);
      console.log(`Dashboard: ${url}/`);
      break;
    }

    case "create": {
      if (!tenantName) { console.error("Error: --tenant is required"); process.exit(1); }
      const tenant = Tenant.create({ name: tenantName, storage: "file", dataDir });
      console.log(`Tenant "${tenantName}" created`);
      console.log(`API Key: ${tenant.getApiKey()}`);
      tenant.dispose();
      break;
    }

    case "seed": {
      if (!tenantName) { console.error("Error: --tenant is required"); process.exit(1); }
      const tenant = Tenant.open(tenantName, dataDir);
      const result = await tenant.seed();
      console.log(`Seeded: ${result.workspaces} workspaces, ${result.users} users, ${result.projects} projects, ${result.tasks} tasks, ${result.files} files`);
      tenant.dispose();
      break;
    }

    case "list": {
      const tenants = Tenant.list(dataDir);
      if (tenants.length === 0) {
        console.log("No tenants found");
      } else {
        for (const t of tenants) console.log(t);
      }
      break;
    }

    default:
      usage();
      break;
  }
}

main();
