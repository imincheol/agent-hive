import { Command } from "commander";
import { resolveProject } from "../../core/project-resolver.js";
import { createTask, claimTask, completeTask, listTasks } from "../../core/task-manager.js";
import { requireHub } from "../utils.js";

export const taskCommand = new Command("task")
  .description("Manage tasks in the current project");

taskCommand
  .command("create <title>")
  .description("Create a new task")
  .option("-c, --category <cat>", "Task category", "general")
  .option("-p, --priority <pri>", "Priority (critical, high, medium, low)", "medium")
  .option("-t, --tags <tags>", "Comma-separated tags")
  .option("--scope-files <files>", "Comma-separated scope files")
  .option("--acceptance <items>", "Comma-separated acceptance criteria")
  .option("--by <agent>", "Created by", "human")
  .option("--hub-path <path>", "Custom hub path")
  .action(async (title: string, options) => {
    requireHub(options.hubPath);
    const project = await resolveProject(process.cwd(), options.hubPath);
    if (!project) {
      console.error("✗ Not inside a registered project. Use: agenthive project add <path>");
      process.exit(1);
    }

    const result = await createTask(project.hubProjectPath, {
      title,
      category: options.category,
      priority: options.priority,
      createdBy: options.by,
      tags: options.tags ? options.tags.split(",").map((s: string) => s.trim()) : undefined,
      scopeFiles: options.scopeFiles ? options.scopeFiles.split(",").map((s: string) => s.trim()) : undefined,
      acceptance: options.acceptance ? options.acceptance.split(",").map((s: string) => s.trim()) : undefined,
    });

    console.log(`✓ Created ${result.id}: ${title}`);
    console.log(`  ${result.taskDir}`);
  });

taskCommand
  .command("claim <id>")
  .description("Claim a task (create lock)")
  .option("-a, --agent <agent>", "Agent ID", "claude-code")
  .option("-r, --role <role>", "Role (builder, planner, reviewer)", "builder")
  .option("--hub-path <path>", "Custom hub path")
  .action(async (id: string, options) => {
    requireHub(options.hubPath);
    const project = await resolveProject(process.cwd(), options.hubPath);
    if (!project) {
      console.error("✗ Not inside a registered project.");
      process.exit(1);
    }

    const result = await claimTask(project.hubProjectPath, id.toUpperCase(), options.agent, options.role);

    if (result.success) {
      console.log(`✓ ${result.message}`);
      for (const w of result.warnings) {
        console.log(`⚠ ${w}`);
      }
    } else {
      console.error(`✗ ${result.message}`);
      process.exit(1);
    }
  });

taskCommand
  .command("complete <id>")
  .description("Mark a task as done")
  .option("-s, --status <status>", "Target status (done, review)", "done")
  .option("--hub-path <path>", "Custom hub path")
  .action(async (id: string, options) => {
    requireHub(options.hubPath);
    const project = await resolveProject(process.cwd(), options.hubPath);
    if (!project) {
      console.error("✗ Not inside a registered project.");
      process.exit(1);
    }

    const result = await completeTask(project.hubProjectPath, id.toUpperCase(), options.status);

    if (result.success) {
      console.log(`✓ ${result.message}`);
    } else {
      console.error(`✗ ${result.message}`);
      process.exit(1);
    }
  });

taskCommand
  .command("list")
  .description("List tasks in current project")
  .option("--hub-path <path>", "Custom hub path")
  .action(async (options) => {
    requireHub(options.hubPath);
    const project = await resolveProject(process.cwd(), options.hubPath);
    if (!project) {
      console.error("✗ Not inside a registered project.");
      process.exit(1);
    }

    const tasks = await listTasks(project.hubProjectPath);
    if (tasks.length === 0) {
      console.log("No tasks. Use: agenthive task create <title>");
      return;
    }

    const statusIcon: Record<string, string> = {
      backlog: "○",
      ready: "◎",
      doing: "●",
      review: "◇",
      done: "✓",
      blocked: "✗",
    };

    for (const t of tasks) {
      const icon = statusIcon[t.status] ?? "?";
      const owner = t.owner ? `@${t.owner}` : "";
      console.log(`${icon} ${t.id} [${t.status}] ${t.title} ${owner}`);
    }
  });
