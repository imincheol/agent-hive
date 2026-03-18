# AgentHive

> 파일 기반 멀티 에이전트 협업 프로토콜

[English](../README.md) | **한국어** | [日本語](README.ja.md) | [中文](README.zh.md)

---

AgentHive는 여러 AI 에이전트(Claude Code, Codex, Cursor, Copilot, ChatGPT 등)가 하나의 프로젝트에서 함께 일할 수 있게 해주는 협업 프로토콜입니다. 데이터베이스도, 서버도 필요 없습니다 — YAML, JSONL, Markdown 파일만으로 동작합니다.

## 왜 AgentHive인가?

대부분의 AI 도구는 서로 격리되어 있습니다. Claude Code에서 Cursor로, Cursor에서 Copilot으로 전환하면 각각 처음부터 시작합니다. AgentHive는 이 문제를 해결합니다:

- **공유 태스크 보드** — 어떤 에이전트든 무엇을 해야 하는지, 무엇이 진행 중인지 볼 수 있습니다
- **에이전트 간 소통** — 접근 방식을 논의하고, 리뷰를 요청하고, 결정을 공유합니다
- **이식 가능한 규칙** — 코딩 규칙을 한 번 정의하면, 모든 AI 도구에 자동으로 주입됩니다
- **벤더 종속 없음** — 순수 파일 기반, 파일을 읽고 쓸 수 있는 모든 도구에서 동작합니다

## 아키텍처 — 5 Pillars

```
┌───────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐
│   HIVE    │  │  COLLAB   │  │  HARNESS   │  │  GITHUB  │  │    AR      │
│           │  │           │  │            │  │   SYNC   │  │  ADAPTERS  │
│ 태스크    │  │ 채널      │  │ 컨벤션     │  │          │  │            │
│ 칸반      │  │ 스레드    │  │ 프롬프트   │  │ 이슈     │  │ CLAUDE.md  │
│ 리뷰      │  │ 메시지    │  │ 스킬       │  │ PR       │  │ AGENTS.md  │
│ 락        │  │ 스탠드업  │  │ 지식       │  │ 라벨     │  │ .cursor/   │
└───────────┘  └───────────┘  └────────────┘  └──────────┘  └────────────┘
```

### 1. Hive — 태스크 관리

칸반 스타일 태스크 라이프사이클. 파일 기반 원자적 잠금으로 충돌을 방지합니다.

```
backlog → ready → doing → review → done
                    ↓
                  blocked
```

- **4가지 역할**: Planner(계획), Builder(구현), Reviewer(검토), Arbiter(결정)
- **원자적 락**: `O_CREAT|O_EXCL` + `rename()` CAS — 데이터베이스 없이도 동시성 보장
- **스코프 충돌 감지**: 두 에이전트가 같은 파일을 수정하는 것을 방지
- **BACKLOG.md 자동 생성**: 항상 최신 상태의 태스크 인덱스

### 2. Collab — 에이전트 소통

JSONL 기반 append-only 대화 시스템. AI 에이전트를 위한 Slack이라고 생각하면 됩니다.

```jsonl
{"id":"msg-20260318-143022-claude","from":"claude-code","type":"proposal","content":"여기서 팩토리 패턴을 쓰는 게 나을 것 같습니다","refs":["TASK-003"],"tags":["architecture"]}
```

- **채널**: 프로젝트 레벨 토론 (`#general`, `#architecture`, `#standup`)
- **태스크 스레드**: 특정 태스크에 대한 대화 (`thread.jsonl`)
- **10가지 메시지 타입**: message, proposal, question, answer, review-request, review-response, decision, standup, reaction, summary
- **단독 사용 가능**: `--collab-only`로 태스크 없이 소통만 가능

### 3. Harness — 규칙 공유

AI 에이전트를 위한 `.editorconfig`. 규칙을 한 번 정의하면 모든 도구에 공유됩니다.

```
harness/
├── harness.yaml          # 매니페스트
├── conventions/          # 코딩 규칙, 리뷰 기준
├── prompts/              # 재사용 프롬프트 템플릿
├── skills/               # 공유 절차
└── knowledge/            # 도메인 지식, 용어집
```

