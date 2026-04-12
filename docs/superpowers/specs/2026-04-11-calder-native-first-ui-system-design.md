# Calder Native-First UI System Design

**Date:** 2026-04-11

**Selected direction:** Native-first Calder UI System

**Goal:** Modernize Calder's full application interface with a distinctive, premium desktop design system while preserving the current Electron, terminal, browser, provider, and session workflows.

## Product Positioning

Calder is a desktop command workspace for AI-assisted development. It is not a generic chat app, marketing dashboard, or decorative AI wrapper.

The interface should feel like:
- a serious macOS developer cockpit
- dense but calm
- terminal-native
- fast to scan during long work sessions
- visually owned by Calder, not inherited from any previous product

The redesign must improve clarity, confidence, and product identity without changing the user's existing mental model.

## Current Architecture Findings

The renderer is currently built with:
- Electron
- TypeScript
- esbuild
- vanilla DOM modules
- plain CSS files
- xterm.js for terminal panes
- Electron `webview` for browser sessions

This is an important constraint. Calder already owns a lot of desktop-specific behavior: PTY lifecycle, webview routing, browser inspection, mosaic layout, panel resize, context sidebars, IPC, provider validation, and session state. A full React/Vue rewrite would add major regression risk without directly solving the biggest UI problems.

The current UI has a good macro-structure but inconsistent visual systems:
- `base.css` and `cockpit.css` contain useful tokens, but older aliases and newer surface tokens coexist.
- Panels often use repeated card styling even when the content should be plain operational layout.
- Dropdowns, modals, custom selects, popovers, and context menus are implemented separately.
- Some panel labels are clearer now, but several flows still need stronger utility copy.
- Browser inspect and session-targeting surfaces are important product moments and should become more robust.

## Research Summary

The recommended modernization path uses current browser and Electron capabilities rather than a large framework migration.

References:
- Floating UI supports vanilla DOM positioning and is designed for popovers, dropdowns, tooltips, and collision handling: https://floating-ui.com/docs/getting-started
- Electron `BrowserWindow` remains the main window primitive and supports macOS window customization options: https://www.electronjs.org/docs/latest/api/browser-window
- Electron documents `WebContentsView` as the modern embedded web contents primitive, while Calder currently uses `webview`; this should be studied before any browser-surface rewrite: https://www.electronjs.org/docs/latest/api/web-contents-view
- MDN container queries support component-level responsive design without tying layout to viewport width: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
- MDN View Transitions can support restrained state transitions when useful: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/View_transitions
- MDN Popover API is useful context, but Calder's complex anchored and draggable popovers still fit Floating UI better: https://developer.mozilla.org/en-US/docs/Web/API/Popover_API
- WAI-ARIA APG patterns should guide dialogs, tabs, menu buttons, disclosures, toolbars, and splitters: https://www.w3.org/WAI/ARIA/apg/patterns/
- Shoelace is now sunset and points ongoing work to Web Awesome, so Shoelace should not become a new foundation: https://shoelace.style/?id=quick-start
- Web Awesome is a modern web component option, but it should be evaluated selectively rather than adopted wholesale: https://webawesome.com/docs/

## Visual Thesis

Calder should become a graphite-and-coral desktop cockpit: matte, technical, compact, and calm, with one clear accent color used only for action, focus, selection, and meaningful state.

The design should avoid:
- glossy AI app gradients
- dashboard-card mosaics
- oversized SaaS surfaces
- purple-on-dark generic styling
- decorative icons that do not improve scanning
- multiple competing accent colors

## Content Plan

This is an app UI, not a landing page. The information hierarchy should be operational:

1. **Primary workspace**
   - Browser stays left when present.
   - CLI/session panes occupy the remaining workspace.
   - Terminal/browser content remains visually dominant.

2. **Navigation**
   - Sidebar focuses on projects and global setup.
   - Top session strip focuses on active sessions, status, spend, git state, and session creation.

3. **Secondary context**
   - Control Panel explains project health, changes, recent sessions, and toolchain status.
   - Copy should be short and practical.

4. **Utility flows**
   - Preferences, modals, menus, inspector popovers, custom selects, and browser session pickers should share one interaction language.

## Interaction Thesis

Motion should improve orientation, not decorate the app.

