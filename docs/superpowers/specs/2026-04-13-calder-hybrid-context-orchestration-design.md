# Calder Hybrid Context Orchestration Design

Date: 2026-04-13
Status: Approved for planning
Scope: Cross-provider project context, shared rules, prompt routing, and roadmap staging

## Summary

Calder should not replace provider-native memory systems. Instead, it should become the orchestration layer that discovers provider-specific project context, exposes it clearly in the UI, and adds a small shared rules layer that works across providers.

The chosen model is **hybrid context orchestration**:

- provider-native memory stays intact
- Calder discovers and normalizes visible context sources
- Calder adds a small provider-agnostic shared rules layer
- prompt routing uses a short, budgeted, explainable context pack
- the user can always see which sources influenced a prompt

This avoids the biggest failure mode of a fully centralized memory system: fighting the natural behavior of Claude Code, GitHub Copilot, Gemini CLI, and other providers already integrated into Calder.

## Goals

- Preserve provider-native memory and instruction behavior.
- Reduce context loss when users switch providers inside the same project.
- Give Calder a provider-agnostic project rules layer.
- Make prompt routing more consistent without silently bloating context.
- Show users exactly which context sources are active and applied.
- Build an architecture that can support workflows, checkpoints, review loops, and background agents later.

## Non-Goals

- Calder does not try to copy or replicate hidden provider session history.
- Calder does not force all providers into one canonical memory format in v1.
- Calder does not auto-write memory files without explicit user action.
- Calder does not introduce embeddings, RAG, or semantic indexing in the first version.
- Calder does not replace provider settings UIs or internal memory management.

## Current Reality

Calder already has a strong orchestration base:

- multi-provider session management
- archived session history
- browser and CLI live surfaces
- targeted prompt routing into existing sessions
- provider config discovery and watchers
- MCP discovery and inspection

The current gap is not "no memory exists." The current gap is that memory is **fragmented, provider-specific, and mostly invisible at the Calder layer**.

Examples:

- Claude Code can use `CLAUDE.md` and native memory
- GitHub Copilot can use repo instructions and Copilot Memory
- Gemini CLI can use provider-specific context files

Calder currently orchestrates the sessions that sit on top of those systems, but it does not yet give the user a unified understanding of:

- which project context sources exist
- which ones are active for the current provider
- which ones were applied to a routed browser or CLI prompt

## Why Hybrid Is The Right Model

### Alternative A: Fully Centralized Calder Memory

Calder becomes the single source of truth for project memory and rules. All providers receive context primarily from Calder-owned files such as `CALDER.md`.

Pros:

- single center of gravity
- easier to explain at a product level
- high long-term consistency if fully adopted

Cons:

- fights provider-native behavior
- creates duplicate memory systems
- increases migration friction
- risks becoming too opinionated for multi-provider users

### Alternative B: Provider-Native Only

Calder exposes provider-native files and settings, but adds no shared project layer.

Pros:

- minimal product complexity
- no risk of stepping on provider behavior

Cons:

- provider switching still loses shared project discipline
- browser and CLI routing remain underpowered
- Calder contributes almost no cross-provider intelligence

### Chosen Approach: Hybrid Context Orchestration

Calder keeps provider-native memory systems intact while adding:

- discovery
- normalization
- visibility
- a small shared rules layer
- prompt-aware context resolution

This gives Calder a differentiated role without competing with the providers themselves.

## Product Principles

### 1. Visible, not magical

Calder should not behave like an invisible memory injector. The user must be able to see:

- active provider-native sources
- active shared rules
- which sources were applied to a specific prompt

### 2. Small context packets, not context dumps

Calder should not append large memory blobs to routed prompts. It should create a compact, token-budgeted summary.

### 3. Provider-native context stays provider-scoped

`CLAUDE.md` should not be blindly forwarded into Copilot sessions. Provider-native sources remain scoped to their provider unless the user explicitly converts them into shared rules.

### 4. Shared rules are small and operational

The shared Calder layer should start as project rules, not a second giant memory system.

Examples:

- `tests are required before completion`
- `avoid editing generated files`
- `prefer pnpm in this repo`
- `keep renderer and main process boundaries explicit`

### 5. No surprise mutations

Calder should never auto-create or auto-edit memory sources behind the user's back. It may suggest or scaffold starter files, but the user owns the content.

## Core Architecture

The system has six layers:

1. `Discovery`
2. `Normalization`
3. `Registry`
4. `Context Resolution`
5. `Prompt Assembly`
6. `Transparency UI`

### 1. Discovery

When a project opens, Calder scans for visible context sources.

Initial source families:

- provider-native project instructions
- provider-native user instructions when safely discoverable
- project-level MCP config
- Calder shared rule files

Initial file examples:

- `CLAUDE.md`
- provider-specific repo instruction files where supported
- `GEMINI.md`
- `.mcp.json`
- `CALDER.shared.md`
- `.calder/rules/*.md`

The discovery layer only answers:

- what exists
- where it lives
- what kind of source it is
- when it changed

### 2. Normalization

Discovered sources are translated into a common internal shape.

Example internal model:

- `id`
- `providerScope`
- `scope`
- `kind`
- `path`
- `hash`
- `lastUpdated`
- `summary`
- `directives`

This does not require deep semantic parsing in v1. A lightweight, deterministic extraction step is enough.

