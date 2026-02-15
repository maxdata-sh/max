import {MaxGlobalApp} from "../entrypoints/max-global-app.js";
import {GlobalContext} from "../context/contexts.js";
import {GlobalConfig} from "../config/global-config.js";

const cfg = new GlobalConfig({
  devMode: true,
  projectRoot: '/Users/ben/projects/playground/max/max/bun-test-project',
  cwd: '/Users/ben/projects/playground/max/max/bun-test-project',
  mode: 'direct'
})
const ctx = new GlobalContext({
  config: cfg,
})
const app = new MaxGlobalApp(ctx)

await app.initProjectAtPath({path:'/tmp/max-1'})
