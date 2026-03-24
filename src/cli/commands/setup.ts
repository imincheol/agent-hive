import { Command } from "commander";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { resolveProject } from "../../core/project-resolver.js";
import { getHubConfig } from "../../core/hub.js";
import { requireHub } from "../utils.js";
import { readYaml } from "../../core/yaml-utils.js";
import { join, dirname } from "node:path";
import { generatePointerFiles, AGENT_TARGETS } from "../../generators/pointer.js";
import type { AgentTarget } from "../../generators/pointer.js";
import type { Project } from "../../models/project.js";
import { getAdapter, listAdapters } from "../../adapters/index.js";
import type { ARAdapter, ProjectContext } from "../../adapters/index.js";
import { harnessExists, resolveHarness } from "../../core/harness.js";
import type { ResolvedHarness } from "../../models/harness.js";

async function tryGenerateWithAdapter(
  adapter: ARAdapter,
  projectContext: ProjectContext,
  projectHubPath: string,
  hubPath: string,
): Promise<string | null> {
  if (!harnessExists(projectHubPath)) return null;
  const harness: ResolvedHarness = await resolveHarness(projectHubPath, hubPath);
  const result = adapter.generateInstructions(projectContext, harness);
  const outPath = join(result.path, result.filename);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, result.content, "utf-8");
  return outPath;
}

export const setupCommand = new Command("setup")
  .description("Generate agent pointer files in the project repo")
  .argument("<target>", `Agent target: ${AGENT_TARGETS.join(", ")}, or "all"`)
  .option("--hub-path <path>", "Custom hub path")
  .action(async (target: string, options) => {
    requireHub(options.hubPath);
    const validTargets = [...AGENT_TARGETS, "all"];
    if (!validTargets.includes(target)) {
      console.error(`✗ Unknown target: ${target}. Use: ${validTargets.join(", ")}`);
      process.exit(1);
    }

    const project = await resolveProject(process.cwd(), options.hubPath);
    if (!project) {
      console.error("✗ Not inside a registered project.");
      process.exit(1);
    }

    const config = await getHubConfig(options.hubPath);
    let description = "";
    try {
      const proj = await readYaml<Project>(join(project.hubProjectPath, "project.yaml"));
      description = proj.description || proj.name;
    } catch {
      description = project.name;
    }

    const repoPath = resolve(process.cwd());
    const hubProjectPath = `${config.hub_path}/projects/${project.slug}`;

    const written = await generatePointerFiles(
      {
        projectName: project.name,
        projectDescription: description,
        hubPath: config.hub_path,
        slug: project.slug,
        hubProjectPath,
        repoPath,
      },
      target as AgentTarget,
    );

    // Build adapter ProjectContext
    const projectContext: ProjectContext = {
      projectName: project.name,
      projectDescription: description,
      hubPath: config.hub_path,
      slug: project.slug,
      hubProjectPath,
      repoPath,
      hasCollab: false,
      hasHarness: harnessExists(project.hubProjectPath),
      hasSync: false,
    };

    // Try adapter-based harness-enriched generation (adapter file augments/replaces generator output)
    if (target === "all") {
      for (const adapter of listAdapters()) {
        try {
          const out = await tryGenerateWithAdapter(
            adapter,
            projectContext,
            project.hubProjectPath,
            config.hub_path,
          );
          if (out) written.push(out);
        } catch { /* harness missing or adapter error — skip silently */ }
      }
    } else {
      try {
        const adapter = getAdapter(target);
        const out = await tryGenerateWithAdapter(
          adapter,
          projectContext,
          project.hubProjectPath,
          config.hub_path,
        );
        if (out) written.push(out);
      } catch { /* no adapter for this target, or harness missing — that's fine */ }
    }

    console.log(`✓ Generated ${written.length} file(s) for "${target}":`);
    for (const f of written) {
      console.log(`  ${f}`);
    }
  });
