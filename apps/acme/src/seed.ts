import { Faker, en, base } from "@faker-js/faker";
import type { Tenant } from "./tenant.ts";
import type { EntityType, SeedOptions, SeedResult } from "./types.ts";

class Generator {
  private faker: Faker;

  constructor(seed: number) {
    this.faker = new Faker({ locale: [en, base] });
    this.faker.seed(seed);
  }

  forEntity(entityType: EntityType, overrideSeed?: number): Generator {
    if (overrideSeed !== undefined) return new Generator(overrideSeed);
    // Derive a deterministic sub-seed from global seed + entity type
    let hash = 0;
    for (const ch of entityType) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return new Generator((this.faker.number.int({ min: 0, max: 2 ** 31 }) ^ hash) >>> 0);
  }

  workspaceName(): string {
    return `${this.faker.company.name()} Workspace`;
  }

  userName(): { email: string; displayName: string } {
    const first = this.faker.person.firstName();
    const last = this.faker.person.lastName();
    return {
      email: this.faker.internet.email({ firstName: first, lastName: last }).toLowerCase(),
      displayName: `${first} ${last}`,
    };
  }

  projectName(): string {
    return `${this.faker.hacker.adjective()} ${this.faker.hacker.noun()}`;
  }

  projectDescription(): string {
    return this.faker.company.catchPhrase();
  }

  taskTitle(): string {
    return this.faker.hacker.phrase();
  }

  taskDescription(): string | undefined {
    return this.faker.datatype.boolean(0.7) ? this.faker.lorem.paragraph() : undefined;
  }

  taskStatus(): "todo" | "in_progress" | "in_review" | "done" {
    return this.faker.helpers.arrayElement(["todo", "in_progress", "in_review", "done"]);
  }

  taskPriority(): "critical" | "high" | "medium" | "low" | "none" {
    return this.faker.helpers.weightedArrayElement([
      { value: "critical" as const, weight: 1 },
      { value: "high" as const, weight: 2 },
      { value: "medium" as const, weight: 4 },
      { value: "low" as const, weight: 2 },
      { value: "none" as const, weight: 1 },
    ]);
  }

  taskTags(): string[] {
    const pool = ["bug", "feature", "docs", "chore", "refactor", "performance", "security", "ux", "backend", "frontend"];
    return this.faker.helpers.arrayElements(pool, { min: 0, max: 3 });
  }

  dueDate(): string | undefined {
    return this.faker.datatype.boolean(0.5)
      ? this.faker.date.future({ years: 0.5 }).toISOString().split("T")[0]
      : undefined;
  }

  fileName(): string {
    const ext = this.faker.helpers.arrayElement(["pdf", "png", "jpg", "docx", "xlsx", "csv", "md", "txt"]);
    return `${this.faker.system.commonFileName(ext)}`;
  }

  fileMimeType(name: string): string {
    const ext = name.split(".").pop()!;
    const map: Record<string, string> = {
      pdf: "application/pdf", png: "image/png", jpg: "image/jpeg",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv", md: "text/markdown", txt: "text/plain",
    };
    return map[ext] ?? "application/octet-stream";
  }

  fileSize(): number {
    return this.faker.number.int({ min: 1024, max: 10 * 1024 * 1024 });
  }

  pick<T>(arr: T[]): T {
    return this.faker.helpers.arrayElement(arr);
  }
}

