# Calder Hybrid Statusline Design

**Date:** 2026-04-11

**Goal:** Upgrade Calder's Claude Code status line from a hidden cost/context capture hook into a user-facing two-line cockpit that shows the active model, provider, context, and provider-aware quota state without inventing unsupported numbers.

## Product Diagnosis

Calder already installs a Claude Code `statusLine` command, but the current script only extracts JSON fields from stdin and writes `.cost` and `.sessionid` files into the Calder temp directory.

Current behavior:
- Claude Code emits `cost`, `context_window`, `model`, and `session_id` into the statusLine command payload
- Calder captures those fields into temp files for internal use
- the terminal statusline itself remains generic and does not explain which provider or model is active
- quota visibility is inconsistent because Claude Code does not expose a stable "remaining 5-hour / weekly allowance" field directly in the statusLine payload

This leaves users without a trustworthy at-a-glance answer to the questions they actually care about during active sessions:
- which model am I currently using?
- is this Anthropic or Z.ai?
- how full is the context window?
- do we have live quota info, stale info, or no supported quota info at all?

## Approved Direction

Replace the current "capture-only" statusLine runtime with a **hybrid two-line statusline**.

Behavior:
- line 1 shows the currently active model identity and session context
- line 2 shows local runtime signals plus provider quota state when available
- quota values are shown only when Calder can read a real provider-backed source
- missing quota data is rendered honestly as `syncing`, `unknown`, `stale`, or `unsupported`
- provider identity is inferred from the selected model
  - `glm-*` models map to `Z.ai`
  - Claude models map to `Anthropic`

This keeps the statusline useful even when external quota sources are unavailable:
- local session facts still render immediately
- the statusline remains fast because it reads cache files, not remote APIs, on the hot path
- the quota row becomes richer over time without redesigning the UI

## Alternatives Considered

### Local-only statusline

Show only model, context, and local cost/session data.

This is the safest implementation, but it fails the user's core requirement of understanding "how much runway is left" by provider.

### Deep telemetry statusline

Build a dense statusline that attempts to expose all quota, freshness, and per-provider diagnostics immediately.

This is attractive, but it creates too much implementation risk up front because the underlying provider quota surfaces are not equally mature or equally documented.

### Recommended: hybrid statusline with honest quota states

This is the best balance:
- strong local signal immediately
- quota integration where supported
- explicit fallback states where unsupported

## UX Requirements

### Layout

Use a balanced two-line layout similar to the user's reference screenshot.

Line 1:
- active model
- provider name
- effort level when available
- compact project or cwd label

Line 2:
- context percentage
- local session cost or usage when available
- `5h` quota state
- `week` quota state
- sync freshness badge

### Display Language

The statusline must prefer short readable labels over raw JSON keys.

Examples:
- `Claude Sonnet 4.6  Anthropic  High  browser`
- `Ctx 38%  Cost --  5h unknown  Week unknown  Live`
- `GLM-5.1  Z.ai  High  browser`
- `Ctx 22%  Cost --  5h syncing  Week syncing  Live`

### Quota State Vocabulary

Only the following user-facing states should be used when quota numbers are absent:
- `syncing` — a collector is running but no confirmed value exists yet
- `unknown` — a source may exist but Calder could not read a value
- `unsupported` — Calder has no supported way to read this metric for the current provider
- `stale` — last known value exists but is older than the freshness threshold
- `live` — fresh provider-backed data exists

### Honesty Rules

1. Never show estimated remaining quotas when no real provider-backed value exists.
2. Never convert local token/cost data into fake "5-hour remaining" numbers.
3. Never show Anthropic or Z.ai quota values unless Calder can name the source that produced them.

## Data Model

### Local Runtime Data

Always available from Claude Code statusLine stdin or existing Calder temp files:
- model display name
- session id
- context window information
- cost information when emitted by Claude Code

### Provider Identity

Derived from the active model string:
- `glm-*` -> `Z.ai`
- all Claude models -> `Anthropic`

### Provider Quota Cache

Introduce a provider quota cache file stored in Calder's existing temp/runtime area.

