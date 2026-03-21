# AgentHive

> File-based multi-agent collaboration protocol for AI coding agents

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org)

**[English](README.md)** | [한국어](docs/README.ko.md) | [日本語](docs/README.ja.md) | [中文](docs/README.zh.md)

AgentHive lets multiple AI agents — Claude Code, Codex, Cursor, Copilot, ChatGPT, and others — collaborate on shared projects using a simple file-based protocol. No database, no server required: just YAML, JSONL, and Markdown files that every AI tool can read and write.

---

## Why AgentHive?

Most AI tools work in isolation. When you switch between Claude Code, Cursor, and Copilot on the same project, each one starts from scratch, duplicates work, or overwrites what another agent did. AgentHive solves this with:

- **Shared task board** — Any agent can see what needs to be done, what is in progress, and what is blocked
- **Agent-to-agent communication** — Agents discuss approaches, request reviews, and record decisions through structured channels
- **Portable conventions** — Define coding standards once; inject them into every AI tool automatically
- **Atomic locking** — `O_CREAT|O_EXCL` + `rename()` prevents two agents from modifying the same files at the same time
- **No vendor lock-in** — Pure files; works with any tool that can read/write to disk

---

## Quick Start

### 1. Install

```bash
# Clone and build from source
git clone https://github.com/songblaq/agent-hive.git
cd agent-hive
pnpm install
pnpm build
pnpm link --global
```

After linking, the `agenthive` binary is available globally.

```bash
# Or run without installing
npx agenthive --help
```

### 2. Initialize the Hub

The hub lives at `~/.agenthive/` and stores all collaboration data across projects.

```bash
agenthive init
```

Expected output:

```
Initializing AgentHive hub at ~/.agenthive/
  created  ~/.agenthive/config.yaml
  created  ~/.agenthive/PROTOCOL.md
  created  ~/.agenthive/registry.yaml
  created  ~/.agenthive/agents/
Hub initialized. Run `agenthive project add <path>` to register a project.
```

### 3. Register Your Project

```bash
cd /path/to/your/project
agenthive project add .
```

Expected output:

```
Registering project: my-app
  slug: my-app
  path: /path/to/your/project
  created ~/.agenthive/projects/my-app/project.yaml
  created ~/.agenthive/projects/my-app/tasks/
  created ~/.agenthive/projects/my-app/collab/
Project registered. Run `agenthive status` to view the kanban board.
```

### 4. Create and Manage Tasks

```bash
# Create a task
agenthive task create "Implement user authentication" --priority high
```

```
Task created: TASK-001
  title:    Implement user authentication
  status:   backlog
  priority: high
  path:     ~/.agenthive/projects/my-app/tasks/TASK-001-implement-user-authentication/
```

```bash
# View the kanban board
agenthive status
```

```
my-app — Kanban Board
┌─────────────┬───────┬───────────┬──────────┬──────┐
│  BACKLOG    │ READY │   DOING   │  REVIEW  │ DONE │
├─────────────┼───────┼───────────┼──────────┼──────┤
│ TASK-001 ▲  │       │           │          │      │
│ user auth   │       │           │          │      │
└─────────────┴───────┴───────────┴──────────┴──────┘
1 task  |  0 in progress  |  0 blocked
```

```bash
# Claim a task (creates an atomic lock)
agenthive task claim TASK-001 --agent claude-code --role builder
```

```
Claimed TASK-001 by claude-code (builder)
  lock created: tasks/TASK-001-.../lock.yaml
  status: backlog → doing
  branch convention: agent/claude-code/TASK-001
```

```bash
# Mark complete (moves to review)
agenthive task complete TASK-001
```

```
TASK-001 marked complete by claude-code
  status: doing → review
  lock released
  Reminder: a reviewer other than claude-code must approve before done
```

```bash
# List all tasks with status
agenthive task list
```

```
TASK-001  [review]   Implement user authentication    claude-code  high
TASK-002  [backlog]  Add password reset flow          —            medium
```

### 5. Agent Communication (Collab)

```bash
# Initialize channels for this project
agenthive collab init

# Create a channel
agenthive collab channel architecture "Architecture decisions and proposals"

# Post a message
agenthive collab post general "Starting work on the auth module. Using JWT + refresh tokens." \
  --from claude-code --type proposal --refs TASK-001
```

```
Message posted to #general
  id:   msg-20260322-093011-claude-code
  type: proposal
  refs: [TASK-001]
```

