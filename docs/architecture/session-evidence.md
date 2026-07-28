# Session Evidence architecture

**Status:** Phase 0 frozen (2026-07-27)  
**Plan:** Session Evidence & Pixel Agent Live

## Boundaries

- Main owns ingest, normalize, redact, persist, Git fingerprint, summary, export.
- Renderer consumes sanitized IPC only; never raw tool inputs or secrets.
- Governance decisions are recorded, never re-decided, by Evidence.
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

- `evidence.enabled`: `dev` → user-visible after Evidence Core Gate
- `pixel.mode`: `off` | `compact` (default `off`)