export function seedTenant(tenant: Tenant, options?: SeedOptions): SeedResult {
  const opts = {
    workspaces: options?.workspaces ?? 1,
    usersPerWorkspace: options?.usersPerWorkspace ?? 5,
    projectsPerWorkspace: options?.projectsPerWorkspace ?? 3,
    tasksPerProject: options?.tasksPerProject ?? 10,
    filesPerProject: options?.filesPerProject ?? 5,
  };

  const globalSeed = options?.globalSeed ?? 42;

  // Track seed batches to avoid duplicate data across repeated seed calls.
  // Each batch gets a different effective seed so Faker produces unique output.
  const batch = parseInt(tenant.getMeta("seed_batch") ?? "0", 10);
  const effectiveSeed = globalSeed + batch * 10000;
  tenant.setMeta("seed_batch", String(batch + 1));

  const root = new Generator(effectiveSeed);

  const counts: SeedResult = { workspaces: 0, users: 0, projects: 0, tasks: 0, files: 0 };

  const wsGen = root.forEntity("workspace", options?.entitySeeds?.workspace);
  const userGen = root.forEntity("user", options?.entitySeeds?.user);
  const projGen = root.forEntity("project", options?.entitySeeds?.project);
  const taskGen = root.forEntity("task", options?.entitySeeds?.task);
  const fileGen = root.forEntity("file", options?.entitySeeds?.file);

  // If existingOnly, add tasks and files to all existing projects
  // without creating any new workspaces, users, or projects.
  if (options?.existingOnly) {
    const projects = tenant.listProjects(options?.workspaceId ?? undefined);
    if (projects.length === 0) throw new Error("No existing projects to seed into");

    for (const project of projects) {
      const users = tenant.listUsers(project.workspaceId);
      if (users.length === 0) continue;
      const userIds = users.map((u) => u.id);

      for (let t = 0; t < opts.tasksPerProject; t++) {
        tenant.createTask({
          projectId: project.id,
          title: taskGen.taskTitle(),
          description: taskGen.taskDescription(),
          status: taskGen.taskStatus(),
          priority: taskGen.taskPriority(),
          assigneeId: taskGen.pick(userIds),
          createdById: taskGen.pick(userIds),
          dueDate: taskGen.dueDate(),
          tags: taskGen.taskTags(),
        });
        counts.tasks++;
      }

      for (let f = 0; f < opts.filesPerProject; f++) {
        const name = fileGen.fileName();
        tenant.createFile({
          projectId: project.id,
          name,
          mimeType: fileGen.fileMimeType(name),
          sizeBytes: fileGen.fileSize(),
          createdById: fileGen.pick(userIds),
        });
        counts.files++;
      }
    }

    return counts;
  }

  // If workspaceId is provided, seed projects into that existing workspace
  // using its existing users instead of creating new workspaces.
  if (options?.workspaceId) {
    const ws = tenant.getWorkspace(options.workspaceId);
    if (!ws) throw new Error(`Workspace "${options.workspaceId}" not found`);

    const existingUsers = tenant.listUsers(options.workspaceId);
    if (existingUsers.length === 0) throw new Error("Workspace has no users");
    const userIds = existingUsers.map((u) => u.id);

    for (let p = 0; p < opts.projectsPerWorkspace; p++) {
      const project = tenant.createProject({
        workspaceId: options.workspaceId,
        name: projGen.projectName(),
        description: projGen.projectDescription(),
        ownerId: projGen.pick(userIds),
      });
      counts.projects++;

      for (let t = 0; t < opts.tasksPerProject; t++) {
        tenant.createTask({
          projectId: project.id,
          title: taskGen.taskTitle(),
          description: taskGen.taskDescription(),
          status: taskGen.taskStatus(),
          priority: taskGen.taskPriority(),
          assigneeId: taskGen.pick(userIds),
          createdById: taskGen.pick(userIds),
          dueDate: taskGen.dueDate(),
          tags: taskGen.taskTags(),
        });
        counts.tasks++;
      }

      for (let f = 0; f < opts.filesPerProject; f++) {
        const name = fileGen.fileName();
        tenant.createFile({
          projectId: project.id,
          name,
          mimeType: fileGen.fileMimeType(name),
          sizeBytes: fileGen.fileSize(),
          createdById: fileGen.pick(userIds),
        });
        counts.files++;
      }
    }

    return counts;
  }

  for (let w = 0; w < opts.workspaces; w++) {
    const workspace = tenant.createWorkspace({ name: wsGen.workspaceName() });
    counts.workspaces++;

    // Create a ghost user for system operations
    const ghost = tenant.createUser({
      workspaceId: workspace.id,
      email: "system@acme.local",
      displayName: "Acme System",
      role: "admin",
    });
    counts.users++;

    const userIds: string[] = [ghost.id];

    for (let u = 0; u < opts.usersPerWorkspace; u++) {
      const { email, displayName } = userGen.userName();
      const user = tenant.createUser({
        workspaceId: workspace.id,
        email,
        displayName,
        role: userGen.pick(["admin", "member", "member", "member", "viewer"] as const),
      });
      userIds.push(user.id);
      counts.users++;
    }

    for (let p = 0; p < opts.projectsPerWorkspace; p++) {
      const project = tenant.createProject({
        workspaceId: workspace.id,
        name: projGen.projectName(),
        description: projGen.projectDescription(),
        ownerId: projGen.pick(userIds),
      });
      counts.projects++;

      for (let t = 0; t < opts.tasksPerProject; t++) {
        tenant.createTask({
          projectId: project.id,
          title: taskGen.taskTitle(),
          description: taskGen.taskDescription(),
          status: taskGen.taskStatus(),
          priority: taskGen.taskPriority(),
          assigneeId: taskGen.pick(userIds),
          createdById: taskGen.pick(userIds),
          dueDate: taskGen.dueDate(),
          tags: taskGen.taskTags(),
        });
        counts.tasks++;
      }

      for (let f = 0; f < opts.filesPerProject; f++) {
        const name = fileGen.fileName();
        tenant.createFile({
          projectId: project.id,
          name,
          mimeType: fileGen.fileMimeType(name),
          sizeBytes: fileGen.fileSize(),
          createdById: fileGen.pick(userIds),
        });
        counts.files++;
      }
    }
  }

  return counts;
}
