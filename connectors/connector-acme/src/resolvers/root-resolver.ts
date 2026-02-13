/**
 * AcmeRoot Resolver - Discovers workspaces from the root entry point.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { AcmeRoot, AcmeWorkspace } from "../entities.js";
import { AcmeAppContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

export const RootWorkspacesLoader = Loader.collection({
  name: "acme:root:workspaces" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeRoot,
  target: AcmeWorkspace,

  async load(ref, page, ctx, deps) {
    const workspaces = await ctx.api.client.listWorkspaces();
    const items = workspaces.map((ws) =>
      EntityInput.create(AcmeWorkspace.ref(ws.id), {}),
    );
    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const AcmeRootResolver = Resolver.for(AcmeRoot, {
  workspaces: RootWorkspacesLoader.field(),
});
