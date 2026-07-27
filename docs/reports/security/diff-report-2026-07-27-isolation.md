# Security Diff Report

**Branch:** main (uncommitted WIP)
**Base:** HEAD
**Date:** 2026-07-27
**Files Changed:** 131+
**Files Scanned:** 94+ (production TS; docs/tests filtered for triage)

## Summary

| Category | New | Existing | Total |
| -------- | --- | -------- | ----- |
| Critical | 0   | 0        | 0     |
| High     | 1   | 0        | 1     |
| Medium   | 2   | 0        | 2     |
| Low      | 1   | 0        | 1     |

## Verdict

**PASS** (after fixes in this session)

- No open Critical findings
- HIGH symlink write escape **fixed** via `projectWritePath` on all Calder scaffold writers
- HIGH false auto-allow on in-flight duplicate **fixed** in orchestrator
- HIGH unsupported provider resume ID mismatch **fixed** in store migration

## New Findings (Introduced by This Change)

### DIFF-001: Symlink `.calder` write escape

- **Severity:** High
- **Confidence:** 92/100
- **Classification:** NEW → **FIXED**
- **File:** `src/main/calder-*/scaffold.ts`
- **Description:** Starter file / governance policy creation used `path.join` without containment; malicious `.calder` symlink could redirect writes outside the repo (including CLI home dirs).
- **Remediation:** Applied `projectWritePath` / `resolvePathWithinProject` to all Calder scaffold write paths.

### DIFF-002: In-flight auto-approval recorded as allow

- **Severity:** High
- **Confidence:** 88/100
- **Classification:** NEW → **FIXED**
- **File:** `src/main/calder-governance/auto-approval-orchestrator.ts:220`
- **Description:** Concurrent duplicate permission events kept `finalDecision=allow` without dispatching approval.
- **Remediation:** Set `finalDecision='ask'` when in-flight or rapid-duplicate guard triggers.

### DIFF-003: Legacy unsupported provider sessions kept stale resume IDs

- **Severity:** High
- **Confidence:** 90/100
- **Classification:** NEW → **FIXED**
- **File:** `src/main/store.ts`
- **Description:** Sessions with removed/unknown `providerId` kept `cliSessionId` from the old CLI.
- **Remediation:** Normalize unsupported providers to `claude` and clear `cliSessionId` / `claudeSessionId`.

### DIFF-004: Cursor sessions watched Claude config paths

- **Severity:** Medium
- **Confidence:** 85/100
- **Classification:** NEW → **FIXED** (module later removed)
- **File:** ~~`src/main/config-watcher.ts`~~ deleted with config-read surface
- **Description:** Cursor provider fell through to Claude watchers, refreshing toolchain UI from `~/.claude`.
- **Remediation:** Cursor no longer watches provider homes; `config-watcher` / `provider:getConfig` removed entirely.

### DIFF-005: Legacy `edit_plus_safe_tools` downgraded to `project_edits`

- **Severity:** Medium
- **Confidence:** 80/100
- **Classification:** NEW → **FIXED**
- **File:** `src/main/calder-governance/auto-approval-policy.ts:32`
- **Remediation:** Map to `session_safe` to preserve read-only tool auto-approval intent.

## Closed by Prior Diff Work

| Finding                              | Status                                              |
| ------------------------------------ | --------------------------------------------------- |
| MCP add IPC writing `~/.claude.json` | Removed (`ipc-mcp-governance`, `claude-mcp-config`) |
| Git diff path traversal              | Fixed (`resolvePathWithinProject` + realpath)       |
| External hook injection on startup   | Removed (no inject path remains)                    |
| `full_auto_unsafe` destructive allow | Removed                                             |
| `event.cwd` policy bypass            | Fixed                                               |
| P2P share / mobile remote            | Removed (2026-07-27)                                |

## Dependency Changes

`qrcode` removed with P2P share UI (2026-07-27). No other security-relevant dep changes in isolation diff.

## Changed Files Not Scanned

- `README.md`, `CONTRIBUTING.md` — documentation only
- `docs/reports/security/*` — generated / audit artifacts
