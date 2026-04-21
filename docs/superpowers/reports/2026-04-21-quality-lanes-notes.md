# Quality Lanes Notes (2026-04-21)

## Coverage Lanes

- `npm run test:coverage`:
  - Baseline engineering lane used for routine iteration.
  - Excludes high-churn UI/preload surfaces (`src/renderer/components/**`, `src/preload/**`) to keep feedback fast and stable.

- `npm run test:coverage:full`:
  - Expanded boundary lane for architecture confidence.
  - Includes preload and renderer component surfaces in the coverage target.
  - Controlled via `CALDER_COVERAGE_PROFILE=full`.

## Deep Audit Lane

- `npm run audit:deep` now runs both coverage lanes:
  1. `test:coverage` (baseline)
  2. `test:coverage:full` (expanded boundaries)

This keeps day-to-day developer feedback fast while preserving a deterministic deep gate that catches blind spots in renderer component and preload boundaries.
