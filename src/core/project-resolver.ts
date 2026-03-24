import { join } from "node:path";
import { realpath } from "node:fs/promises";
import { DEFAULT_HUB_PATH, REGISTRY_FILE, PROJECTS_DIR } from "./constants.js";
import { readYaml } from "./yaml-utils.js";
import type { Registry } from "../models/registry.js";
import { validateRegistry } from "../models/registry.js";

export interface ResolvedProject {
  slug: string;
  name: string;
  hubProjectPath: string;
}

async function canonicalize(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return p;
  }
}

/**
 * Resolve the current project from a working directory path.
 * Matches against registry entries by checking if cwd starts with a registered project path.
 * Uses realpath to canonicalize symlinks (e.g., /var vs /private/var on macOS).
 */
export async function resolveProject(
  cwd: string,
  hubPath?: string,
): Promise<ResolvedProject | null> {
  const hub = hubPath ?? DEFAULT_HUB_PATH;
  const registry = await readYaml<Registry>(join(hub, REGISTRY_FILE), validateRegistry);
  const realCwd = await canonicalize(cwd);

  // Collect all matches, then pick the longest (most specific) path
  const matches: { entry: typeof registry.projects[0]; realPath: string }[] = [];
  for (const entry of registry.projects) {
    const realEntry = await canonicalize(entry.path);
    if (realCwd === realEntry || realCwd.startsWith(realEntry + "/")) {
      matches.push({ entry, realPath: realEntry });
    }
  }
  if (!matches.length) return null;

  // Longest path = most specific match
  matches.sort((a, b) => b.realPath.length - a.realPath.length);
  const best = matches[0].entry;
  return {
    slug: best.slug,
    name: best.name,
    hubProjectPath: join(hub, PROJECTS_DIR, best.slug),
  };
}

/**
 * Resolve a project by slug directly.
 */
export async function resolveProjectBySlug(
  slug: string,
  hubPath?: string,
): Promise<ResolvedProject | null> {
  const hub = hubPath ?? DEFAULT_HUB_PATH;
  const registry = await readYaml<Registry>(join(hub, REGISTRY_FILE), validateRegistry);

  const entry = registry.projects.find((p) => p.slug === slug || p.name.toLowerCase() === slug.toLowerCase());
  if (!entry) return null;

  return {
    slug: entry.slug,
    name: entry.name,
    hubProjectPath: join(hub, PROJECTS_DIR, entry.slug),
  };
}
