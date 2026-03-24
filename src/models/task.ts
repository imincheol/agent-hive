import type { ValidationResult, ValidationError } from "../core/yaml-utils.js";
import { ok, fail, requireString, optionalString, requireArray } from "../core/yaml-utils.js";

export type TaskStatus = "backlog" | "ready" | "doing" | "review" | "done" | "blocked";
export type WorkflowMode = "conference" | "pipeline" | "kanban";
export type AgentRole = "planner" | "builder" | "reviewer" | "arbiter";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export const TASK_STATUSES: TaskStatus[] = ["backlog", "ready", "doing", "review", "done", "blocked"];
export const WORKFLOW_MODES: WorkflowMode[] = ["conference", "pipeline", "kanban"];
export const AGENT_ROLES: AgentRole[] = ["planner", "builder", "reviewer", "arbiter"];

/**
 * Valid state transitions for the task lifecycle.
 * backlog → ready → doing → review → done
 * Any active state can go to blocked, and blocked can return to ready.
 */
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ["ready", "doing", "blocked"],
  ready: ["doing", "blocked"],
  doing: ["review", "done", "blocked", "ready"],
  review: ["done", "doing", "blocked"],
  done: [],
  blocked: ["ready", "backlog"],
};

export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TaskScope {
  path: string;
  files: string[];
  not_touch: string[];
}

export interface TaskHandoff {
  next_role: AgentRole;
  next_agent: string | null;
}

export interface Task {
  id: string;
  title: string;
  category: string;
  tags: string[];
  workflow_mode: WorkflowMode;
  status: TaskStatus;
  priority: TaskPriority;
  owner: string | null;
  role: AgentRole | null;
  created_by: string;
  created_at: string;
  scope: TaskScope;
  acceptance: string[];
  branch: string | null;
  handoff: TaskHandoff;
}

export function validateTask(data: unknown): ValidationResult {
  if (!data || typeof data !== "object") {
    return fail([{ field: "root", message: "task must be an object" }]);
  }
  const obj = data as Record<string, unknown>;
  const errors: ValidationError[] = [];

  requireString(obj, "id", errors);
  requireString(obj, "title", errors);
  requireString(obj, "created_by", errors);
  requireString(obj, "created_at", errors);

  // status enum
  if (!TASK_STATUSES.includes(obj.status as TaskStatus)) {
    errors.push({ field: "status", message: `status must be one of: ${TASK_STATUSES.join(", ")}` });
  }

  // workflow_mode enum
  if (!WORKFLOW_MODES.includes(obj.workflow_mode as WorkflowMode)) {
    errors.push({ field: "workflow_mode", message: `workflow_mode must be one of: ${WORKFLOW_MODES.join(", ")}` });
  }

  // priority
  const priorities: TaskPriority[] = ["critical", "high", "medium", "low"];
  if (!priorities.includes(obj.priority as TaskPriority)) {
    errors.push({ field: "priority", message: `priority must be one of: ${priorities.join(", ")}` });
  }

  optionalString(obj, "owner", errors);
  optionalString(obj, "branch", errors);
  requireArray(obj, "acceptance", errors);

  // scope
  if (obj.scope && typeof obj.scope === "object") {
    const scope = obj.scope as Record<string, unknown>;
    requireString(scope, "path", errors);
    requireArray(scope, "files", errors);
  }

  // handoff
  if (obj.handoff && typeof obj.handoff === "object") {
    const handoff = obj.handoff as Record<string, unknown>;
    if (!AGENT_ROLES.includes(handoff.next_role as AgentRole)) {
      errors.push({ field: "handoff.next_role", message: `next_role must be one of: ${AGENT_ROLES.join(", ")}` });
    }
  }

  return errors.length ? fail(errors) : ok();
}
