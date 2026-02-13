/**
 * AcmeWorkspace Resolver - Maps AcmeWorkspace fields to loaders.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { AcmeWorkspace, AcmeUser, AcmeProject } from "../entities.js";
import { AcmeAppContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

export const WorkspaceBasicLoader = Loader.entity({
  name: "acme:workspace:basic" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeWorkspace,

  async load(ref, ctx, deps) {
    const ws = await ctx.api.client.getWorkspace(ref.id);
    return EntityInput.create(ref, {
      name: ws.name,
    });
  },
});

export const WorkspaceUsersLoader = Loader.collection({
  name: "acme:workspace:users" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeWorkspace,
  target: AcmeUser,

  async load(ref, page, ctx, deps) {
    const users = await ctx.api.client.listUsers(ref.id);
    const items = users.map((u) =>
      EntityInput.create(AcmeUser.ref(u.id), {}),
    );
    return Page.from(items, false, undefined);
  },
});

export const WorkspaceProjectsLoader = Loader.collection({
  name: "acme:workspace:projects" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeWorkspace,
  target: AcmeProject,

  async load(ref, page, ctx, deps) {
    const projects = await ctx.api.client.listProjects(ref.id);
    const items = projects.map((p) =>
      EntityInput.create(AcmeProject.ref(p.id), {}),
    );
    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const AcmeWorkspaceResolver = Resolver.for(AcmeWorkspace, {
  name: WorkspaceBasicLoader.field("name"),
  users: WorkspaceUsersLoader.field(),
  projects: WorkspaceProjectsLoader.field(),
});
