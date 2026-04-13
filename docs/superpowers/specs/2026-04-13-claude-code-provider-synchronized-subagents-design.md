# Claude Code Provider-Synchronized Subagents Design

**Date:** 2026-04-13

**Goal:** Make all Claude Code subagent and helper-agent traffic follow the active provider selected in the current session, while preserving the existing top-level model selection UX for Claude, Z.ai, and MiniMax.

## Product Decision

The approved behavior is:
- the visible model selection flow stays the same
- all subagents and helper agents follow the active provider for the current session
- the system should not require separate subagent model setup from the user

This means:
- if the user is working on Claude, all subagent/helper traffic stays on Claude
- if the user switches to Z.ai, all subagent/helper traffic moves to Z.ai
- if the user switches to MiniMax, all subagent/helper traffic moves to MiniMax

No helper-agent exception path will remain in the final design.

## Current Problem

The current hybrid gateway correctly routes explicit provider-native models:
- `claude-*` -> Anthropic
- `glm-*` -> Z.ai
- `MiniMax-*` -> MiniMax

But that is not enough to guarantee end-to-end provider coherence inside Claude Code.

Observed issue from the live gateway log:
- MiniMax sessions still generate requests for `claude-haiku-4-5-20251001`
- this shows that some built-in subagent/helper flows are still using Claude defaults instead of the active session provider

Additional live probe result:
- an explicit top-level Claude selection such as `/model sonnet` also reaches the gateway as `claude-sonnet-4-6`

This means model string alone is not sufficient to distinguish:
- a user’s explicit top-level Claude model choice
- a helper/subagent default emitted by Claude Code

So the current system is:
- correct for main-session explicit model selection
- not yet correct for hidden subagent/helper alias resolution

## UX Contract

The user-facing model selection contract must remain stable.

### Claude

Users continue to select Claude through the existing short names:
- `/model opus`
- `/model sonnet`
- `/model haiku`

### Z.ai

Users continue to select Z.ai through:
- `custom` -> `glm-5.1`
- `/model glm-5-turbo`
- `/model glm-4.7`

### MiniMax

Users continue to select MiniMax through:
- `/model MiniMax-M2.7`

The design must not introduce a separate “subagent model” control.

## Non-Goals

This design does not attempt to:
- redesign the visible model picker UI
- add new provider families
- introduce separate user-facing agent model settings
- expose unsupported MiniMax variants such as `MiniMax-M2.7-highspeed`
- change current statusline behavior beyond reflecting the active model/provider already selected

## Recommended Architecture

The implementation should move provider resolution into a dedicated **session-aware alias resolution layer** inside the local gateway.

### Principle

Explicit provider-native model names always win.

Examples:
- `glm-5.1` remains `glm-5.1`
- `glm-5-turbo` remains `glm-5-turbo`
- `MiniMax-M2.7` remains `MiniMax-M2.7`
- `claude-haiku-4-5-20251001` remains explicit Claude only when it is positively identified as the user’s top-level Claude choice

Aliases and Claude defaults become **session-relative**.

Examples:
- `haiku`
- `sonnet`
- `opus`
- built-in Claude full-model defaults that appear in subagent/helper traffic

These should be rewritten according to the active provider for that session.

## Session State Model

The gateway should maintain a small in-memory registry keyed by Claude IDE session identity.

Required state per session:
- `sessionId`
- `activeProvider`: `anthropic | zai | minimax`
- `activeMainModel`: the most recent explicit top-level user-selected model
- `updatedAt`

The gateway should populate this state from incoming request traffic.

### Session Identity Source

The preferred session key should come from request headers if available.

If Claude Code does not provide a stable custom session header on all requests, the gateway should fall back to a weaker key only if necessary. The fallback should be conservative and never merge two live sessions into one provider state.

This means the implementation must first inspect real request metadata and choose the narrowest reliable session key available.

## Model Resolution Rules

### Rule 1: Explicit third-party model names never change

If the request model is one of:
- `glm-*`
- `MiniMax-*`

the gateway should route it directly to the corresponding provider.

