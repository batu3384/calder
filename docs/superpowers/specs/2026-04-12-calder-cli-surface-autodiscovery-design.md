# Calder CLI Surface Autodiscovery Design

**Date:** 2026-04-12

**Goal:** Remove the first-run setup friction from `CLI Surface` by letting Calder discover, create, and launch a suitable CLI runtime profile automatically whenever confidence is high, while preserving the current manual profile flow as a safe fallback.

## Product Diagnosis

`CLI Surface` technically works today, but the first interaction is too heavy:
- the user clicks `CLI Surface`
- Calder immediately asks for a profile
- the user has to split a known terminal command into `command` and `arguments`

That is a bad first-run experience, especially compared with `Live View`, which already feels immediate.

The problem is not profile persistence. Profiles already persist per project. The real issue is **initial setup friction**.

For many CLI-first projects, Calder should be able to infer a likely runtime command from the project itself and avoid asking the user to fill a form.

## Approved Direction

Adopt an **autodiscovery-first** flow for `CLI Surface`.

Behavior:
- if the project already has a saved CLI profile, use it
- if not, Calder scans the project and builds runtime candidates
- if Calder finds exactly one strong candidate, it:
  - creates the profile automatically
  - switches the left surface to `CLI Surface`
  - starts the runtime automatically
- if Calder finds multiple plausible candidates, it opens a lightweight `Quick Setup` picker
- only if Calder cannot find a trustworthy candidate does it fall back to the current full profile form

This makes `CLI Surface` feel much closer to the natural one-click behavior of `Live View`.

## Alternatives Considered

### Keep the current manual profile form

This is lowest effort, but it preserves the exact friction that made the feature feel unfinished.

### Always show a quick suggestion picker

This is safer than silent automation, but it still inserts unnecessary UI even when one candidate is clearly correct.

### Recommended: autodiscovery first, picker second, manual form last

This gives the best balance of speed, safety, and user trust.

## UX Model

### First Click on `CLI Surface`

When the user opens `CLI Surface` for a project:

1. If a saved CLI profile exists:
   - activate `CLI Surface`
   - show the saved profile in the top deck
   - do not force setup again

2. If no saved profile exists:
   - run CLI runtime discovery for the current project
   - classify the result by confidence

### Confidence Outcomes

#### High confidence

Conditions:
- one strong candidate
- no competing candidate with similar score

Behavior:
- create a CLI profile automatically
- persist it into `project.surface.cli.profiles`
- mark it as `selectedProfileId`
- start the runtime immediately

The user should not see a setup form in this case.

#### Medium confidence

Conditions:
- multiple plausible candidates
- one or more candidates are reasonable, but Calder should not choose silently

Behavior:
- open a compact `Quick Setup` surface
- show each candidate with:
  - launch command
  - short reason
  - working directory
- allow:
  - `Run`
  - `Edit`
  - `Manual setup`

This must be lighter than the full profile modal.

#### Low confidence

Conditions:
- no meaningful candidate
- ambiguous repo shape
- likely non-runnable or unsupported structure

Behavior:
- fall back to the existing full `CLI Surface Profile` modal

## Discovery Sources

Calder should build CLI candidates from project files and known ecosystem conventions.

### Node / JavaScript / TypeScript

Primary source:
- `package.json`

Priority order:
- `dev:tui`
- `dev:cli`
- `tui`
- `cli`
- `dev`
- `start`

Generated command shape:
- `npm run <script>`
- `pnpm <script>` or `yarn <script>` only when Calder can identify the active package manager from project files or lockfiles

### Python

Primary sources:
- `pyproject.toml`
- common Textual/TUI entry patterns
- direct runnable app files

Priority examples:
- `uv run python ...`
- `poetry run python ...`
- `python -m textual run ...`
- `python app.py`

Bias:
- prefer explicit TUI/Textual-style commands over generic scripts

### Rust

Primary source:
- `Cargo.toml`

Priority:
- direct binary target if clearly named for app runtime
- otherwise `cargo run`

### Go

Primary sources:
- `go.mod`
- common `cmd/...` entrypoints

Priority:
- `go run ./cmd/<name>`
- otherwise `go run .`

### Documentation-assisted fallback

If structured project files do not provide enough signal, Calder may inspect:
- root `README.md`
- clearly named run instructions

This must remain secondary to structured project metadata.

## Candidate Scoring

Every discovered candidate should carry:
- `command`
- `args`
- `cwd`
- `source`
- `reason`
- `confidence`

Confidence should be derived from:
- explicit runtime metadata
- script naming strength
- framework-specific signals
- uniqueness of the result
- ambiguity with competing candidates

Calder must not silently auto-run a candidate when the confidence is only medium.

## Quick Setup Surface

The quick setup UI is a new intermediate layer between full automation and the manual form.

Requirements:
- compact modal or inline surface
- candidate list with plain-English reasoning
- one-click `Run`
- `Edit` to open the current full profile modal prefilled with that candidate
- `Manual setup` for total control

This surface should be presented as:
- a runtime suggestion step
- not a settings form

## Persistence Rules

Once a profile is created, whether automatically or through user choice:
- store it in `project.surface.cli.profiles`
- update `selectedProfileId`
- reuse it on future launches

Rules:
- do not overwrite an existing saved profile automatically
- do not discard user-edited profiles when a new autodiscovery pass finds another candidate
- the last successful profile should remain the default profile for the project

## Failure Handling

If an automatically selected or quick-setup candidate fails to launch:
- keep the profile
- show a clear runtime failure state in `CLI Surface`
- offer:
  - `Edit command`
  - `Try another suggestion` if alternatives exist

Do not send the user back to a blank full form unless there is no better recovery path.

## Non-Negotiable Constraints

1. Do not break or regress the current `Live View` browser flow.
2. Do not remove manual profile creation; it remains the fallback path.
3. Do not overwrite existing user-defined CLI profiles automatically.
4. Do not auto-run medium-confidence candidates.
5. Do not make the quick setup flow feel heavier than the current manual modal.

## Technical Touchpoints

Primary expected areas:
- `src/renderer/components/tab-bar.ts`
- `src/renderer/components/cli-surface/pane.ts`
- `src/renderer/state.ts`
- `src/shared/types.ts`
- new discovery module in main or shared runtime orchestration

Likely new modules:
- `src/main/cli-surface-discovery.ts`
- `src/main/cli-surface-discovery.test.ts`
- shared candidate types in `src/shared/types.ts` so renderer can render reasoning data without recomputing it

Expected responsibilities:
- discovery lives outside renderer
- renderer receives structured candidates and confidence
- renderer decides whether to:
  - auto-create and auto-start
  - show quick setup
  - show manual profile modal

## Acceptance Criteria

This design is complete when:
- clicking `CLI Surface` no longer always opens the full profile form
- high-confidence projects auto-create and auto-start a CLI runtime profile
- medium-confidence projects show a quick candidate picker
- low-confidence projects fall back to manual setup
- saved profiles are reused automatically on later launches
- existing browser surface behavior remains unchanged

## Verification Plan

Minimum verification after implementation:
- discovery unit tests for Node, Python, Rust, and Go project fixtures
- confidence classification tests
- renderer tests for:
  - auto-start path
  - quick setup path
  - manual fallback path
- persistence tests for saved profile reuse
- `npm test`
- `npm run build`
- manual smoke check in:
  - a CLI-first Node project
  - a Python TUI project
  - a project with no discoverable runtime command
