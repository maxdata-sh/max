/**
 * Shared MaxProjectApp bootstrap for examples.
 *
 * Points at bun-test-project/ which has a .max directory with installations.
 * Usage: import { app } from "./app.js"
 */

import * as path from 'node:path'
import { Projection } from '@max/core'
import { BunPlatform } from '@max/platform-bun'
import { AcmeConfig, AcmeUser } from '@max/connector-acme'
import * as os from "node:os";

const workspaceRoot = path.resolve(__dirname, '../../bun-test-project')

try {
  const max = BunPlatform.createGlobalMax()
  const dataDir = os.tmpdir()

  const workspaceId = await max.createWorkspace(
    'test-workspace', // we don't need this anymore, it can come from the spec
    {
      via: BunPlatform.workspace.deploy.inProcess,
      config:{
        strategy: 'in-process',
        dataDir: workspaceRoot,
        engine:{type: 'sqlite'},
        connectorRegistry: {type:'hardcoded', moduleMap: {  }}
      },
      spec:{
        name: "test-workspace",
      }
    }
  )

  const workspace = max.workspace(workspaceId)

  // ACTUALLY: We're trying to achieve the wrong thing here. We should either:
  // 1. Be 100% ephemeral - spin up an in-memory max and an in-memory acme and e2e test it
  // 2. Use "connect" here rather than create - and connect to the existing installation in bun-test-project
  // ^ That means that we need to implement logic in BunPlatform's "connect" that will re-create the installation client from the dependency config in the max.json file
  const acmeId = await workspace.createInstallation({
    via: BunPlatform.installation.deploy.inProcess,
    spec: {
      connector: 'acme',
      name: 'default',
      connectorConfig: { workspaceId: '1', baseUrl: 'none' } satisfies AcmeConfig,
      initialCredentials: { api_token: "123" }
    },
    config: {
      strategy: 'in-process',
      dataDir
    }
  })
  const acme = await workspace.installation(acmeId)

  console.log({
    installations: await workspace.listInstallations(),
    data: await workspace.health(),
    acme: await acme.engine.load(
      AcmeUser.ref('usr_14cc9f9adc384561b79f93b738e44649'),
      Projection.all
    ),
  })
} catch (e) {
  console.error(e)
}
