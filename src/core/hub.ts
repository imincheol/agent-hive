import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "yaml";
import { DEFAULT_HUB_PATH, CONFIG_FILE, REGISTRY_FILE, PROTOCOL_FILE, AGENTS_DIR } from "./constants.js";
import type { HubConfig } from "../models/config.js";
import { DEFAULT_CONFIG, validateConfig } from "../models/config.js";
import { DEFAULT_REGISTRY } from "../models/registry.js";
import { readYaml } from "./yaml-utils.js";

export interface InitOptions {
  hubPath?: string;
  displayLanguage?: string;
  collabOnly?: boolean;
}

export interface InitResult {
  hubPath: string;
  created: boolean;
  message: string;
}

const PROTOCOL_CONTENT = `# AgentHive — Agent Collaboration Protocol

> Version: 1.0 (MVP)
> Internal language: English
> Hub path: ~/.agenthive/

## Purpose

This protocol defines how multiple AI agents (Claude Code, Codex, Cursor, Copilot, ChatGPT) collaborate on shared codebases using file-based communication.

## Quick Start

1. Read this file
2. Check \`registry.yaml\` to find your assigned project
3. Navigate to your project: \`projects/{slug}/\`
4. Read \`project.yaml\` for project configuration
5. Read \`context/\` for shared knowledge
6. Check \`tasks/BACKLOG.md\` for available tasks

## Core Principles

1. **One Task, One Owner, One Scope** — A task has exactly one owner at a time.
2. **Plan Before Modify** — Every task requires an approved plan.md before implementation.
3. **Review After Modify** — Every implementation requires review by a different agent.
4. **Append-Only** — Messages, reviews, and logs are append-only.
5. **Consensus by Math** — When agents disagree, use weighted scoring (1-10 per criterion).

## Roles

| Role | Responsibility |
|------|---------------|
| **Planner** | Decompose requirements, create tasks |
| **Builder** | Implement code, write tests |
| **Reviewer** | Review diffs, verify tests |
| **Arbiter** | Final decisions, merge approval |

## Task Lifecycle

backlog → ready → doing → review → done (also: blocked)

## Full Specification

See the project repo specs/ directory for detailed protocol documentation.
`;

export async function initHub(options: InitOptions = {}): Promise<InitResult> {
  const hubPath = options.hubPath ?? DEFAULT_HUB_PATH;
  const existing = existsSync(join(hubPath, CONFIG_FILE));

  if (existing) {
    // Idempotent — verify existing hub is valid
    try {
      const config = await readYaml<HubConfig>(join(hubPath, CONFIG_FILE), validateConfig);
      return {
        hubPath,
        created: false,
        message: `Hub already exists at ${hubPath} (v${config.version})`,
      };
    } catch {
      // Config exists but is invalid — continue to repair
    }
  }

  // Create directory structure
  await mkdir(hubPath, { recursive: true });
  if (!options.collabOnly) {
    await mkdir(join(hubPath, AGENTS_DIR), { recursive: true });
  }
  await mkdir(join(hubPath, "projects"), { recursive: true });

  // Write config.yaml (only if missing)
  const configPath = join(hubPath, CONFIG_FILE);
  if (!existsSync(configPath)) {
    const config: HubConfig = {
      ...DEFAULT_CONFIG,
      display_language: options.displayLanguage ?? "en",
      hub_path: hubPath === DEFAULT_HUB_PATH ? "~/.agenthive" : hubPath,
    };
    await writeFile(configPath, stringify(config, { lineWidth: 0 }), "utf-8");
  }

  // Write registry.yaml (only if missing)
  const registryPath = join(hubPath, REGISTRY_FILE);
  if (!existsSync(registryPath)) {
    await writeFile(registryPath, stringify(DEFAULT_REGISTRY, { lineWidth: 0 }), "utf-8");
  }

  // Write PROTOCOL.md (only if missing)
  const protocolPath = join(hubPath, PROTOCOL_FILE);
  if (!existsSync(protocolPath)) {
    await writeFile(protocolPath, PROTOCOL_CONTENT, "utf-8");
  }

  return {
    hubPath,
    created: true,
    message: `Hub initialized at ${hubPath}`,
  };
}

export function hubExists(hubPath?: string): boolean {
  const path = hubPath ?? DEFAULT_HUB_PATH;
  return existsSync(join(path, CONFIG_FILE));
}

export async function getHubConfig(hubPath?: string): Promise<HubConfig> {
  const path = hubPath ?? DEFAULT_HUB_PATH;
  return readYaml<HubConfig>(join(path, CONFIG_FILE), validateConfig);
}
