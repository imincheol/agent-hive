import { Command } from "commander";
import { resolveProject, resolveProjectBySlug } from "../../core/project-resolver.js";
import { listTasks } from "../../core/task-manager.js";
import { requireHub } from "../utils.js";
import type { Task, TaskStatus } from "../../models/task.js";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "ready", label: "Ready" },
  { status: "doing", label: "Doing" },
  { status: "review", label: "Review" },
  { status: "done", label: "Done" },
];

const PRIORITY_BADGE: Record<string, string> = {
  critical: "!!",
  high: "! ",
  medium: "  ",
  low: "- ",
};

function renderBoard(tasks: Task[], projectName: string): void {
  console.log(`\n  ${projectName} — Kanban Board\n`);

  const blocked = tasks.filter((t) => t.status === "blocked");

  for (const col of COLUMNS) {
    const items = tasks.filter((t) => t.status === col.status);
    const count = items.length;
    console.log(`── ${col.label} (${count}) ${"─".repeat(Math.max(0, 40 - col.label.length))}`)
    if (items.length === 0) {
      console.log("   (empty)");
    } else {
      for (const t of items) {
        const pri = PRIORITY_BADGE[t.priority] ?? "  ";
        const owner = t.owner ? ` @${t.owner}` : "";
        console.log(`   ${pri}${t.id} ${t.title}${owner}`);
      }
    }
    console.log();
  }

  if (blocked.length > 0) {
    console.log(`── Blocked (${blocked.length}) ${"─".repeat(32)}`);
    for (const t of blocked) {
      const owner = t.owner ? ` @${t.owner}` : "";
      console.log(`   ✗ ${t.id} ${t.title}${owner}`);
    }
    console.log();
  }

  // Summary line
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const active = tasks.filter((t) => t.status === "doing").length;
  console.log(`  Total: ${total} | Active: ${active} | Done: ${done}/${total}`);
}

export const statusCommand = new Command("status")
  .description("Show kanban board for current or specified project")
  .argument("[project]", "Project name or slug (defaults to current directory)")
  .option("--hub-path <path>", "Custom hub path")
  .action(async (projectArg: string | undefined, options) => {
    requireHub(options.hubPath);
    let project;
    if (projectArg) {
      project = await resolveProjectBySlug(projectArg, options.hubPath);
      if (!project) {
        console.error(`✗ Project not found: ${projectArg}`);
        process.exit(1);
      }
    } else {
      project = await resolveProject(process.cwd(), options.hubPath);
      if (!project) {
        console.error("✗ Not inside a registered project. Use: agenthive project add <path>");
        process.exit(1);
      }
    }

    const tasks = await listTasks(project.hubProjectPath);
    renderBoard(tasks, project.name);
  });
