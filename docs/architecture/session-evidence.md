# Session Evidence architecture

**Status:** MVP shipped (Phase 0–6)  
**Plan:** Session Evidence & Pixel Agent Live (`docs/superpowers/specs/2026-07-30-session-evidence-pixel-agent-master-plan.md`)

## Boundaries

- Main owns ingest, normalize, redact, persist, Git fingerprint, summary, export.
- Renderer consumes sanitized IPC only; never raw tool inputs or secrets.
- Governance decisions are **recorded**, never re-decided, by Evidence.
- Pixel Compact consumes only normalized `EvidenceEvent` visual states.

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
- `pixel.mode`: `off` | `compact` | `studio` (default `compact`)

## Renderer surfaces

Session Inspector tabs:

| Tab      | Purpose                                                                          |
| -------- | -------------------------------------------------------------------------------- |
| Evidence | Live timeline, filters, detail panel, health gaps, Pixel Compact                 |
| Studio   | Full Pixel Studio workspace (when `pixelMode === studio`)                        |
| Changes  | Path search, load more, health panel, live git/file rows                         |
| Review   | Summary stats, health indicators, status/notes, sanitized export, delete run/all |

Performance: timeline renders at most the latest 250 matching DOM rows; older matches require a narrower filter. Pagination uses `evidence:listEvents` (`Load more`).

## IPC

`evidence:getSummary`, `listEvents`, `getHealth`, `getMeta`, `getReview`, `updateReview`, `export`, `deleteRun`, `deleteAll`, `getSettings`, `setSettings`, `getStorageUsage`, `rebuildSummary`, `subscribe` + `evidence:event`.

## Tests

- Unit: `src/main/calder-evidence/*`
- Fixtures: `lifecycle.fixture.test.ts`, `provider-matrix.fixture.test.ts`
- UI helpers: `evidence-view-support.test.ts`, `session-inspector.evidence.contract.test.ts`

## Deferred

- Full virtualized scroll for multi-thousand DOM rows (UI still caps at 250)

## Pixel Studio (Phase 7)

Dedicated **Studio** inspector tab when `pixelMode === 'studio'`.

## Pixel Ecosystem

**Ecosystem** inspector tab (after Activity): one pixel card per open CLI session.

- Live multi-run subscribe (`evidence:subscribe` accepts `runId | runId[]`)
- Activity taxonomy: searching_code, reading_files, researching_web, browsing, using_mcp, git_ops, compacting
- Provider marks (Cl/Cx/Cu/Ag) + fidelity chip (`PTY only` when hooks unavailable)
- Card click → inspect session + Evidence; Studio chip → Studio deep-dive

Six CSS stations: `research` · `files` · `git` · `terminal` · `test_build` · `security`

Scenes: `normal` · `celebration` (completed) · `error` (failed) · `gate` (approval/blocked)

UI: Evidence ↔ Studio shortcuts, expand/collapse layout, SVG sprite sheet (`assets/pixel-agent/studio-sheet.svg`), pause when inspected session ≠ active terminal session.

Resolver: chronological state machine — `permission_approved` clears waiting; later work/completion clears blocked/failed; interrupts stale after 5 minutes.

Provider-aware: tool names mapped across Claude/Codex/Cursor/Antigravity; Compact/Studio show provider accent + label. Agent moves with `transform`; sprite/bob only while `data-motion=active`.

Store: `readEvents({ offset, limit })` streams JSONL with early exit; `listEvents` IPC uses page + `meta.eventCount` for total.
