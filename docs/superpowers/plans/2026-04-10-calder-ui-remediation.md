# Calder UI Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the current Calder UI hierarchy, layout, and lingering inherited-product feel without breaking any existing workflows.

**Architecture:** Keep the current renderer ids, state flow, and feature behavior intact while reshaping the shell in-place. The work is split into shell hierarchy fixes, browser chrome rebalancing, empty-state differentiation, and cleanup of smaller utility surfaces so each step can be verified independently.

**Tech Stack:** Electron, TypeScript, vanilla DOM renderer, CSS, Vitest

---

## File Structure Lock

- `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`
  Main shell structure; safe place for non-behavioral sidebar grouping wrappers.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/sidebar.ts`
  Sidebar behavior and default width handling.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`
  Config section header/body behavior and default collapse logic.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts`
  Readiness summary UI and rescan control behavior.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`
  Browser toolbar markup, empty state structure, and a11y labels.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/session-history.ts`
  History section markup and action controls.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/git-panel.ts`
  Git changes section markup and compact interaction controls.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`
  Global tokens and semantic surface colors.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
  Sidebar width, grouping, density, and project card rhythm.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
  Global top chrome hierarchy and action grouping.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`
  Browser toolbar hierarchy, responsiveness, and empty-state composition.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`
  Shared section chrome reused by config/history/git blocks.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/alerts.css`
  Readiness chips, progress rows, and semantic polish.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/session-history.css`
  History-specific cleanup and token alignment.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/git-panel.css`
  Git panel cleanup and semantic status colors.

## Task 1: Sidebar Hierarchy And Density

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/sidebar.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/alerts.css`

- [ ] Add sidebar content grouping wrappers that preserve existing section order but introduce Calder-specific structure.
- [ ] Increase default sidebar width and tighten internal spacing so counts, chips, and actions no longer collide.
- [ ] Improve config/readiness section headers so they scan faster and feel less like inherited generic utility rows.
- [ ] Verify project switching, sidebar collapse, and readiness rescan still behave identically.

## Task 2: Browser Chrome Hierarchy

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`

- [ ] Reduce the dominance of the global top bar so browser mode has one clear primary control row.
- [ ] Rebalance toolbar groups so the URL field keeps priority and tool buttons degrade gracefully on tighter widths.
- [ ] Add explicit accessibility labels to browser controls while preserving current actions and shortcuts.

## Task 3: Calder Empty-State Differentiation

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`

- [ ] Replace the inherited “localhost card grid” feel with a Calder-specific workspace entry surface.
- [ ] Keep the same quick-link behavior, but reframe it around working modes and local targets instead of generic port cards.
- [ ] Preserve all current browser-session behavior once a target is opened.

## Task 4: Utility Surface Cleanup

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/session-history.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/git-panel.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/session-history.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/git-panel.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/alerts.css`

- [ ] Bring history, git, and readiness onto the same token language as the main shell.
- [ ] Remove remaining hardcoded colors where they fight the shared theme.
- [ ] Fix the invalid `var(--text)` usage and any similar token mismatches.
- [ ] Make small action buttons and filters feel intentional rather than left-over utility chrome.

## Task 5: Verification

**Files:**
- No code changes expected unless verification reveals regressions.

- [ ] Run `npm run build`.
- [ ] Run `./node_modules/.bin/vitest run`.
- [ ] Launch the app and capture an updated screenshot to verify sidebar hierarchy, browser chrome balance, and empty-state differentiation.