```bash
# Read the latest messages
agenthive collab tail general --last 10
```

```
[2026-03-22T09:30:11Z] claude-code (proposal) [TASK-001]
  Starting work on the auth module. Using JWT + refresh tokens.

[2026-03-22T09:45:33Z] codex (review-response) [TASK-001]
  JWT approach looks good. Consider setting refresh token expiry to 7d.
```

### 6. Shared Conventions (Harness)

```bash
# Initialize harness (coding standards, prompts, knowledge)
agenthive harness init

# View the resolved conventions
agenthive harness show
```

```
Harness for my-app
  conventions: 2 files
  prompts:     1 file
  skills:      0 files
  knowledge:   1 file

Resolved from: global (~/.agenthive/harness/) + project (overrides)
```

```bash
# Generate runtime-specific instruction files
agenthive setup claude      # → CLAUDE.md
agenthive setup codex       # → AGENTS.md
agenthive setup cursor      # → .cursor/rules/agenthive.mdc
agenthive setup copilot     # → .github/copilot-instructions.md
agenthive setup all         # → all of the above
```

```
Generated CLAUDE.md (1.2 KB)
  injected: conventions/code-style.md
  injected: conventions/review-criteria.md
  injected: knowledge/domain-glossary.md
```

### 7. GitHub Sync

```bash
# Initialize (auto-detects GitHub remote from git config)
agenthive sync init

# Import open issues as task cards
agenthive sync import

# Check sync status
agenthive sync status
```

```
GitHub Sync — my-app
  remote:  github.com/you/my-app
  issues:  12 open  →  8 imported, 4 skipped (no hive label)
  PRs:     3 open   →  2 linked to tasks
  labels:  hive:backlog, hive:doing, hive:review synced
```

### 8. Web Dashboard

```bash
agenthive web
```

```
AgentHive Dashboard starting...
  http://localhost:4173
  8 tabs: Kanban | Agents | Log | Decisions | Threads | Collab | Harness | Sync
```

---

## Architecture — 5 Pillars

```
┌───────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐
│   HIVE    │  │  COLLAB   │  │  HARNESS   │  │  GITHUB  │  │    AR      │
│           │  │           │  │            │  │   SYNC   │  │  ADAPTERS  │
│ Tasks     │  │ Channels  │  │ Conventions│  │          │  │            │
│ Kanban    │  │ Threads   │  │ Prompts    │  │ Issues   │  │ CLAUDE.md  │
│ Reviews   │  │ Messages  │  │ Skills     │  │ PRs      │  │ AGENTS.md  │
│ Locks     │  │ Standups  │  │ Knowledge  │  │ Labels   │  │ .cursor/   │
└───────────┘  └───────────┘  └────────────┘  └──────────┘  └────────────┘
```

### Pillar 1 — Hive: Task Management

Kanban-style task lifecycle with atomic file-based locking.

```
backlog → ready → doing → review → done
                    ↓
                  blocked
```

- **4 roles**: Planner, Builder, Reviewer, Arbiter
- **Atomic locks**: `O_CREAT|O_EXCL` + `rename()` CAS — no race conditions, no database
- **Scope conflict detection**: prevents two agents from touching the same files
- **Auto-generated `BACKLOG.md`**: always up-to-date human-readable task index

A task folder contains:

```
TASK-001-implement-user-authentication/
├── task.yaml       # metadata: id, title, status, owner, priority, scope
├── plan.md         # must be approved before implementation starts
├── lock.yaml       # present only while a builder holds the task
├── summary.md      # builder's implementation notes
└── messages/
    ├── 001-progress.md
    ├── 002-handoff.md
    └── 003-review-response.md
```

### Pillar 2 — Collab: Agent Communication

JSONL append-only messaging. Think Slack, but for AI agents writing to shared files.

```jsonl
{"id":"msg-20260322-143022-claude","from":"claude-code","type":"proposal","content":"I suggest using a factory pattern here","refs":["TASK-003"],"tags":["architecture"]}
{"id":"msg-20260322-144500-codex","from":"codex","type":"review-response","content":"Factory pattern approved. See comment on scope boundary.","refs":["TASK-003"]}
```

- **Channels**: project-level discussion (`#general`, `#architecture`, `#standup`)
- **Task threads**: conversation scoped to a specific task (`thread.jsonl`)
- **10 message types**: `message`, `proposal`, `question`, `answer`, `review-request`, `review-response`, `decision`, `standup`, `reaction`, `summary`
- **Standalone mode**: use Collab without Hive tasks (`agenthive init --collab-only`)

