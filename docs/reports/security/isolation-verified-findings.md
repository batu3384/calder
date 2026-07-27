# Verified Findings — Calder Isolation

**Scan date:** 2026-07-27  
**Scope:** Isolation refactor (read-only toolchain, provider set `claude|codex|antigravity|cursor`, mobile/P2P removed)

## Executive Summary

| Severity | Open | Fixed this session |
| -------- | ---- | ------------------ |
| Critical | 0    | 0                  |
| High     | 0    | 3                  |
| Medium   | 0    | 2                  |
| Low      | 0    | 1                  |

## Fixed Findings

### VF-001 — Calder scaffold symlink write escape (HIGH)

- **Reachability:** User opens malicious repo → triggers “create starter files/policy”
- **Fix:** `projectWritePath()` on all `calder-*/scaffold.ts` writers
- **Test:** `calder-governance/scaffold.test.ts` symlink rejection

### VF-002 — Auto-approval false allow on duplicate/in-flight (HIGH)

- **Reachability:** Concurrent permission prompts in `project_edits` / `session_safe`
- **Fix:** `finalDecision = 'ask'` when dedupe guard fires
- **Test:** `auto-approval-orchestrator.test.ts`

### VF-003 — Unsupported provider resume ID corruption (HIGH)

- **Reachability:** Persisted state from older Calder builds with removed provider tabs
- **Fix:** Normalize unknown `providerId` to `claude` and strip `cliSessionId`
- **Test:** `store.test.ts`

### VF-004 — Cursor config watcher used Claude paths (MEDIUM)

- **Fix:** No external watchers for `cursor` provider

### VF-005 — Legacy safe-tools mode regression (MEDIUM)

- **Fix:** `edit_plus_safe_tools` → `session_safe`

### VF-006 — Misleading policy failure copy (LOW)

- **Fix:** “fell back to manual approval” instead of “off mode”

## Previously Verified Closed

1. **MCP governance external write** — IPC + modal removed; runtime MCP inspector read/connect only.
2. **Git IPC traversal** — `resolvePathWithinProject` + symlink rejection.
3. **External hook injection** — Removed entirely; Calder no longer writes `~/.claude`, `~/.codex`, or other provider configs.
4. **Auto-approval unsafe modes** — `full_auto*` removed; destructive always `ask`.
5. **P2P share / mobile remote** — Entire surface removed; VULN-003 `REMEDIATED_BY_REMOVAL`.

## Residual Notes (accepted / out of scope)

- **`~/.calder/runtime` session watcher** — reads status/events the user’s CLI hooks write; Calder does not inject those hooks.