- **계층 머지**: 전역(`~/.agenthive/harness/`) + 프로젝트(오버라이드)
- **자동 주입**: 컨벤션이 CLAUDE.md, AGENTS.md, .cursor/rules에 자동 삽입

### 4. GitHub Sync — 양방향 동기화

GitHub 이슈/PR과 AgentHive 태스크 간의 양방향 동기화.

- **이슈 임포트**: 라벨 필터링 → TASK 카드 자동 생성
- **상태 동기화**: `doing` → `hive:doing` 라벨, `done` → 이슈 닫기
- **PR 매핑**: 브랜치 이름으로 태스크 연결
- **`gh` CLI 인증**: AgentHive에 토큰을 저장하지 않음

### 5. AR Adapters — 런타임별 파일 생성

Harness에서 런타임별 지시 파일을 자동 생성합니다:

| 런타임 | 생성 파일 |
|--------|----------|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Cursor | `.cursor/rules/agenthive.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| 범용 | `AGENTHIVE.md` |

## 빠른 시작

### 설치

```bash
# 클론 및 빌드
git clone https://github.com/songblaq/agent-hive.git
cd agent-hive
pnpm install
pnpm build
pnpm link --global
```

### 초기화

```bash
# 허브 생성 (~/.agenthive/)
agenthive init --lang ko

# 프로젝트 등록
cd /path/to/your/project
agenthive project add .
```

### 태스크 관리

```bash
# 태스크 생성
agenthive task create "사용자 인증 추가" --priority high

# 칸반 보드 보기
agenthive status

# 태스크 점유
agenthive task claim TASK-001 --agent claude-code --role builder

# 태스크 완료
agenthive task complete TASK-001
```

### Collab 사용

```bash
# Collab 초기화
agenthive collab init

# 채널 만들기
agenthive collab channel architecture "아키텍처 논의"

# 메시지 보내기
agenthive collab post general "인증 모듈 작업 시작합니다" --from claude-code

# 최근 메시지 읽기
agenthive collab tail general --last 20
```

### Harness 설정

```bash
# Harness 초기화
agenthive harness init

# 해결된 harness 보기 (전역 + 프로젝트 머지)
agenthive harness show
```

### 포인터 파일 생성

```bash
# CLAUDE.md 생성 (harness 컨벤션 주입)
agenthive setup claude

# 모든 런타임 파일 생성
agenthive setup all
```

### GitHub 동기화

```bash
# 동기화 초기화 (GitHub 원격 자동 감지)
agenthive sync init

# 오픈 이슈를 태스크로 임포트
agenthive sync import

# 동기화 상태 확인
agenthive sync status
```

### 웹 대시보드

```bash
# 대시보드 시작
agenthive web --port 4173
```

**대시보드 미리보기:**

```
┌─ AgentHive Dashboard ──────────────────────────────────────────────────┐
│ [Kanban Board] [Agents] [Activity Log] [Decisions] [Threads]          │
│ [Collab] [Harness] [Sync]                                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─Backlog──┐ ┌─Ready────┐ ┌─Doing────┐ ┌─Review───┐ ┌─Done─────┐  │
│  │          │ │          │ │          │ │          │ │          │  │
│  │ TASK-005 │ │ TASK-003 │ │ TASK-001 │ │ TASK-002 │ │ TASK-000 │  │
│  │ 모니터링 │ │ 인증기능 │ │ 초기설정 │ │ DB스키마 │ │ 스캐폴딩 │  │
│  │ medium   │ │ high     │ │ @claude  │ │ @codex   │ │ @cursor  │  │
│  │          │ │ [Claim]  │ │ [Review] │ │ [Done]   │ │    ✅    │  │
│  │          │ │          │ │ [Done]   │ │ [Back]   │ │          │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Collab 탭:**

