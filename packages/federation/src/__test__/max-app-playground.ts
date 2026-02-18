import {MaxGlobalApp} from "../entrypoints/max-global-app.js";
import {GlobalConfig} from "../config/global-config.js";

const cfg = new GlobalConfig({
  devMode: true,
  projectRoot: '/Users/ben/projects/playground/max/max/bun-test-project',
  cwd: '/Users/ben/projects/playground/max/max/bun-test-project',
  mode: 'direct'
})

const app = new MaxGlobalApp({
  config: cfg
})

await app.initProjectAtPath({path:'/tmp/max-1'})
