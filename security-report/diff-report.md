# Security Diff Report

**Date:** 2026-07-30  
**Scope:** Uncommitted hardening (governance siblings + PTY exit flush + prior MEDIUM fixes)  
**Verdict:** PASS

## Remediated this pass

| ID           | Severity | Fix                                                                         |
| ------------ | -------- | --------------------------------------------------------------------------- | -------- | ----------- | ------ | ---- | ------------------------------------------------------------------------------------- |
| DIFF-003/004 | MEDIUM   | `governance:getProjectState` + global `setAutoApprovalMode` path validation |
| SIBLINGS     | MEDIUM   | `context                                                                    | workflow | teamContext | review | task | checkpoint:getProjectState`+`task:read`/`checkpoint:read`now`requireKnownProjectPath` |
| PTY-EXIT     | WARNING  | Renderer batcher `flush` before dispose; parseCost flush on exit            |

## Accepted / remaining notes

| ID         | Severity | Notes                                                       |
| ---------- | -------- | ----------------------------------------------------------- |
| DIFF-001   | LOW      | PTY color env FORCE_COLOR=1 — UX tradeoff                   |
| COLD-START | WARNING  | First `pty:create` sync login-shell warm — not in this diff |
| I18N-OBS   | NOTE     | TR MutationObserver body-wide — deferred                    |
| BUNDLE     | NOTE     | ~2MB renderer monolith — deferred                           |

## XSS / secrets

- No new exposure. Auto-approval uses `esc()` / `textContent`.