### 3. Registry

The registry is Calder's in-memory source table for a project.

It stores:

- all discovered context sources
- their normalized summaries
- enable/disable state for shared rules
- hashes for change detection

The registry is not a new giant persistent memory system. It is a live orchestration table backed by files the user can inspect.

### 4. Context Resolution

This is the decision engine.

Resolver inputs:

- target provider
- target session
- source surface
- user prompt
- selected browser or CLI context
- relevant file path hints

Resolver outputs:

- provider-native sources to keep active
- shared rules relevant to this action
- a prioritized applied-source list

Important rule:

- provider-native sources remain provider-scoped
- shared rules remain provider-agnostic

### 5. Prompt Assembly

Prompt assembly builds a short context pack.

Order of precedence:

1. user-entered prompt
2. selected browser or CLI context
3. shared hard rules
4. provider-project instructions
5. shared soft rules
6. provider-user defaults

The output should be compact, explicit, and token-budgeted.

Example:

- selected UI region
- `Shared rules: tests required, generated files are read-only`
- `Claude project context: prefer pnpm, use vitest`
- `Applied sources: CLAUDE.md, testing.md, boundaries.md`

### 6. Transparency UI

The UI must explain the system.

Required surfaces:

- right rail summary
- session composer applied-context summary
- settings management page

Users should understand:

- which provider-native context is active
- how many shared rules are enabled
- what was applied to the last routed prompt

## V1 User Experience

### On project open

Calder discovers available context sources and shows a compact summary:

- `Claude memory active`
- `2 shared rules available`
- `last updated 4m ago`

### On browser inspect routing

Calder uses:

- selected DOM context
- shared hard rules
- provider-native relevant context for the target session

The composer shows the applied source list before send.

### On CLI inspect routing

Calder uses:

- selected terminal region or semantic selection
- shared rules relevant to that operation
- provider-native project context for the target provider

Again, the applied sources remain visible.

### On provider switch

The active provider-native sources change, but the shared project rules remain stable.

This means:

- provider behavior still feels native
- project discipline does not collapse when the user switches tools

## Phase Roadmap

### Phase 0: Product Truth And Discovery

Purpose:

- align README, onboarding, and settings copy with the actual product
- add read-only provider-context discovery
- expose discovered sources in the UI

Deliverables:

- updated README and onboarding copy
- discovery and watcher plumbing
- right-rail summary for discovered sources
- no prompt behavior changes yet

Success:

- user can see what Calder discovered
- no ambiguity about active providers and supported context sources

### Phase 1: Hybrid Context V1

Purpose:

- add shared rules
- normalize sources into a registry
- apply compact context summaries during prompt routing

Deliverables:

- `CALDER.shared.md`
- `.calder/rules/*.md`
- registry and resolver
- applied-context UI in browser and CLI composers

Success:

- provider switching retains shared project discipline
- routed prompts gain stable context without large token growth

### Phase 2: Workflows And Checkpoints

Purpose:

- turn repeated tasks into reusable workflows
- make recovery from bad agent output safe and fast

Deliverables:

- `.calder/workflows/*.md`
- workflow launcher
- checkpoints for session + diff + prompt + surface state

Success:

- repeated prompts drop sharply
- users can restore a safe working point after bad edits

### Phase 3: Review And Preview Loop

Purpose:

- make Calder the place where review, fix, preview, and verification happen together

Deliverables:

- PR review findings surface
- fix-in-selected-session actions
- preview deploy center and log surfaces

Success:

- code review and verification become part of the normal Calder loop

### Phase 4: Governance Layer

Purpose:

- add safety and policy before deeper automation

Deliverables:

- provider profiles
- tool/network/budget controls
- MCP allowlist and write policy gates

Success:

- agent autonomy becomes configurable and trustworthy

### Phase 5: Background Agents

Purpose:

- allow queued and asynchronous work without losing visibility

Deliverables:

- local task queue
- status surfaces
- artifact and handoff views
- resume and takeover

Success:

- useful work continues while the user is not actively driving every step

### Phase 6: Shared Team Context

Purpose:

- grow Calder from a solo orchestration tool into a team coordination surface

Deliverables:

- shared context spaces
- shared rules and workflows
- stronger collaboration on top of P2P session sharing

Success:

- teams can align on the same project rules, context, and agent workflows

## V1 Technical Boundaries

The first real implementation slice should stop at:

- file discovery
- normalization
- shared rules
- compact applied context
- visible UI summaries

V1 should not include:

- embeddings
- semantic vector retrieval
- full cross-provider memory synchronization
- background execution
- automatic rule learning

## Risks

### 1. Duplicate instruction systems

Risk:

- users feel they now have "one more memory system"

Mitigation:

- keep shared rules small
- preserve provider-native sources
- make all sources visible in UI

### 2. Token bloat

Risk:

- prompt routing gets noisy and expensive

Mitigation:

- enforce a strict context budget
- add summaries, not dumps
- keep applied-source count low

### 3. Source ambiguity

Risk:

- users cannot tell where guidance came from

Mitigation:

- always show applied source names
- separate provider-native vs shared context in UI

## Success Criteria

- users can identify all active context sources for a project
- provider switching no longer destroys shared project discipline
- browser and CLI routed prompts become more consistent
- context additions stay compact and explainable
- Calder gains a clear, differentiated role above the providers
