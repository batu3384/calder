# Architecture Guardrails

This document defines the non-negotiable architecture rules that prevent technical debt from silently accumulating.

## Hard Limits

- `src` code files must stay at or below `500` lines.
- `src` test files must stay at or below `1000` lines.
- `scripts` files must stay at or below `350` lines.

These limits are enforced by `npm run audit:structure` and in CI.
The same checks are also enforced locally by `.githooks/pre-push` after `npm run hooks:install`.

## Legacy Freeze Rule

Some historical oversized files are listed in `scripts/structure-audit-baseline.json`.

- New oversized files are blocked.
- Oversized baseline files cannot increase in line count.
- When a baseline file is reduced below its limit, remove it from baseline in the same PR.

## Modularization Rules

- Keep one dominant responsibility per module.
- Split feature implementations into:
  - `*-state.ts` (state and selectors),
  - `*-actions.ts` (imperative actions/handlers),
  - `*-view.ts` or `*-render.ts` (rendering),
  - `*.test.ts` (behavior + contract tests).
- Avoid direct cross-surface imports where a local service boundary exists.

## Pull Request Gate

A PR is not ready unless all are true:

- `npm run build` passes.
- `npm run audit:structure` passes.
- `npm test` passes.
- Any touched large file does not grow.

## Refactor Trigger

Refactor immediately when one of these happens:

- A source file crosses `450` lines.
- A test file crosses `900` lines.
- A file requires unrelated edits in the same change.
- New cross-community coupling warning appears in architecture analysis.