Each cache entry should contain:
- `provider`
- `model`
- `fiveHour`
- `weekly`
- `status`
- `updatedAt`
- `source`
- optional `message`

The statusline renderer reads the cache only. It must not block on remote I/O.

### Provider Collectors

Quota collection should happen through separate provider-specific collectors.

Initial expectation:
- Anthropic collector starts in `unsupported` or `unknown` because public Claude Code/Claude Pro statusline surfaces do not expose a stable remaining-allowance field
- Z.ai collector starts in `syncing` or `unknown` until a documented usage/quota surface is confirmed

The architecture must support later upgrades without changing statusline presentation.

## Technical Design

### Split the Runtime Into Two Responsibilities

#### 1. Statusline renderer

The installed Claude Code `statusLine` command should become a dedicated renderer script that:
- reads stdin JSON from Claude Code
- updates the existing `.cost` and `.sessionid` files
- resolves provider identity from the active model
- reads provider quota cache
- prints the final two-line statusline text to stdout

#### 2. Quota collector

A separate helper should refresh provider quota cache out of band.

Responsibilities:
- provider-specific data fetch logic
- freshness timestamps
- cache writes with atomic replace semantics
- graceful failure markers instead of crashes

The statusline renderer can opportunistically trigger a background refresh when cache is missing or stale, but it must not wait for the result.

### File and Process Boundaries

Reuse Calder's existing temp directory (`/tmp/calder` on Unix) and hook installation model.

Expected runtime artifacts:
- `.cost`
- `.sessionid`
- new provider quota cache file(s)
- optional sync lock or timestamp markers

### Provider Adapter Shape

Define a narrow internal adapter contract:
- `provider id`
- `canReadQuota()`
- `readQuotaSnapshot()`
- `fallbackStatus()`

This keeps Anthropic and Z.ai logic isolated and allows future providers to participate without editing the renderer.

### Failure Behavior

If the renderer fails:
- stdout should fall back to a compact safe string instead of exiting noisily
- the temp file capture behavior should continue where possible

If a provider collector fails:
- cache should record a non-fatal state (`unknown`, `stale`, or `unsupported`)
- the statusline should continue rendering local facts

## Primary Technical Touchpoints

Expected files to change:
- `src/main/hook-status.ts`
- `src/main/claude-cli.ts`
- `src/main/settings-guard.ts`
- new runtime helper(s) for statusline rendering and provider quota cache
- tests covering statusline installation and runtime output

Likely implementation shape:
- move inline shell/Python statusline generation in `hook-status.ts` to a richer managed runtime asset
- keep `claude-cli.ts` responsible for installing the statusLine command path
- preserve `settings-guard.ts` compatibility by keeping the installed command path recognizable as Calder-managed
- add provider-aware quota cache helpers under `src/main/`

## Risk Management

Main risks:
- slowing down the statusline by doing network work inline
- rendering misleading quota numbers
- creating fragile provider-specific logic
- breaking existing settings guard behavior or foreign statusline detection

Mitigation:
- render from cache only
- use strict state vocabulary instead of estimates
- isolate provider collectors behind adapters
- keep the installed command path and guard behavior stable

## Acceptance Criteria

This design is complete when:
- Calder installs a two-line Claude Code statusline instead of a capture-only script
- the statusline shows active model and derived provider correctly
- the statusline shows context window information from Claude Code input
- quota fields render using `live`, `syncing`, `unknown`, `unsupported`, or `stale` when appropriate
- no fake quota numbers are displayed
- missing provider data does not crash or blank the statusline
- existing `.cost` and `.sessionid` capture behavior is preserved
- settings validation still recognizes the statusline as Calder-managed

## Verification Plan

Minimum verification after implementation:
- unit tests for provider detection from model names
- unit tests for statusline string formatting across all quota states
- unit tests for cache freshness handling
- unit tests for statusline installation/validation compatibility
- manual smoke checks for:
  - a Claude model session
  - a `glm-*` model session
  - missing quota cache
  - stale quota cache
  - collector failure fallback
- `npm test`
- targeted build or typecheck for touched runtime code
