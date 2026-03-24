import { join } from "node:path";
import { DEFAULT_HUB_PATH, PROJECTS_DIR } from "../core/constants.js";
import { hubExists } from "../core/hub.js";
import { listProjects } from "../core/registry.js";

/**
 * Guard: ensure the hub is initialized before running a command.
 * Prints a friendly message and exits if the hub is missing.
 */
export function requireHub(hubPath?: string): void {
  if (!hubExists(hubPath)) {
    console.error("✗ Hub not found. Run: agenthive init");
    process.exit(1);
  }
}

export async function resolveProjectPath(
  slug?: string,
  hubPath?: string,
): Promise<{ projectHubPath: string; slug: string }> {
  const hub = hubPath ?? DEFAULT_HUB_PATH;
  requireHub(hub);
  if (slug) {
    return { projectHubPath: join(hub, PROJECTS_DIR, slug), slug };
  }
  const projects = await listProjects(hub);
  if (!projects.length) throw new Error("No projects registered. Use: agenthive project add <path>");
  return { projectHubPath: join(hub, PROJECTS_DIR, projects[0].slug), slug: projects[0].slug };
}
