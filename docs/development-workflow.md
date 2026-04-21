# Development Workflow (Canonical)

This file is the single source of truth for local setup, run, build, and validation commands.

## Prerequisites

- Node.js `v24` (see `.nvmrc`)
- npm

## Setup

```bash
nvm use
npm install
```

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

`audit:deep` runs cache-clear, shuffled test passes, coverage lanes, build, dependency audit, and dead-code scan.

## Packaging

```bash
npm run pack
npm run dist
```
