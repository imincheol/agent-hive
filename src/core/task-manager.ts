import { existsSync } from "node:fs";
import { mkdir, writeFile, readdir, rm, open, rename, readFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "yaml";
import { TASKS_DIR, TASK_YAML, LOCK_YAML, PLAN_MD, SUMMARY_MD } from "./constants.js";
import { readYaml, writeYaml } from "./yaml-utils.js";
import { regenerateBacklog } from "./backlog.js";
import type { Task, TaskStatus } from "../models/task.js";
import { validateTask, isValidTransition } from "../models/task.js";
import type { Lock } from "../models/lock.js";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export interface CreateTaskOptions {
  title: string;
  category?: string;
  priority?: string;
  workflowMode?: string;
  createdBy?: string;
  scopePath?: string;
  scopeFiles?: string[];
  tags?: string[];
  acceptance?: string[];
}

export interface CreateTaskResult {
  id: string;
  folderName: string;
  taskDir: string;
}

/**
 * Get next TASK-NNN ID by scanning existing task folders.
 */
async function nextTaskId(tasksDir: string): Promise<string> {
  let max = 0;
  if (existsSync(tasksDir)) {
    const items = await readdir(tasksDir, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) continue;
      const match = item.name.match(/^TASK-(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
  }
  return `TASK-${String(max + 1).padStart(3, "0")}`;
}

export async function createTask(
  hubProjectPath: string,
  options: CreateTaskOptions,
): Promise<CreateTaskResult> {
  const tasksDir = join(hubProjectPath, TASKS_DIR);
  const id = await nextTaskId(tasksDir);
  const slug = slugify(options.title);
  const folderName = `${id}-${slug}`;
  const taskDir = join(tasksDir, folderName);

  await mkdir(taskDir, { recursive: true });
  await mkdir(join(taskDir, "messages"), { recursive: true });
  await mkdir(join(taskDir, "reviews"), { recursive: true });
  await mkdir(join(taskDir, "artifacts"), { recursive: true });

  const task: Task = {
    id,
    title: options.title,
    category: options.category ?? "general",
    tags: options.tags ?? [],
    workflow_mode: (options.workflowMode as Task["workflow_mode"]) ?? "pipeline",
    status: "backlog",
    priority: (options.priority as Task["priority"]) ?? "medium",
    owner: null,
    role: null,
    created_by: options.createdBy ?? "human",
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    scope: {
      path: options.scopePath ?? "/",
      files: options.scopeFiles ?? [],
      not_touch: [],
    },
    acceptance: options.acceptance ?? [],
    branch: null,
    handoff: { next_role: "reviewer", next_agent: null },
  };

  await writeYaml(join(taskDir, TASK_YAML), task, validateTask);

  await writeFile(
    join(taskDir, PLAN_MD),
    `---\ntask: ${id}\nplanner: null\nreviewed_by: []\napproved: false\n---\n\n# Execution Plan: ${options.title}\n\n## TODO\n`,
    "utf-8",
  );

  await writeFile(
    join(taskDir, SUMMARY_MD),
    `# ${id}: ${options.title}\n\n**Status**: backlog\n**Owner**: unassigned\n**Updated**: ${task.created_at}\n`,
    "utf-8",
  );

  await regenerateBacklog(hubProjectPath);

  return { id, folderName, taskDir };
}

export async function claimTask(
  hubProjectPath: string,
  taskId: string,
  agent: string,
  role: string = "builder",
): Promise<{ success: boolean; message: string; warnings: string[] }> {
  const tasksDir = join(hubProjectPath, TASKS_DIR);
  const warnings: string[] = [];

  // Find task folder
  const taskDir = await findTaskDir(tasksDir, taskId);
  if (!taskDir) {
    return { success: false, message: `Task ${taskId} not found`, warnings };
  }

  // Read task
  const task = await readYaml<Task>(join(taskDir, TASK_YAML), validateTask);

  // Check if already locked — use atomic creation
  const lockPath = join(taskDir, LOCK_YAML);

  // Fast-path: if lock file already exists, report who holds it
  if (existsSync(lockPath)) {
    try {
      const existingLock = await readYaml<Lock>(lockPath);
      if (!existingLock.lease_until || new Date(existingLock.lease_until) >= new Date()) {
        return {
          success: false,
          message: `Task ${taskId} already claimed by ${existingLock.agent}`,
          warnings,
        };
      }
      // Lease expired — fall through; atomic creation will handle removal
    } catch {
      // Lock file unreadable — fall through to atomic creation
    }
  }

  // Check status — only valid transitions to 'doing' are allowed
  if (!isValidTransition(task.status, "doing")) {
    return {
      success: false,
      message: `Task ${taskId}: invalid transition '${task.status}' → 'doing'`,
      warnings,
    };
  }

  // Scope overlap check (same as before)
  if (task.scope?.files?.length) {
    const otherTasks = await getActiveTasks(tasksDir, taskId);
    for (const other of otherTasks) {
      const overlap = findScopeOverlap(task.scope.files, other.scope?.files ?? []);
      if (overlap.length > 0) {
        warnings.push(`Scope overlap with ${other.id}: ${overlap.join(", ")}`);
      }
    }
  }

  // Create lock atomically (O_CREAT | O_EXCL) — fails if file exists
  const now = new Date();
  const lease = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6h lease
  const lock: Lock = {
    task: taskId,
    agent,
    role: role as Lock["role"],
    claimed_at: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    lease_until: lease.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };

  try {
    const fd = await open(lockPath, "wx"); // O_WRONLY | O_CREAT | O_EXCL — atomic
    await fd.writeFile(stringify(lock, { lineWidth: 0 }), "utf-8");
    await fd.close();
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "EEXIST") {
      // Lock file was created by another agent between our check and write
      // Try to read it to report who claimed it
      try {
        const existingLock = await readYaml<Lock>(lockPath);
        // Check if lease has expired
        if (existingLock.lease_until && new Date(existingLock.lease_until) < new Date()) {
          // Lease expired — use atomic rename to replace the stale lock
          const tempPath = `${lockPath}.${agent}.tmp`;
          await writeFile(tempPath, stringify(lock, { lineWidth: 0 }), "utf-8");
          await rename(tempPath, lockPath); // atomic on POSIX
          // Compare-and-swap: verify OUR lock content is present
          let wonRace = false;
          try {
            const written = await readFile(lockPath, "utf-8");
            const verified = written.includes(`agent: ${agent}`);
            wonRace = verified;
          } catch {
            // Lock file vanished — we lost
          }
          if (!wonRace) {
            // Another agent's rename won; clean up temp file if it still exists
            try { await rm(tempPath, { force: true }); } catch { /* ignore */ }
            return {
              success: false,
              message: `Task ${taskId} already claimed (lost expired lock race)`,
              warnings,
            };
          }
          // Fall through to update task status below
        } else {
          return {
            success: false,
            message: `Task ${taskId} already claimed by ${existingLock.agent}`,
            warnings,
          };
        }
      } catch {
        return {
          success: false,
          message: `Task ${taskId} already claimed`,
          warnings,
        };
      }
    } else {
      throw err;
    }
  }

  // Update task status
  task.status = "doing";
  task.owner = agent;
  task.role = role as Task["role"];
  await writeYaml(join(taskDir, TASK_YAML), task, validateTask);

  await regenerateBacklog(hubProjectPath);

  return {
    success: true,
    message: `Task ${taskId} claimed by ${agent} (${role})`,
    warnings,
  };
}

export async function completeTask(
  hubProjectPath: string,
  taskId: string,
  targetStatus: TaskStatus = "done",
): Promise<{ success: boolean; message: string }> {
  const tasksDir = join(hubProjectPath, TASKS_DIR);
  const taskDir = await findTaskDir(tasksDir, taskId);
  if (!taskDir) {
    return { success: false, message: `Task ${taskId} not found` };
  }

  const task = await readYaml<Task>(join(taskDir, TASK_YAML), validateTask);

  // Enforce state machine transitions
  if (!isValidTransition(task.status, targetStatus)) {
    return {
      success: false,
      message: `Invalid transition: '${task.status}' → '${targetStatus}'`,
    };
  }

  task.status = targetStatus;
  // Clear owner/role on terminal states
  if (targetStatus === "done" || targetStatus === "blocked" || targetStatus === "ready") {
    task.owner = null;
    task.role = null;
  }
  await writeYaml(join(taskDir, TASK_YAML), task, validateTask);

  // Remove lock when leaving 'doing' state
  const lockPath = join(taskDir, LOCK_YAML);
  if (existsSync(lockPath) && (targetStatus === "done" || targetStatus === "blocked" || targetStatus === "ready")) {
    await rm(lockPath);
  }

  await regenerateBacklog(hubProjectPath);

  return { success: true, message: `Task ${taskId} → ${targetStatus}` };
}

export async function listTasks(
  hubProjectPath: string,
): Promise<Task[]> {
  const tasksDir = join(hubProjectPath, TASKS_DIR);
  const tasks: Task[] = [];

  if (!existsSync(tasksDir)) return tasks;

  const items = await readdir(tasksDir, { withFileTypes: true });
  for (const item of items) {
    if (!item.isDirectory() || !item.name.startsWith("TASK-")) continue;
    try {
      const task = await readYaml<Task>(join(tasksDir, item.name, TASK_YAML), validateTask);
      tasks.push(task);
    } catch {
      // Skip invalid
    }
  }

  tasks.sort((a, b) => {
    const na = parseInt(a.id.replace("TASK-", ""), 10);
    const nb = parseInt(b.id.replace("TASK-", ""), 10);
    return na - nb;
  });

  return tasks;
}

async function findTaskDir(tasksDir: string, taskId: string): Promise<string | null> {
  if (!existsSync(tasksDir)) return null;
  const items = await readdir(tasksDir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory() && matchesTaskDirName(item.name, taskId)) {
      return join(tasksDir, item.name);
    }
  }
  return null;
}

async function getActiveTasks(tasksDir: string, excludeId: string): Promise<Task[]> {
  const tasks: Task[] = [];
  const items = await readdir(tasksDir, { withFileTypes: true });
  for (const item of items) {
    if (!item.isDirectory() || !item.name.startsWith("TASK-")) continue;
    if (matchesTaskDirName(item.name, excludeId)) continue;
    const lockPath = join(tasksDir, item.name, LOCK_YAML);
    if (existsSync(lockPath)) {
      try {
        const task = await readYaml<Task>(join(tasksDir, item.name, TASK_YAML), validateTask);
        tasks.push(task);
      } catch {
        // Skip
      }
    }
  }
  return tasks;
}

function matchesTaskDirName(dirName: string, taskId: string): boolean {
  return dirName === taskId || dirName.startsWith(`${taskId}-`);
}

function findScopeOverlap(filesA: string[], filesB: string[]): string[] {
  const overlap: string[] = [];
  for (const a of filesA) {
    for (const b of filesB) {
      // Simple prefix matching for glob-like patterns
      const baseA = a.replace(/\*\*?.*$/, "");
      const baseB = b.replace(/\*\*?.*$/, "");
      if (baseA && baseB && (baseA.startsWith(baseB) || baseB.startsWith(baseA))) {
        overlap.push(`${a} ↔ ${b}`);
      }
    }
  }
  return overlap;
}
