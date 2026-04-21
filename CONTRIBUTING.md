# Contributing to Calder

Thanks for your interest in contributing! Here's how to get started.

Canonical local workflow commands live in:

- [docs/development-workflow.md](docs/development-workflow.md)

## Development Setup

1. **Node v24** is required — see `.nvmrc`. Use `nvm use` to switch.
2. Follow the setup and run steps in `docs/development-workflow.md`.

## Testing

Run the testing and validation commands from `docs/development-workflow.md`.

Tests use [Vitest](https://vitest.dev/) and are co-located with source files as `*.test.ts`.

## Code Style

No lint tooling is configured yet (planned). For now:

- Use 2-space indentation
- Follow existing patterns in the codebase

## Pull Request Workflow

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes and add tests where appropriate
4. Run `npm run build` and `npm test` to verify nothing is broken
5. Open a PR against `main`

## Reporting Issues

When filing a bug report, please include:

- **OS version** (e.g., macOS 15.3)
- **Calder version** (from the app's title bar or `package.json`)
- **Installed CLI provider version(s)** (for example `claude --version`, `codex --version`, or `gemini --version`)
- **Steps to reproduce**
- **Expected vs actual behavior**
