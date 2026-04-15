# Calder Auto Approval Design (Global Default + Project Override)

Date: 2026-04-15  
Status: Approved for planning  
Scope: Calder core orchestration, provider adapters, governance policy resolution, right-rail UX

## Summary

This design introduces a safe, CLI-agnostic auto-approval system for Calder with a two-layer policy model:

1. Global default policy
2. Per-project override policy

The effective decision is resolved at runtime and applied consistently across supported CLIs (Claude, Codex, Gemini, Qwen) via provider adapters. The design keeps fast workflows for repetitive approvals while preserving strict guardrails for risky operations.

## Goals

- Reduce repeated approval interruptions during normal coding workflows.
- Keep behavior consistent across all Calder-supported CLIs.
- Provide transparent policy scope and effective mode in the right rail.
- Preserve safety defaults with explicit fail-safe behavior.
- Record all approval decisions for auditability.

## Non-Goals

- No blanket auto-approval for destructive commands.
- No implicit enablement of network or write-risk commands.
- No provider-specific UI behavior divergence by default.
- No silent policy escalation without user-visible indicators.

## User Problem

Users report frequent approval prompts even when they have enabled permissive edit behavior in provider-native settings. This creates friction, especially during iterative development where many low-risk edit requests are expected.

The requested solution is:

- Auto-approval that works across all Calder-supported CLIs.
- A right-rail control for fast on/off operation.
- A policy model that supports both global defaults and project-level overrides.

## Approaches Considered

### Approach A: Provider-native only

Rely entirely on each CLI’s own approval settings.

Pros:
- Minimal Calder changes.
- Low implementation complexity.

Cons:
- Inconsistent semantics across providers.
- Poor central observability and no unified audit layer.
- Hard to maintain common user expectations.

### Approach B: Calder UI toggle only (no shared policy engine)

Add a right-rail toggle and route behavior through ad hoc provider logic.

Pros:
- Faster to ship.
- Good immediate UX.

Cons:
- Logic duplication across providers.
- High long-term drift risk.
- Hard to enforce consistent safety guardrails.

### Approach C: Central policy orchestrator + provider adapters (Selected)

Implement one canonical policy resolver and decision engine in Calder core, with thin provider adapters.

Pros:
- Consistent behavior across CLIs.
- Strong auditability and safety controls.
- Scales cleanly for new provider integrations.

Cons:
- Slightly higher upfront implementation effort.
- Requires careful event normalization.

Selected approach: Approach C.

## Selected Design

### 1. Policy Model

Add canonical modes:

- `off`
- `edit_only`
- `edit_plus_safe_tools`

Resolution order:

1. Project override (`<project>/.calder/governance/policy.json`)
2. Global default (`~/.calder/governance/default-policy.json`)
3. Fallback (`off`)

Rules:

- `edit_only`: auto-approve edit requests only.
- `edit_plus_safe_tools`: auto-approve edits and safe allowlisted tools.
- `off`: no auto-approval.

### 2. Core Architecture

Add `AutoApprovalOrchestrator` in main process:

- `EventNormalizer`: normalize provider events to a common shape.
- `PolicyResolver`: compute effective mode from global + project policy.
- `DecisionEngine`: classify and decide (`allow`, `ask`, `block`).
- `ApprovalExecutor`: apply decision through provider adapter.
- `AuditRecorder`: write structured decision logs.

Provider adapters remain thin:

- Translate normalized decisions to provider-specific approval actions.
- Expose capability flags (supported/unsupported).

Fail-safe:

- If normalization or classification is uncertain, default to `ask`.

### 3. Decision Classification

Operation classes:

- `edit`
- `safe_tool`
- `risky_tool`
- `unknown`
- `destructive`

Policy actions:

- `allow`: auto-approve now
- `ask`: keep manual prompt
- `block`: deny operation

### 4. Safe Tool Guardrails