Use:
- fast panel open/close transitions for sidebar, Control Panel, modals, and inspector surfaces
- subtle active-session focus transitions when switching panes
- anchored popover/dropdown motion that reinforces where the surface came from
- `prefers-reduced-motion` support for users who disable motion

Avoid:
- long hero-like animations
- bouncing, springy, or playful motion
- animated gradients behind routine work surfaces
- motion that hides layout bugs

## Technology Strategy

### Approved Foundation

Keep the renderer native-first:
- TypeScript modules
- DOM-driven components
- CSS design tokens
- existing esbuild pipeline
- existing Electron IPC boundaries

### Add Carefully

Add `@floating-ui/dom` for:
- tab/session context menus
- browser inspect popovers
- browser target session picker
- custom select dropdown positioning
- tooltips or menu buttons that currently clamp manually

This directly addresses overflow, collision, and anchored-positioning bugs without requiring a framework.

### Evaluate Before Adding

Evaluate Web Awesome only for isolated primitives:
- select
- dialog
- split panel
- tooltip
- progress

Do not adopt it globally until a spike proves theme control, bundle behavior, Electron packaging, CSP compatibility, and accessibility fit Calder.

### Do Not Do Now

Do not migrate the renderer to React, Vue, shadcn, or Radix in this redesign. Those tools are good, but Calder's current pain points are design-system consistency, interaction primitives, and desktop layout polish, not component framework absence.

Do not replace Electron `webview` with `WebContentsView` during the visual redesign. That is a separate browser architecture project because it can affect preload scripts, routing, inspect mode, screenshots, and target-session flows.

## Design System Direction

### Tokens

Create a stricter token system:
- surface tokens: canvas, shell, panel, raised, overlay
- border tokens: hairline, subtle, normal, focus
- text tokens: primary, secondary, muted, dim
- semantic tokens: success, warning, info, danger
- accent tokens: accent, accent-hover, accent-soft, accent-line
- spacing tokens: 2, 4, 6, 8, 10, 12, 16, 20, 24
- radius tokens: xs, sm, md, lg, pill
- motion tokens: fast, normal, panel, reduced

Keep the product visually compact. Do not increase spacing globally until the workspace becomes airy or slow to scan.

### Typography

Use the macOS system stack for UI text and a reliable monospace for terminal/system labels. Typography should feel precise, not editorial.

Improve:
- label casing
- line-height consistency
- count/status typography
- section headers
- modal hierarchy
- terminal pane chrome labels

### Surfaces

Reduce unnecessary card treatment. Use cards only when they are actual interactive containers or modal-like content. Many right-panel sections should feel like grouped operational lists rather than floating dashboard cards.

## Surface-Level Plan

### App Shell

Improve:
- sidebar density and active project treatment
- top session strip rhythm
- workspace identity placement
- spend/git visibility without making them feel like dashboard widgets
- empty workspace state

Keep:
- project/session model
- quick new-session action
- sidebar resizing
- menu access to secondary tools

### Workspace Layout

Improve:
- browser-left framing
- session grid clarity
- pane focus state
- mosaic divider affordance
- drag/reorder affordance
- split resizing feedback

Keep:
- browser always left when a browser session exists
- sessions fit to the right side
- current layout state model unless the implementation plan identifies a concrete layout-state defect that requires a small model change

### Terminal Panes

Improve:
- pane chrome hierarchy
- provider badge consistency
- status/focus affordance
- unread/working/input states
- xterm integration contrast

Keep:
- xterm lifecycle
- PTY APIs
- provider launch APIs
- keyboard behavior

### Browser Surface

Improve:
- toolbar hierarchy
- URL field sizing
- inspect/draw/record controls
- session target selector
- local dev target picker
- inspect element popover
- responsive viewport controls

Use Floating UI for anchored menus and inspect popovers instead of manual clamp logic where possible.

### Control Panel

Improve:
- clearer section language
- less card stacking
- better information density
- clearer empty states
- consistent disclosure behavior
- stronger distinction between setup warnings, git changes, recent sessions, and toolchain configuration

Keep:
- AI Setup
- Changes
- Recent Sessions
- Toolchain
- non-blocking warnings

### Modals and Preferences

