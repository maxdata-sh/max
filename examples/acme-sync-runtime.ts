/**
 * Syncs an Acme installation using InstallationRuntime.
 *
 * Requires a running Acme API and a connected installation in bun-test-project/.
 * Usage: bun run examples/acme-sync-runtime.ts
 */

import { app } from "./app.js";

const runtime = await app.runtime("acme", "default");
console.log(`Runtime started for ${runtime.info.connector}:${runtime.info.name}`);

console.log("Syncing...");
const handle = await runtime.sync();
const result = await handle.completion();

console.log(`\nSync ${result.status} in ${result.duration}ms`);
console.log(`  Tasks completed: ${result.tasksCompleted}`);
console.log(`  Tasks failed:    ${result.tasksFailed}`);

await runtime.stop();
