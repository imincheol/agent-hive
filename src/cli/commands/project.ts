import { Command } from "commander";
import { resolve } from "node:path";
import { addProject, listProjects } from "../../core/registry.js";
import { requireHub } from "../utils.js";

export const projectCommand = new Command("project")
  .description("Manage projects in the hub");

projectCommand
  .command("add <path>")
  .description("Register a project in the AgentHive hub")
  .option("-n, --name <name>", "Project display name")
  .option("--hub-path <path>", "Custom hub path")
  .action(async (path: string, options) => {
    requireHub(options.hubPath);
    const absPath = resolve(path);
    const result = await addProject(absPath, {
      hubPath: options.hubPath,
      name: options.name,
    });

    if (result.created) {
      console.log(`✓ ${result.message}`);
      console.log(`  Hub path: ${result.projectHubPath}`);
      console.log(`\nNext: agenthive task create`);
    } else {
      console.log(`ℹ ${result.message}`);
    }
  });

projectCommand
  .command("list")
  .description("List registered projects")
  .option("--hub-path <path>", "Custom hub path")
  .action(async (options) => {
    requireHub(options.hubPath);
    const projects = await listProjects(options.hubPath);
    if (projects.length === 0) {
      console.log("No projects registered. Use: agenthive project add <path>");
      return;
    }
    for (const p of projects) {
      const status = p.active ? "●" : "○";
      console.log(`${status} ${p.name} (${p.slug})`);
      console.log(`  ${p.path}`);
    }
  });
