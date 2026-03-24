import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { stringify } from "yaml";
import { DEFAULT_HUB_PATH, REGISTRY_FILE, PROJECTS_DIR, TASKS_DIR, BACKLOG_FILE } from "./constants.js";
import { readYaml, writeYaml } from "./yaml-utils.js";
import { slugFromPath } from "../utils/slug.js";
import type { Registry, RegistryEntry } from "../models/registry.js";
import { validateRegistry } from "../models/registry.js";
import type { Project } from "../models/project.js";
import { DEFAULT_PROJECT } from "../models/project.js";

export interface AddProjectOptions {
  hubPath?: string;
  name?: string;
}

export interface AddProjectResult {
  slug: string;
  projectHubPath: string;
  created: boolean;
  message: string;
}

export async function addProject(
  projectPath: string,
  options: AddProjectOptions = {},
): Promise<AddProjectResult> {
  const hubPath = options.hubPath ?? DEFAULT_HUB_PATH;
  const absPath = resolve(projectPath);
  const { parentSlug, projectName, fullSlug } = slugFromPath(absPath);

  // Read existing registry
  const registryPath = join(hubPath, REGISTRY_FILE);
  const registry = await readYaml<Registry>(registryPath, validateRegistry);

  // Check for duplicate
  const existing = registry.projects.find(
    (p) => p.slug === fullSlug || p.path === absPath,
  );
  if (existing) {
    return {
      slug: existing.slug,
      projectHubPath: join(hubPath, PROJECTS_DIR, existing.slug),
      created: false,
      message: `Project already registered: ${existing.name} (${existing.slug})`,
    };
  }

  // Add to registry
  const entry: RegistryEntry = {
    slug: fullSlug,
    name: options.name ?? projectName,
    path: absPath,
    git_remote: null,
    active: true,
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  registry.projects.push(entry);
  await writeYaml(registryPath, registry);

  // Create project hub directory structure
  const projectHubPath = join(hubPath, PROJECTS_DIR, fullSlug);
  const dirs = [
    "",
    "context",
    TASKS_DIR,
    "decisions",
    "threads",
    "log",
  ];
  for (const dir of dirs) {
    await mkdir(join(projectHubPath, dir), { recursive: true });
  }

  // Write project.yaml
  const project: Project = {
    ...DEFAULT_PROJECT,
    id: projectName,
    name: options.name ?? projectName,
    slug: fullSlug,
    paths: [absPath],
    created_at: entry.created_at,
  };
  await writeYaml(join(projectHubPath, "project.yaml"), project);

  // Write empty BACKLOG.md
  const backlogPath = join(projectHubPath, TASKS_DIR, BACKLOG_FILE);
  if (!existsSync(backlogPath)) {
    await writeFile(
      backlogPath,
      `# Task Index — ${entry.name}\n\n## Backlog\n\n## Ready\n\n## Doing\n\n## Review\n\n## Done\n`,
      "utf-8",
    );
  }

  return {
    slug: fullSlug,
    projectHubPath,
    created: true,
    message: `Project registered: ${entry.name} → ${fullSlug}`,
  };
}

export async function listProjects(hubPath?: string): Promise<RegistryEntry[]> {
  const path = hubPath ?? DEFAULT_HUB_PATH;
  const registry = await readYaml<Registry>(join(path, REGISTRY_FILE), validateRegistry);
  return registry.projects;
}