Improve:
- shared modal shell
- focus trap and keyboard behavior
- button hierarchy
- field rows
- select/dropdown reliability
- utility copy

Preferences should feel like a flagship product surface, not a debug form.

### Agents, Skills, Commands, File Reading

Improve:
- markdown/document viewing layout
- table of contents or compact metadata header where useful
- readable typography
- action affordances
- search and copy behavior if already supported by current architecture

Keep:
- existing file-reader/session behavior
- no new editor features unless needed for readability

## Accessibility Requirements

Follow WAI-ARIA APG behavior for:
- dialogs
- tabs
- menu buttons
- disclosure sections
- toolbar groups
- splitters
- listbox/select-like controls

Every interactive control must have:
- visible focus state
- keyboard path
- accessible label
- no color-only status communication

Motion must respect `prefers-reduced-motion`.

## Testing and Verification Strategy

Every implementation phase should include:
- targeted Vitest contract tests for changed DOM/CSS/renderer behavior
- `npm run build`
- `npm test`
- visual smoke run of the Electron app
- source search for removed/renamed labels where relevant

For UI-specific phases, add tests that protect:
- no reintroduction of old removed toolbar buttons
- Control Panel labels
- session targeting copy
- modal contract
- menu/preload channel contracts
- browser-left layout behavior
- reduced-motion CSS presence

## Phased Delivery

### Phase 0: Interface Inventory

Create a full UI inventory covering every visible region, control, modal, menu, and panel. Classify each item as:
- keep
- rename
- restyle
- merge
- remove
- needs behavior fix

This prevents random beautification and keeps the redesign surgical.

### Phase 1: Token and Primitive Cleanup

Unify the token system and create shared primitive classes for:
- buttons
- icon buttons
- chips
- section headers
- inputs
- list rows
- popover shells
- modal shells
- focus rings

### Phase 2: Shell and Workspace

Restyle the sidebar, top session strip, workspace container, terminal pane frame, browser pane frame, and mosaic divider system.

### Phase 3: Floating Surfaces

Introduce `@floating-ui/dom` and migrate the most fragile menus/popovers first:
- browser target menu
- inspect element popover
- custom select dropdown
- tab/session context menus

### Phase 4: Control Panel

Rework AI Setup, Changes, Recent Sessions, and Toolchain as a coherent operational inspector.

### Phase 5: Browser Workflow Polish

Make browser inspection and prompt routing feel first-class:
- movable popovers
- selected target session clarity
- compact toolbar grouping
- local dev target list clarity
- send-to-session affordance

### Phase 6: Modal and Preferences System

Make Preferences and shared modals consistent, accessible, and visually premium.

### Phase 7: Final Product Pass

Run a full visual pass across:
- empty state
- active project
- browser + 1 session
- browser + multiple sessions
- terminal-only workspace
- Control Panel open/closed
- Preferences
- Usage Stats
- Readiness modal
- Agents/Skills/Commands document viewer

## Non-Goals

This redesign does not include:
- changing provider launch APIs
- changing PTY/session lifecycle
- replacing `webview`
- rewriting the renderer in React
- adding dashboard analytics unrelated to current workflows
- adding decorative AI branding
- changing core project/session data model unless required by a verified defect in a scoped implementation task

## Risks

Main risks:
- visual polish accidentally changes behavior
- adding a component library creates theme or packaging problems
- spacing increases reduce terminal productivity
- too many gradients make the UI look generic
- popover migration introduces positioning regressions
- accessibility gets worse if custom controls are restyled without keyboard tests

Controls:
- preserve DOM behavior where possible
- make one phase testable at a time
- prefer contract tests before visual refactors
- use Floating UI only where positioning is genuinely complex
- avoid wholesale Web Awesome adoption until a spike proves fit
- run full build/test after every phase

## Success Criteria

The redesign succeeds when:
- Calder feels clearly owned and distinct
- the app no longer reads like a recolored fork
- all primary workflows still behave the same
- browser-left and session-right layout remains stable
- the right Control Panel is more useful and less visually noisy
- inspect/send-to-session flows are easier to understand
- Preferences and modals feel intentional
- the UI is more modern without looking like generic AI SaaS

## Approval State

The selected direction is approved by the user as option 1: Native-first Calder UI System.

The next step is to convert this design into a detailed implementation plan after user review.
