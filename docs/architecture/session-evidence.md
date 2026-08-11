# Session Evidence architecture

**Status:** MVP shipped; Pixel Office is the right Context Inspector rail surface  
**Plan:** Session Evidence & Pixel Agent Live (`docs/superpowers/specs/2026-07-30-session-evidence-pixel-agent-master-plan.md`)  
**Office:** `docs/superpowers/specs/2026-07-31-pixel-office-design.md`

## Boundaries

- Main owns ingest, normalize, redact, persist, Git fingerprint, summary, export.
- Renderer consumes sanitized IPC only; never raw tool inputs or secrets.
- Governance decisions are **recorded**, never re-decided, by Evidence.
- Pixel Office consumes normalized `EvidenceEvent` → `AgentEvent` signals on a Canvas pane inside the right Context Inspector rail.

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

Pixel Office (`#pixel-office`): Canvas 2D office inside the Context Inspector rail. Toggle `Cmd+Shift+O`. Characters map open CLI sessions; verified Evidence drives task-specific desk poses, bubbles, context gauge, sub-agent orbit, and an accessible DOM status companion.

The rail owns one lifecycle bridge:

- `pixelMode` controls visibility, runtime start, and Evidence subscription together.
- Collapsing the rail stops the Canvas animation loop while retaining reconciled state.
- Closing the Context Inspector emits a visibility signal; the office loop and subscription stop until
  the rail reopens.
- Canvas colors come from shared light/dark CSS tokens through `office-theme.ts`.
- DOM session rows include provider/activity, event age, and context percentage; keyboard resize
  updates Canvas sizing together with the persisted rail height.

## IPC

`evidence:getSummary`, `listEvents`, `getHealth`, `getMeta`, `getReview`, `updateReview`, `export`, `deleteRun`, `deleteAll`, `getSettings`, `setSettings`, `getStorageUsage`, `rebuildSummary`, `subscribe` + `evidence:event`.

## Claude hook bridge

Inspector hooks normalize into Evidence:

| Hook / inspector type              | Evidence type                                                        |
| ---------------------------------- | -------------------------------------------------------------------- |
| `pre_tool_use`                     | `tool_requested`                                                     |
| `tool_use` (non-Post)              | `tool_started`                                                       |
| `tool_use` + `PostToolUse`         | `tool_completed`                                                     |
| `stop`                             | `session_ended` (completion intent; run remains open until PTY exit) |
| `task_created` / `task_completed`  | `task_created` / `task_completed`                                    |
| `subagent_start` / `subagent_stop` | `subagent_started` / `subagent_completed` (+ `subagentId`)           |

Office maps Evidence → `AgentEvent.kind` (`toolStart` / `toolEnd` / …).

Renderer event delivery is append-only and sequence-aware. Subscription registration replays the
current bounded tail before live delivery, so the initial fetch/subscribe gap cannot drop events.
Initial tails and live batches merge by `evidenceRunId + eventId`, retain the highest `seq`, and
switch runs by explicit identity rather than wall-clock timestamps; stale snapshots are rejected
when their run no longer matches current metadata. Provider-controlled hook names, tool names,
task IDs, and subagent IDs are redacted and length-bounded at the main-process boundary. PTY-only
`preparing` stays standby; Thinking/Typing/Researching requires a verified activity event.
The per-session main-process queue serializes inspector batches with PTY exit so `lastSeq` remains
monotonic. An allowed governance decision records `policy_decision` and derives a sanitized
`permission_approved` event; rejected events never notify renderer subscribers.
`tool_completed` becomes structured unknown work until a turn/session end, while
`session_ended`, interruption, provider/PTY termination, failure, or task completion clears active
poses and subagents. `pty_exited` always resolves the office pose to idle; successful completion
comes from provider/stop lifecycle evidence.

Replay and renderer tail loading share `EVIDENCE_TAIL_WINDOW` (120 events). A run mismatch clears
the cached visual state and refreshes the subscription to the current run; a transient list read
failure keeps the known run subscribed without applying an unverified snapshot.

## Tests

- Unit: `src/main/calder-evidence/*`
- Fixtures: `lifecycle.fixture.test.ts`, `provider-matrix.fixture.test.ts`
- Office: `src/renderer/components/pixel-office/office-core.test.ts`
- Contracts: `session-inspector.evidence.contract.test.ts`
- Lifecycle: `normalize.test.ts`, `visual-resolver.test.ts`, `subscribe-ids.test.ts`
- Release gates: typecheck, lint, format, build, structure/graph audit, dependency audit

Dependency gate is clean after non-breaking patch updates to the Evidence dependency chain and
the audited `esbuild` development toolchain. Verification uses `npm audit` and
`npm audit --omit=dev`; no blanket `npm audit fix` is used.

## Deferred

- Full virtualized scroll for multi-thousand DOM rows (UI still caps at 250)
- Metro City sprite pack after license note in `THIRD_PARTY_NOTICES`
- Named Claude Agent Teams teammate seating