Allowed as `safe_tool` when syntax and intent match read-only patterns:

- `rg`, `rg --files`
- `ls`, `pwd`
- `cat`
- `sed -n`
- `head`, `tail`, `wc`
- `find` in read-only patterns
- `git status`, `git log`, `git show`, `git diff` (read-only)

Always not auto-approved:

- Network operations by default (`ask`)
- Write/execute-risk operations (`ask` or `block`)
- Destructive commands (`block`), for example:
  - `rm -rf`
  - `git reset --hard`
  - `git checkout --`

Unknown commands:

- Always `ask`.

Mode-specific guardrails:

- In `edit_only`, safe-tool allowlist is disabled.
- In `edit_plus_safe_tools`, risky/destructive rules still apply.

### 5. Rate and Session Safety

- Rate guard: if auto-approvals exceed threshold in a short interval, switch to soft pause (`ask`) until user resumes.
- Session override: temporary mode override valid only for active session.
- Unsupported provider behavior: fallback to `ask` with visible message.

### 6. Right Rail UX

Add a dedicated `Auto Approval` block with:

- `Mode`: `Off`, `Edits`, `Edits + Safe tools`
- `Scope`: `Global default`, `Project override`
- `Effective mode`: resolved active mode
- `Session override`: temporary control

Visibility rules:

- Show `override active` badge when project override differs from global.
- Show warning copy when `Edits + Safe tools` is active:
  - Risky commands still require manual approval.

Operational controls:

- `Pause auto-approval` quick action (session-scoped to `off`)
- Recent decisions panel (last N):
  - auto-approved edit
  - asked risky tool
  - blocked destructive command

### 7. Data and File Contracts

Global policy file:

- `~/.calder/governance/default-policy.json`

Project policy file:

- `<project>/.calder/governance/policy.json`

Extend project policy schema with:

- `autoApproval.mode`
- Optional `autoApproval.safeToolProfile`

Audit stream:

- Extend session events with `approval_decision` entries including:
  - policy source (global/project/session)
  - effective mode
  - operation class
  - decision
  - reason

### 8. Error Handling

- Missing/malformed policy files: fallback to next source, then `off`.
- Adapter unsupported action: fallback to `ask`, surface non-blocking warning.
- Policy conflict or unknown mode: fallback to `off` and log validation error.
- Event parse failures: treat as `unknown`, decision=`ask`.

## Test Strategy

### Unit Tests

- Policy resolution precedence (project > global > fallback).
- Decision matrix for all modes and operation classes.
- Safe-tool classifier positive/negative command coverage.
- Destructive command hard-block behavior.
- Rate-guard transitions and reset behavior.

### Integration Tests

- End-to-end decision flow through each provider adapter.
- Unsupported adapter path falls back to `ask`.
- Right-rail reflects effective mode correctly.
- Session override applies and expires at session end.

### Regression Tests

- Existing governance enforcement remains intact.
- Existing permission request timeline rendering remains accurate.
- No silent behavior change when mode=`off`.

## Rollout Plan

1. Implement core orchestrator and policy resolver with no-op execution.
2. Add command classification and decision engine behind feature flag.
3. Integrate provider adapters one by one.
4. Ship right-rail controls and effective-mode indicators.
5. Enable audit logs and observability dashboards.
6. Remove flag after stability window.

## Risks and Mitigations

- Risk: Over-classification allows unintended commands.
  - Mitigation: strict allowlist, unknown=`ask`, destructive=`block`.

- Risk: Provider-specific approval API drift.
  - Mitigation: adapter capability checks + fallback to `ask`.

- Risk: User confusion from multiple scopes.
  - Mitigation: explicit scope labels + effective mode + override badge.

## Open Questions (for plan phase confirmation)

- Default rate-guard threshold values.
- Exact safe-tool allowlist profile versioning strategy.
- Whether project-level policy edits should require explicit governance write confirmation under enforced mode.

