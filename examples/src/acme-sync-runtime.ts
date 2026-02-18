/**
 * Syncs an Acme installation using InstallationRuntime.
 *
 * Requires a running Acme API and a connected installation in bun-test-project/.
 * Usage: bun run examples/acme-sync-runtime.ts
 */


/**
 * We'll restore this later, what we'll want to do:
 * The app will be a batteries-included wrapper on GlobalMax (or more likely WorkspaceMax)
 *
 * const app = new MaxBun({ config })
 * const installation = await app.getInstallation("acme", "default")
 * const handle = await installation.sync()
 * const result = await handle.completion();
 *
 * console.log(`\nSync ${result.status} in ${result.duration}ms`);
 * console.log(`  Tasks completed: ${result.tasksCompleted}`);
 * console.log(`  Tasks failed:    ${result.tasksFailed}`);
 *
 * await runtime.lifecycle.stop();
 */