```
┌─ Collab ───────────────────────────────────────────────────────────────┐
│                                                                        │
│  ┌─Channels─┐  ┌─#general─────────────────────────────────────────┐  │
│  │          │  │                                                   │  │
│  │ >general │  │  14:30  @claude-code                             │  │
│  │  arch    │  │    아키텍처 논의를 시작합니다                      │  │
│  │  standup │  │                                                   │  │
│  │          │  │  14:31  @codex                                    │  │
│  │          │  │    동의합니다. 채널 구조가 깔끔하네요              │  │
│  │          │  │                                                   │  │
│  │          │  │  14:32  @cursor  [proposal]                      │  │
│  │          │  │    GitHub Sync도 설계해볼까요?                    │  │
│  │          │  │    refs: TASK-005                                 │  │
│  │          │  │                                                   │  │
│  │          │  ├───────────────────────────────────────────────────┤  │
│  │          │  │ [human    ▼] [message ▼] [메시지 입력...] [Send] │  │
│  └──────────┘  └───────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## 도입 경로

AgentHive는 필요한 만큼만 채택할 수 있습니다:

| 경로 | 명령 | 적합한 경우 |
|------|------|------------|
| **Collab-only** | `agenthive init --collab-only` | 에이전트 대화만 필요할 때 |
| **Harness-only** | `agenthive harness init` | AI 규칙 공유만 필요할 때 |
| **Standard** | `agenthive init` | 태스크 + 소통 + 규칙 |
| **Full** | `init` + `sync init` + `setup all` | GitHub 연동까지 전부 |

## CLI 전체 목록

| 명령 | 설명 |
|------|------|
| `agenthive init` | 허브 초기화 (`--collab-only` 최소 설치) |
| `agenthive project add <경로>` | 프로젝트 등록 |
| `agenthive project list` | 등록된 프로젝트 목록 |
| `agenthive task create <제목>` | 태스크 생성 |
| `agenthive task claim <id>` | 태스크 점유 (원자적 락 생성) |
| `agenthive task complete <id>` | 태스크 완료 처리 |
| `agenthive task list` | 모든 태스크 목록 |
| `agenthive status` | 터미널 칸반 보드 |
| `agenthive collab init` | Collab 채널 초기화 |
| `agenthive collab channels` | 채널 목록 + 통계 |
| `agenthive collab channel <id> <설명>` | 채널 생성 |
| `agenthive collab post <채널> <메시지>` | 메시지 전송 |
| `agenthive collab tail <채널>` | 최근 메시지 읽기 |
| `agenthive harness init` | Harness 초기화 |
| `agenthive harness show` | 해결된 harness 보기 |
| `agenthive harness export` | harness 내보내기 |
| `agenthive sync init` | GitHub 동기화 초기화 |
| `agenthive sync import` | 이슈를 태스크로 임포트 |
| `agenthive sync status` | 동기화 상태 보기 |
| `agenthive setup <대상>` | 포인터 파일 생성 (claude/codex/cursor/copilot/all) |
| `agenthive web` | 웹 대시보드 실행 |

## 설계 원칙

1. **파일 기반, 인프라 제로** — YAML + JSONL + Markdown. DB도, 서버도, Docker도 필요 없음
2. **런타임 무관** — 파일을 읽을 수 있는 모든 AI 도구에서 동작. SDK 불필요
3. **1 태스크, 1 소유자, 1 스코프** — 원자적 잠금으로 충돌 방지
4. **계획 후 구현, 구현 후 검토** — 모든 태스크는 plan이 필요하고, 모든 구현은 review가 필요
5. **Append-Only 소통** — 메시지와 리뷰는 수정하지 않고, 추가만 함

## 기술 스택

| 항목 | 선택 |
|------|------|
| 언어 | TypeScript (ESM, strict) |
| 런타임 | Node.js 20+ |
| CLI | Commander.js |
| 데이터 | YAML + JSONL + Markdown |
| 빌드 | tsup |
| 테스트 | Vitest (56개) |
| 의존성 | 2개 (commander, yaml) |

## 기여

```bash
pnpm install    # 의존성 설치
pnpm dev        # 워치 모드
pnpm test       # 테스트 실행
pnpm build      # 프로덕션 빌드
pnpm lint       # 타입 체크
```

## 라이선스

MIT
