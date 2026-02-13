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
import {AcmeWorkspace, AcmeUser, AcmeProject, AcmeTask} from "../entities.js";
import { AcmeAppContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

export const ProjectBasicLoader = Loader.entity({
  name: "acme:project:basic" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeProject,

  async load(ref, ctx, deps) {
    const ws = await ctx.api.client.getProject(ref.id);
    return EntityInput.create(ref, {
      description: ws.description || undefined,
      name: ws.name,
      owner: AcmeUser.ref(ws.ownerId),
      status: ws.status,
    });
  },
});

export const ProjectTasksLoader = Loader.collection({
  name: "acme:project:tasks" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeProject,
  target: AcmeTask,

  async load(ref, page, ctx, deps) {
    const tasks = await ctx.api.client.listTasks(ref.id);
    const items = tasks.map((t) =>
      EntityInput.create(AcmeTask.ref(t.id), {
        status: t.status,
        description: t.description || undefined,
        title: t.title,
        priority: t.priority,
      }),
    );
    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const AcmeProjectResolver = Resolver.for(AcmeProject, {
  name: ProjectBasicLoader.field('name'),
  description: ProjectBasicLoader.field('description'),
  status: ProjectBasicLoader.field('status'),
  owner: ProjectBasicLoader.field('owner'),
  tasks: ProjectTasksLoader.field('tasks')
});
