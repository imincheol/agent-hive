import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { parse } from "yaml";
import { initHub } from "../hub.js";
import { addProject } from "../registry.js";
import { createTask, claimTask, completeTask, listTasks } from "../task-manager.js";

describe("task lifecycle", () => {
  let tempDir: string;
  let hubPath: string;
  let projectHubPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agenthive-task-"));
    hubPath = join(tempDir, ".agenthive");
    await initHub({ hubPath });
    const result = await addProject("/Users/test/projects/myapp", { hubPath });
    projectHubPath = result.projectHubPath;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("createTask", () => {
    it("creates task folder with all files", async () => {
      const result = await createTask(projectHubPath, { title: "Test task" });

      expect(result.id).toBe("TASK-001");
      expect(existsSync(join(result.taskDir, "task.yaml"))).toBe(true);
      expect(existsSync(join(result.taskDir, "plan.md"))).toBe(true);
      expect(existsSync(join(result.taskDir, "summary.md"))).toBe(true);
      expect(existsSync(join(result.taskDir, "messages"))).toBe(true);
      expect(existsSync(join(result.taskDir, "reviews"))).toBe(true);
      expect(existsSync(join(result.taskDir, "artifacts"))).toBe(true);
    });

    it("auto-increments task IDs", async () => {
      const t1 = await createTask(projectHubPath, { title: "First" });
      const t2 = await createTask(projectHubPath, { title: "Second" });
      const t3 = await createTask(projectHubPath, { title: "Third" });

      expect(t1.id).toBe("TASK-001");
      expect(t2.id).toBe("TASK-002");
      expect(t3.id).toBe("TASK-003");
    });

    it("writes correct task.yaml", async () => {
      const result = await createTask(projectHubPath, {
        title: "Implement feature",
        category: "feature",
        priority: "high",
        createdBy: "claude-code",
      });

      const raw = await readFile(join(result.taskDir, "task.yaml"), "utf-8");
      const task = parse(raw);
      expect(task.title).toBe("Implement feature");
      expect(task.category).toBe("feature");
      expect(task.priority).toBe("high");
      expect(task.status).toBe("backlog");
      expect(task.created_by).toBe("claude-code");
    });

    it("regenerates BACKLOG.md", async () => {
      await createTask(projectHubPath, { title: "My task" });
      const backlog = await readFile(join(projectHubPath, "tasks/BACKLOG.md"), "utf-8");
      expect(backlog).toContain("TASK-001");
      expect(backlog).toContain("My task");
    });
  });

  describe("claimTask", () => {
    it("claims a backlog task", async () => {
      await createTask(projectHubPath, { title: "Claimable task" });
      const result = await claimTask(projectHubPath, "TASK-001", "claude-code");

      expect(result.success).toBe(true);
      expect(result.message).toContain("claimed");
    });

    it("creates lock.yaml", async () => {
      const t = await createTask(projectHubPath, { title: "Lock test" });
      await claimTask(projectHubPath, "TASK-001", "codex", "builder");

      const raw = await readFile(join(t.taskDir, "lock.yaml"), "utf-8");
      const lock = parse(raw);
      expect(lock.agent).toBe("codex");
      expect(lock.role).toBe("builder");
    });

    it("updates task status to doing", async () => {
      const t = await createTask(projectHubPath, { title: "Status test" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");

      const raw = await readFile(join(t.taskDir, "task.yaml"), "utf-8");
      const task = parse(raw);
      expect(task.status).toBe("doing");
      expect(task.owner).toBe("claude-code");
    });

    it("rejects double claim", async () => {
      await createTask(projectHubPath, { title: "Double claim" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");
      const result = await claimTask(projectHubPath, "TASK-001", "codex");

      expect(result.success).toBe(false);
      expect(result.message).toContain("already claimed");
    });

    it("rejects claim on done task", async () => {
      await createTask(projectHubPath, { title: "Done task" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");
      await completeTask(projectHubPath, "TASK-001");
      const result = await claimTask(projectHubPath, "TASK-001", "codex");

      expect(result.success).toBe(false);
      expect(result.message).toContain("invalid transition");
    });

    it("does not match shortened task IDs against TASK-010", async () => {
      let tenthTaskDir = "";

      for (let index = 1; index <= 10; index += 1) {
        const created = await createTask(projectHubPath, { title: `Task ${index}` });
        if (created.id === "TASK-010") {
          tenthTaskDir = created.taskDir;
        }
      }

      await claimTask(projectHubPath, "TASK-010", "claude-code");
      const result = await claimTask(projectHubPath, "TASK-01", "codex");

      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");

      const raw = await readFile(join(tenthTaskDir, "task.yaml"), "utf-8");
      const task = parse(raw);
      expect(task.status).toBe("doing");
      expect(task.owner).toBe("claude-code");
    });

    it("warns on scope overlap", async () => {
      await createTask(projectHubPath, {
        title: "Task A",
        scopeFiles: ["src/models/**"],
      });
      await claimTask(projectHubPath, "TASK-001", "claude-code");

      await createTask(projectHubPath, {
        title: "Task B",
        scopeFiles: ["src/models/config.ts"],
      });
      const result = await claimTask(projectHubPath, "TASK-002", "codex");

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("completeTask", () => {
    it("marks task as done and removes lock", async () => {
      const t = await createTask(projectHubPath, { title: "Complete me" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");
      const result = await completeTask(projectHubPath, "TASK-001");

      expect(result.success).toBe(true);
      expect(existsSync(join(t.taskDir, "lock.yaml"))).toBe(false);

      const raw = await readFile(join(t.taskDir, "task.yaml"), "utf-8");
      const task = parse(raw);
      expect(task.status).toBe("done");
      expect(task.owner).toBeNull();
    });

    it("can set to review instead of done", async () => {
      const t = await createTask(projectHubPath, { title: "Review me" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");
      await completeTask(projectHubPath, "TASK-001", "review");

      const raw = await readFile(join(t.taskDir, "task.yaml"), "utf-8");
      const task = parse(raw);
      expect(task.status).toBe("review");
    });

    it("rejects invalid status", async () => {
      await createTask(projectHubPath, { title: "Invalid status" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");
      const result = await completeTask(projectHubPath, "TASK-001", "nonsense" as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid transition");
    });
  });

  describe("backlog project name", () => {
    it("preserves project name in BACKLOG.md header", async () => {
      await createTask(projectHubPath, { title: "Name test" });
      const backlog = await readFile(join(projectHubPath, "tasks/BACKLOG.md"), "utf-8");
      expect(backlog).toContain("# Task Index — myapp");
      expect(backlog).not.toContain("# Task Index — Project");
    });
  });

  describe("listTasks", () => {
    it("returns all tasks sorted by ID", async () => {
      await createTask(projectHubPath, { title: "Third", priority: "low" });
      await createTask(projectHubPath, { title: "First", priority: "high" });

      const tasks = await listTasks(projectHubPath);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe("TASK-001");
      expect(tasks[1].id).toBe("TASK-002");
    });
  });

  describe("state machine transitions", () => {
    it("allows backlog → doing (claim)", async () => {
      await createTask(projectHubPath, { title: "SM test" });
      const result = await claimTask(projectHubPath, "TASK-001", "claude-code");
      expect(result.success).toBe(true);
    });

    it("allows doing → review", async () => {
      await createTask(projectHubPath, { title: "SM review" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");
      const result = await completeTask(projectHubPath, "TASK-001", "review");
      expect(result.success).toBe(true);
    });

    it("allows doing → done", async () => {
      await createTask(projectHubPath, { title: "SM done" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");
      const result = await completeTask(projectHubPath, "TASK-001", "done");
      expect(result.success).toBe(true);
    });

    it("allows doing → blocked", async () => {
      await createTask(projectHubPath, { title: "SM blocked" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");
      const result = await completeTask(projectHubPath, "TASK-001", "blocked");
      expect(result.success).toBe(true);
    });

    it("rejects done → doing", async () => {
      await createTask(projectHubPath, { title: "SM no regress" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");
      await completeTask(projectHubPath, "TASK-001", "done");
      const result = await completeTask(projectHubPath, "TASK-001", "doing");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid transition");
    });

    it("rejects backlog → done directly", async () => {
      await createTask(projectHubPath, { title: "SM skip" });
      const result = await completeTask(projectHubPath, "TASK-001", "done");
      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid transition");
    });

    it("allows blocked → ready", async () => {
      await createTask(projectHubPath, { title: "SM unblock" });
      await claimTask(projectHubPath, "TASK-001", "claude-code");
      await completeTask(projectHubPath, "TASK-001", "blocked");
      const result = await completeTask(projectHubPath, "TASK-001", "ready");
      expect(result.success).toBe(true);
    });
  });

  describe("createTask options", () => {
    it("accepts tags, scopeFiles, and acceptance", async () => {
      const result = await createTask(projectHubPath, {
        title: "Options test",
        tags: ["feat", "urgent"],
        scopeFiles: ["src/index.ts"],
        acceptance: ["Tests pass", "Docs updated"],
      });

      const raw = await readFile(join(result.taskDir, "task.yaml"), "utf-8");
      const task = parse(raw);
      expect(task.tags).toEqual(["feat", "urgent"]);
      expect(task.scope.files).toEqual(["src/index.ts"]);
      expect(task.acceptance).toEqual(["Tests pass", "Docs updated"]);
    });
  });
});
