# Session Evidence architecture

**Status:** MVP shipped; Pixel Office replaces Compact/Studio rails  
**Plan:** Session Evidence & Pixel Agent Live (`docs/superpowers/specs/2026-07-30-session-evidence-pixel-agent-master-plan.md`)  
**Office:** `docs/superpowers/specs/2026-07-31-pixel-office-design.md`

## Boundaries

- Main owns ingest, normalize, redact, persist, Git fingerprint, summary, export.
- Renderer consumes sanitized IPC only; never raw tool inputs or secrets.
- Governance decisions are **recorded**, never re-decided, by Evidence.
- Pixel Office consumes normalized `EvidenceEvent` → `AgentEvent` signals on a Canvas pane beside the terminal.

## Storage

```
<calderDataRoot>/evidence/{runId}/
  meta.json
  events.jsonl
  summary.json
  review.json
```

Root via `resolveCalderDataRoot()` (Evidence-scoped; store/STATUS_DIR migration deferred).

## Lifecycle

`open` → `closing` (grace) → `finalized` → bounded late window → `sealed`.

`completionState`: `completed` | `failed` | `unknown` | `interrupted`  
(`unknown ≠ interrupted`; PTY exit alone is never successful completion.)

## Feature flags

- `evidence.enabled` — Preferences → Safety (default on)
- `pixel.mode`: `off` | `office` (default `office`; legacy `compact`/`studio` migrate to `office`)

## Renderer surfaces

Session Inspector tabs: Run / Project / Timeline (Evidence timeline lives under inspector surfaces).

Pixel Office (`#pixel-office`): Canvas 2D office beside the terminal. Toggle `Cmd+Shift+O`. Characters map open CLI sessions; Evidence drives TYPE/IDLE, bubbles, context gauge, sub-agent orbit.

## IPC

`evidence:getSummary`, `listEvents`, `getHealth`, `getMeta`, `getReview`, `updateReview`, `export`, `deleteRun`, `deleteAll`, `getSettings`, `setSettings`, `getStorageUsage`, `rebuildSummary`, `subscribe` + `evidence:event`.

## Claude hook bridge

Inspector hooks normalize into Evidence:

| Hook / inspector type | Evidence type |
| --- | --- |
| `pre_tool_use` | `tool_requested` |
| `tool_use` (non-Post) | `tool_started` |
| `tool_use` + `PostToolUse` | `tool_completed` |
| `subagent_start` / `subagent_stop` | `subagent_started` / `subagent_completed` (+ `subagentId`) |

Office maps Evidence → `AgentEvent.kind` (`toolStart` / `toolEnd` / …).

## Tests

- Unit: `src/main/calder-evidence/*`
- Fixtures: `lifecycle.fixture.test.ts`, `provider-matrix.fixture.test.ts`
- Office: `src/renderer/components/pixel-office/office-core.test.ts`
- Contracts: `session-inspector.evidence.contract.test.ts`

## Deferred

- Full virtualized scroll for multi-thousand DOM rows (UI still caps at 250)
- Metro City sprite pack after license note in `THIRD_PARTY_NOTICES`
- Named Claude Agent Teams teammate seating
