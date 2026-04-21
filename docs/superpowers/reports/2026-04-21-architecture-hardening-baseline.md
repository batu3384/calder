# Architecture Hardening Baseline (2026-04-21)

## Build and Test Baseline

- `npm run build`: PASS
- `npm test`: PASS (`312` files / `2347` tests)
- `npm run audit:deep`: PASS

## Coverage Snapshot

- Statements: `90.00%`
- Branches: `79.38%`
- Functions: `89.18%`
- Lines: `92.60%`

## Graph Snapshot

- `code-review-graph status`
  - Nodes: `6410`
  - Edges: `72369`
  - Files: `550`
- `code-review-graph detect-changes --base HEAD --brief`
  - Risk score: `0.55`
  - Changed files: `64`
  - Changed functions/classes: `65`
  - Affected flows: `0`
  - Test gaps: `14`

## High-Risk Theme Summary

1. Main IPC/security boundary consistency around `projectPath` and governance checks.
2. MCP runtime call governance coverage gap relative to add/remove paths.
3. Startup/provider hook install fail-soft behavior needs hardening.
4. Renderer/state and tab/surface modules remain monolithic and tightly coupled.
5. Coverage signal is optimistic because `src/renderer/components/**` and `src/preload/**` are excluded from coverage lane.

## Initial Workstreams Started

- Phase 1.1 worker: project path boundary hardening in IPC write/scaffold paths.
- Phase 4 starter worker: deterministic audit pipeline and critical-stability lane extension.
