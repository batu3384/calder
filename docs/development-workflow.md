# Development Workflow (Canonical)

This file is the single source of truth for local setup, run, build, and validation commands.

## Prerequisites

- Node.js `v24` (see `.nvmrc`)
- npm

## Setup

```bash
nvm use
npm install
npm run hooks:install
```

`npm run hooks:install` configures local git hooks (`core.hooksPath=.githooks`) and enables the pre-push quality gate.

## Run

```bash
npm run dev
```

`npm run dev` builds and launches Electron (`npm start` is equivalent behavior).

No hot reload is currently enabled; changes require rebuild + app restart.

## Build

```bash
npm run build
```

## Test

```bash
npm test
npm run test:watch
npm run test:coverage
npm run test:critical-stability
```

## Deep Validation

```bash
npm run audit:deep
```

`audit:deep` runs cache-clear, shuffled test passes, coverage lanes, build, dependency audit, dead-code scan, and structure guardrails.

## Structure Guardrails

```bash
npm run audit:structure
```

`audit:structure` enforces repository hygiene and architecture guardrails:

- Forbidden tracked artifact paths (`.tmp`, `.worktrees`, local tool caches).
- Direct file count budgets in hot folders.
- File line budgets:
  - `src` code files: `<= 500` lines.
  - `src` test files: `<= 1000` lines.
  - `scripts` files: `<= 350` lines.
- Legacy oversized files are frozen via `scripts/structure-audit-baseline.json`:
  - New oversized files fail immediately.
  - Existing oversized files cannot grow.

Detailed policy: `docs/architecture-guardrails.md`.

## Local Push Gate

The repository ships a local `pre-push` hook in `.githooks/pre-push`.

It blocks push unless all pass:

- `npm run audit:structure`
- `npm run build`
- `npm test`

Temporary bypass (only for emergency debugging):

```bash
CALDER_SKIP_PRE_PUSH=1 git push
```

## Packaging

```bash
npm run pack
npm run dist
```