### Rule 2: Claude short aliases become provider-relative inside an active session

If the request model is one of:
- `opus`
- `sonnet`
- `haiku`

the gateway should resolve it against the session’s `activeProvider`.

#### When active provider is Claude
- `opus` -> Claude Opus
- `sonnet` -> Claude Sonnet
- `haiku` -> Claude Haiku

#### When active provider is Z.ai
- `opus` -> `glm-5.1`
- `sonnet` -> `glm-5-turbo`
- `haiku` -> `glm-4.7`

#### When active provider is MiniMax
- `opus` -> `MiniMax-M2.7`
- `sonnet` -> `MiniMax-M2.7`
- `haiku` -> `MiniMax-M2.7`

MiniMax currently has only one supported text model in this setup, so all three aliases collapse to `MiniMax-M2.7`.

### Rule 3: Claude full-model-family requests need request classification before rewriting

This is the key fix for hidden agent/helper traffic.

Requests such as:
- `claude-haiku-4-5-20251001`
- `claude-sonnet-*`
- `claude-opus-*`

cannot be treated as always-explicit Claude selections.

The gateway must first determine whether a Claude full-model-family request is:
- an explicit top-level user model selection
- or a helper/subagent default emitted inside an already-established non-Claude session

Only the second category should be rewritten when the active provider is not Claude.

They should be normalized into the corresponding provider-relative alias tier:
- Claude Haiku-like default -> provider `haiku` tier
- Claude Sonnet-like default -> provider `sonnet` tier
- Claude Opus-like default -> provider `opus` tier

That tier is then resolved using Rule 2.

This is what allows hidden helper agents to follow the active provider without changing the visible model picker.

### Rule 4: If the active provider is unknown, preserve current behavior

If the gateway cannot confidently determine the active provider for a request:
- preserve current explicit upstream behavior
- do not guess
- log the unresolved request for diagnostics

This protects unrelated sessions and avoids surprising model switches.

## Provider Mapping Table

### Claude active

Main session:
- `opus`, `sonnet`, `haiku` remain Claude

Subagent/helper traffic:
- `haiku` tier -> Claude Haiku
- `sonnet` tier -> Claude Sonnet
- `opus` tier -> Claude Opus

### Z.ai active

Main session:
- `glm-5.1`, `glm-5-turbo`, `glm-4.7`

Subagent/helper traffic:
- `haiku` tier -> `glm-4.7`
- `sonnet` tier -> `glm-5-turbo`
- `opus` tier -> `glm-5.1`

Fallback chain remains:
- `glm-5.1` -> `glm-5-turbo` -> `glm-4.7`
- `glm-5-turbo` -> `glm-4.7`

### MiniMax active

Main session:
- `MiniMax-M2.7`

Subagent/helper traffic:
- `haiku` tier -> `MiniMax-M2.7`
- `sonnet` tier -> `MiniMax-M2.7`
- `opus` tier -> `MiniMax-M2.7`

No unsupported MiniMax variants should be surfaced or auto-selected.

## Request Classification

The gateway does need a lightweight request classifier, but only for one narrow reason:
- to identify which requests are allowed to establish or replace the active session provider
- and which requests should instead inherit the existing active provider

This is necessary because a user’s explicit Claude selection and a helper agent default can both appear as `claude-*` model ids.

The implementation should avoid broad “helper vs non-helper” branching. It only needs one reliable distinction:
- **provider-establishing requests**
- **provider-inheriting requests**

### Provider-establishing requests

These are requests that are allowed to define or replace the session’s active provider.

They include:
- explicit `glm-*`
- explicit `MiniMax-*`
- explicit top-level Claude model selections, once positively identified via request metadata

### Provider-inheriting requests

These are requests that should follow the session’s existing provider state.

They include:
- `opus`
- `sonnet`
- `haiku`
- Claude full-model-family requests that are identified as helper/subagent defaults rather than top-level selections

### Classification requirement

Phase 1 instrumentation must capture real request metadata to discover the narrowest stable signal for top-level model selection.

