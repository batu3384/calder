# Coverage Threshold Ratchet (2026-04-21)

## Purpose

This report documents the initial conservative coverage gate added during the safe debt-closure work.

The goal is not to claim high coverage everywhere yet. The goal is to prevent accidental large coverage regressions while the remaining monoliths are decomposed safely.

## Initial Gate

Configured in `vitest.config.ts`:

- Statements: `45`
- Branches: `45`
- Functions: `50`
- Lines: `45`

These thresholds are intentionally below the current standard coverage lane and below the expanded full-boundary lane, so they should not create noisy failures during normal development.

## Current Baseline Context

Latest deep audit before enabling this gate reported:

- Standard coverage lane: statements around `89%`, branches around `79%`, functions around `89%`, lines around `92%`.
- Full-boundary coverage lane: statements around `50%`, branches around `51%`, functions around `55%`, lines around `51%`.

The initial gate is therefore calibrated against the stricter full-boundary profile while leaving room for renderer/preload monolith refactors.

## Ratchet Rule

Coverage thresholds may only move upward.

Do not lower thresholds unless there is an explicit incident review that documents:

- why the lower threshold is necessary,
- which coverage lane regressed,
- which files or surfaces caused the regression,
- the follow-up plan to restore or raise the threshold again.

## Validation Commands

Run both coverage lanes before changing these thresholds:

```bash
npm run test:coverage
CALDER_COVERAGE_PROFILE=full npm run test:coverage
```

The deep audit also runs both coverage lanes:

```bash
npm run audit:deep
```