### Pillar 3 — Harness: Shared Conventions

`.editorconfig` for AI agents. Define rules once; share across all tools.

```
harness/
├── harness.yaml          # manifest: which files are active
├── conventions/          # coding standards, naming rules, review criteria
├── prompts/              # reusable prompt templates
├── skills/               # shared procedures (e.g., "how to add an endpoint")
└── knowledge/            # domain glossary, architecture decisions
```

**Layered merge**: Global (`~/.agenthive/harness/`) provides defaults; project-level files override them.

### Pillar 4 — GitHub Sync

Bidirectional synchronization between GitHub Issues/PRs and AgentHive tasks.

- Import issues as task cards (filtered by labels like `hive:backlog`)
- Status sync: `doing` → `hive:doing` label; `done` → close issue
- PR mapping: link PRs to tasks via branch naming convention (`agent/{agent}/{task-id}`)
- Auth via `gh` CLI — no tokens stored in AgentHive

### Pillar 5 — AR Adapters: Agent-Runtime

Generate runtime-specific instruction files from your Harness so every tool gets the same context:

| Runtime | Generated File |
|---------|----------------|
| Claude Code | `CLAUDE.md` |
| Codex / OpenAI | `AGENTS.md` |
| Cursor | `.cursor/rules/agenthive.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Generic | `AGENTHIVE.md` |

---

## Task Lifecycle (Step by Step)

This is the full flow from idea to merged code when multiple agents collaborate:

```
1. Planner creates task folder + task.yaml + plan.md
2. Plan is reviewed for scope conflicts (no overlapping file sets)
3. Builder claims task → lock.yaml created atomically
4. Builder creates branch: agent/{agent-id}/{task-id}
5. Builder implements, posts progress messages to thread
6. Builder writes summary.md, posts handoff message
7. Reviewer reads summary + diff, posts review-response
   (max 2 review rounds; Arbiter decides if still unresolved)
8. If approved → Arbiter merges branch
9. Lock released, status → done, issue closed (if synced)
```

---

## Hub Structure

All collaboration data lives in `~/.agenthive/` (your private hub, not committed to the repo):

```
~/.agenthive/
├── config.yaml                    # global settings
├── PROTOCOL.md                    # agent entry point (AI agents read this first)
├── registry.yaml                  # all registered projects
├── agents/                        # agent profiles (capabilities, roles, preferences)
│   ├── claude-code.yaml
│   └── codex.yaml
└── projects/{slug}/
    ├── project.yaml               # project metadata + settings
    ├── tasks/                     # task cards
    │   ├── BACKLOG.md             # auto-generated index
    │   └── TASK-001-{title}/      # one folder per task
    ├── collab/                    # communication channels
    │   ├── general.jsonl
    │   └── architecture.jsonl
    ├── harness/                   # project-level conventions
    ├── sync/                      # GitHub mappings
    ├── context/                   # shared knowledge files
    ├── decisions/                 # architecture decision records
    └── log/                       # activity log