Examples of acceptable classification inputs:
- a dedicated request header
- a stable request body field
- another request-shape marker proven by live traces

If no reliable positive signal exists, the gateway must not rewrite ambiguous `claude-*` requests. It should preserve current behavior and log the ambiguity instead.

## Failure Handling

### Claude unavailable

If Anthropic is unavailable but the session is already running on Z.ai or MiniMax:
- no special handling is needed
- all helper/subagent traffic is already provider-synchronized

If the active session provider is Claude and Anthropic becomes unavailable:
- the gateway should not silently change the user’s selected top-level provider
- the request should fail explicitly

This design is about provider synchronization, not silent provider failover.

### Unknown session mapping

If the gateway cannot map a request to a session:
- preserve current direct resolution
- log the request model, request path, and relevant session identifiers
- avoid rewriting the request

### Provider-specific issues

Z.ai:
- continue existing malformed tool-use fallback behavior
- continue thinking-block stripping

MiniMax:
- continue thinking-block stripping
- preserve existing direct model routing for `MiniMax-M2.7`

Anthropic:
- continue current mixed-provider thinking sanitization

## Observability

The gateway should log enough data to explain routing decisions without exposing secrets.

For each rewritten request, log:
- session key
- incoming model
- normalized tier (`haiku`, `sonnet`, `opus`, explicit)
- resolved target model
- resolved provider

Example shape:
- `session=abc incoming=claude-haiku-4-5-20251001 tier=haiku provider=minimax resolved=MiniMax-M2.7`

This logging is essential for verifying the design in real sessions before and after rollout.

## Testing Strategy

The implementation should be covered at three levels.

### 1. Pure routing unit tests

Add unit tests for:
- explicit `glm-*` pass-through
- explicit `MiniMax-*` pass-through
- alias resolution for Claude-active sessions
- alias resolution for Z.ai-active sessions
- alias resolution for MiniMax-active sessions
- Claude full-model defaults rewritten to Z.ai and MiniMax tiers
- unresolved session fallback to current direct behavior

### 2. Gateway integration tests

Add request-level tests that simulate:
- top-level session starts on Claude
- top-level session switches to Z.ai
- a following `claude-haiku-*` request is rewritten to `glm-4.7`
- top-level session switches to MiniMax
- a following `claude-haiku-*` request is rewritten to `MiniMax-M2.7`

### 3. Manual log verification

Run live smoke checks in Claude Code:
- Claude main model + subagent activity
- Z.ai main model + subagent activity
- MiniMax main model + subagent activity

Success condition:
- no subagent/helper request escapes to the wrong provider for that session

## Rollout Plan

Implement in two phases.

### Phase 1: Safe instrumentation

Add:
- session registry
- alias-tier inference
- diagnostic logs
- request metadata capture for ambiguous `claude-*` model-family traffic

But keep rewriting disabled behind a flag.

Goal:
- confirm session-key quality
- confirm full-model default patterns
- confirm how top-level model selections are distinguishable from helper defaults
- confirm no hidden request shapes were missed

### Phase 2: Routing activation

Enable provider-synchronized rewriting for:
- `opus`
- `sonnet`
- `haiku`
- Claude default full-model family requests

Keep all existing Z.ai and MiniMax sanitization/fallback logic untouched.

## Guardrails

- Do not change visible model picker semantics
- Do not remove `glm-5.1` custom model support
- Do not add unsupported MiniMax variants
- Do not silently switch the user’s top-level provider on failures
- Do not weaken current thinking sanitization
- Do not merge state across concurrent sessions

## Acceptance Criteria

This design is complete when all of the following are true:

- choosing Claude keeps all subagent/helper traffic on Claude
- choosing Z.ai keeps all subagent/helper traffic on Z.ai
- choosing MiniMax keeps all subagent/helper traffic on MiniMax
- the top-level user model selection UX remains unchanged
- explicit `glm-*` and `MiniMax-*` models still work exactly as before
- current Z.ai fallback and thinking sanitization still work
- current MiniMax thinking sanitization still works
- gateway logs make every rewritten routing decision explainable