```

The project repository itself only needs the generated adapter files (`CLAUDE.md`, `AGENTS.md`, etc.) if you want them committed. Everything else stays in the hub.

---

## Protocol Rules

These rules are enforced by the protocol (and checked by the CLI):

1. **One Task, One Owner, One Scope** — A task has exactly one builder at a time. Scopes must not overlap without acknowledgment.
2. **Plan Before Build** — Every task requires an approved `plan.md` before implementation starts.
3. **Review After Build** — Every build requires review by a different agent than the builder.
4. **Append-Only** — Messages, reviews, and logs are never edited; only new entries are appended.
5. **Consensus by Math** — When agents disagree, use weighted scoring (1–10 per criterion) to reach a decision.
6. **No Direct Main** — Never commit directly to `main` or `develop`.

---

## Agent Profiles

Agent profiles describe capabilities and preferences so the CLI can route tasks appropriately:

```yaml
# ~/.agenthive/agents/claude-code.yaml
id: claude-code
display: "Claude Code"
roles: [planner, builder, reviewer]
strengths: [architecture, refactoring, documentation]
model: claude-sonnet-4-6
```

Supported agent IDs (kebab-case convention): `claude-code`, `codex`, `cursor`, `copilot`, `chatgpt`, `gemini`, `opencode`, or any custom identifier.

---

## CLI Reference

### Core

| Command | Description |
|---------|-------------|
| `agenthive init` | Initialize hub (`--collab-only` for minimal setup) |
| `agenthive status` | Kanban board in terminal |
| `agenthive web` | Start web dashboard at http://localhost:4173 |

### Projects

| Command | Description |
|---------|-------------|
| `agenthive project add <path>` | Register a project |
| `agenthive project list` | List registered projects |
| `agenthive project remove <slug>` | Unregister a project |

### Tasks (Hive)

| Command | Description |
|---------|-------------|
| `agenthive task create <title>` | Create a task (`--priority high/medium/low`) |
| `agenthive task list` | List tasks (`--status`, `--agent`, `--priority`) |
| `agenthive task show <id>` | Show full task details |
| `agenthive task claim <id>` | Claim a task (`--agent <id>`, `--role builder`) |
| `agenthive task complete <id>` | Move task to review |
| `agenthive task approve <id>` | Approve reviewed task → done |
| `agenthive task block <id>` | Mark task as blocked (`--reason`) |
| `agenthive task unblock <id>` | Unblock a task |

### Communication (Collab)

| Command | Description |
|---------|-------------|
| `agenthive collab init` | Initialize channels for current project |
| `agenthive collab channels` | List channels with message counts |
| `agenthive collab channel <id> <desc>` | Create a channel |
| `agenthive collab post <channel> <msg>` | Post a message (`--from`, `--type`, `--refs`) |
| `agenthive collab tail <channel>` | Read recent messages (`--last N`) |

### Conventions (Harness)

| Command | Description |
|---------|-------------|
| `agenthive harness init` | Initialize harness for current project |
| `agenthive harness show` | Show resolved conventions |
| `agenthive harness export` | Export harness as tarball |

### Adapter Files

| Command | Description |
|---------|-------------|
| `agenthive setup claude` | Generate `CLAUDE.md` |
| `agenthive setup codex` | Generate `AGENTS.md` |
| `agenthive setup cursor` | Generate `.cursor/rules/agenthive.mdc` |
| `agenthive setup copilot` | Generate `.github/copilot-instructions.md` |
| `agenthive setup all` | Generate all adapter files |

### GitHub Sync

| Command | Description |
|---------|-------------|
| `agenthive sync init` | Initialize GitHub sync (auto-detects remote) |
| `agenthive sync import` | Import issues as task cards |
| `agenthive sync push` | Push task status changes to GitHub |
| `agenthive sync status` | Show mapping and sync status |

---

## Adoption Paths

You do not need to use every feature. Pick what fits your workflow:

| Path | How to Start | What You Get |
|------|-------------|--------------|
| **Collab only** | `agenthive init --collab-only` | Agent messaging, no task tracking |
| **Harness only** | `agenthive harness init` | Shared conventions injected into all AI tools |
| **Standard** | `agenthive init` | Tasks + Collab + Harness |
| **Full** | `agenthive init` + `sync init` + `setup all` | Everything + GitHub sync + adapter files |

---

## Design Principles

1. **File-based, zero infrastructure** — YAML + JSONL + Markdown. No database, no server, no Docker.
2. **Runtime-agnostic** — Works with any AI tool that can read files. No SDK required.
3. **One Task, One Owner, One Scope** — Atomic locking prevents conflicts at the file level.
4. **Plan Before Build, Review After Build** — Every task needs a plan. Every implementation needs a review.
5. **Append-Only Communication** — Messages and reviews are never edited, only appended. Full audit trail.
6. **Consensus by Math** — Disagreements resolved by weighted scoring, not by whoever spoke last.

---

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | TypeScript (ESM, strict) |
| Runtime | Node.js 20+ |
| CLI framework | Commander.js |
| Data formats | YAML + JSONL + Markdown |
| Build | tsup |
| Tests | Vitest |
| Dependencies | 2 runtime (`commander`, `yaml`) |

---

## Contributing

```bash
git clone https://github.com/songblaq/agent-hive.git
cd agent-hive
pnpm install

pnpm dev          # watch mode (rebuilds on file change)
pnpm test         # run tests in watch mode
pnpm test:run     # run tests once
pnpm build        # production build to dist/
pnpm lint         # TypeScript type check (no emit)
```

Pull requests are welcome. Please open an issue first for significant changes.

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
