# Calder Settings-First Shell Consistency Design

Date: 2026-04-16  
Project: Calder (`/Users/batuhanyuksel/Documents/browser`)

## 1. Problem Statement

The current Calder shell is functionally strong but visually uneven.

The most visible pressure points are:

- the settings experience still feels denser and more stacked than the rest of the app
- shell surfaces use similar patterns with slightly different spacing, hover lift, border tone, and pill density
- some controls feel visually noisy rather than deliberately authored
- language selection does not yet guarantee full Turkish or full English across all user-visible UI
- a few panel and rail interactions are technically working but still feel fragile or visually awkward

The user request is to start from settings, then perform a comprehensive pass across the whole UI system to remove logic mistakes, visual defects, mixed-language output, and anything that feels unpolished or cheap.

## 2. Goals and Non-Goals

### Goals

- Make settings feel clean, readable, and intentional rather than overloaded.
- Establish one consistent Calder shell language across settings, sidebar, top bar, tabs, surfaces, right rail, and shared modals.
- Remove mixed Turkish/English output so each selected locale is fully consistent.
- Reduce visual jitter, excessive hover aggression, and stacked-pill clutter without making the app bland.
- Fix small UI-state inconsistencies discovered during the audit if they directly affect shell quality or predictability.
- Preserve existing user workflows while making the product feel more premium and more trustworthy.

### Non-Goals

- No new navigation model.
- No redesign of project/session concepts.
- No provider orchestration redesign.
- No data-model migration or state schema rewrite.
- No dramatic re-layout of the main workspace.
- No visual drift into generic consumer SaaS styling.

## 3. Approved Product Contract

The approved direction is the middle path:

- not a quick CSS-only sweep
- not a large redesign
- a settings-first consistency and premium polish pass

This means:

- existing Calder identity stays intact
- behavior stays familiar
- weak visual and interaction details get upgraded together
- shell surfaces should look like one authored system instead of a set of individually polished pieces

## 4. Options Considered

### Option A - Quick Cleanup

Limit the work to CSS cleanup, spacing fixes, and string sweeps.

Pros:

- lowest regression risk
- fastest execution

Cons:

- leaves structural awkwardness in settings
- likely preserves several “works but feels off” surfaces

### Option B - Settings-First Consistency + Premium Polish (Recommended)

Use settings as the anchor surface, then normalize the rest of the shell around that refined language.

Pros:

- strongest balance between quality and safety
- solves both visual inconsistency and small shell-logic roughness
- preserves current architecture and workflows

Cons:

- broader test surface than a pure style pass

### Option C - Partial Redesign

Rebuild settings information architecture and substantially reshape shell composition.

Pros:

- largest visual jump

Cons:

- materially higher regression risk
- likely to disturb established user habits

## 5. Recommended Architecture

### 5.1 Settings as the Anchor Surface

The settings modal becomes the reference surface for shell quality.

The pass should improve:

- menu readability and constrained-height behavior
- section hierarchy and introduction blocks
- card spacing, form rhythm, and note styling
- visual density in the integrations area
- modal body scrolling boundaries
- locale-complete strings for every user-visible setting label, description, status, and action

The goal is not to remove information. The goal is to present the same information with lower visual noise and clearer grouping.

### 5.2 Shell Language Normalization

Shared shell decisions should be normalized across these renderer surfaces:

- sidebar
- top bar and tab strip
- browser surface chrome
- CLI surface chrome
- right rail reopen affordance and surrounding controls
- shared modal shells

The normalization should cover:

- spacing scale
- corner radius usage
- border and divider tone
- hover motion and active-state motion
- chip, badge, and pill density
- heading, caption, and support-copy hierarchy

This is a system pass, not a set of isolated micro-fixes.

### 5.3 Motion and Interaction Tone

Current shell motion includes small lifts, transforms, and emphasis shifts that sometimes feel more restless than premium.

The new motion rule:

- active states should feel stable
- hover states should feel precise, not floaty
- controls should not shift enough to look misaligned
- state transitions should clarify hierarchy, not compete for attention

Where a hover transform or offset creates jitter, the transform should be softened or removed.

### 5.4 Language Consistency Contract

Locale selection must become strict.

Rules:

- Turkish selected -> all supported UI strings in Turkish
- English selected -> all supported UI strings in English
- no mixed caption/button/status combinations inside the same locale
- tone should remain consistent across settings, shell labels, helper text, and control copy

Implementation should favor extending existing i18n coverage rather than adding more hardcoded strings.

### 5.5 Behavior Preservation Boundary

This pass should not change core behavior in these protected areas:

- session lifecycle
- provider selection semantics
- browser and CLI surface core routing model
- project and session state shape
- main shell layout skeleton

Behavior changes are only allowed when they are direct fixes for shell-quality issues, such as:

- reopening a hidden rail reliably
- ensuring section scroll boundaries behave correctly
- preventing UI state from feeling stuck or visually broken

### 5.6 Targeted Code-Shaping Improvements

The settings modal already carries a large amount of responsibility.

This pass may include focused refactoring where it directly supports clarity and safety:

- extracting repeated section-building helpers
- reducing duplicated card or note construction
- isolating locale-sensitive copy generation
- tightening cleanup paths for modal-local controls or listeners

These improvements must stay tightly scoped to the approved UI work. No unrelated refactor is allowed.

## 6. Surface-by-Surface Design Rules

### 6.1 Settings

- menu remains a clear navigation rail, not a crowded sidebar
- active menu item styling must feel anchored rather than nudged
- long sections must remain scrollable without trapping or clipping content
- integrations content should be visually grouped into calmer sub-blocks
- cards should read as operational modules, not stacked marketing tiles

### 6.2 Sidebar

- active project emphasis should feel crisp and authored
- hover states should not create jumpy row motion
- footer controls should align with the rest of the shell language
- collapsed state should remain obvious and recoverable

### 6.3 Top Bar and Tabs

- session tabs, browser tabs, CLI surface tab, and action buttons should read as one control family
- selected state must be easy to parse at a glance
- pills and borders should not visually pile up
- update and session controls should align with the same spacing and height rhythm

### 6.4 Browser and CLI Surfaces

- top control rows should feel organized, not stacked by accident
- cluster spacing should make tool groups legible
- shell chrome should frame the content without overpowering it
- active surface state should be clear without over-accenting

### 6.5 Right Rail and Shared Modals

- hidden/visible transitions should feel dependable
- reopen affordance should be noticeable but not loud
- modal spacing and text hierarchy should match the refined shell system

## 7. Error Handling and Regression Strategy

- Preserve IDs, data attributes, and event hooks where possible.
- Prefer class and token refinement over broad DOM restructuring.
- Where DOM changes are needed for clarity, keep event ownership explicit and local.
- If a section needs structural cleanup, do it behind existing state contracts.
- Any interaction bug discovered during the pass must be root-caused before changing behavior.

## 8. Testing Strategy

Implementation must stay test-first for every behavior change.

Coverage focus:

- settings modal layout and section behavior contracts
- locale consistency contracts
- tab and surface visibility contracts
- right rail reopen and shell layout behavior
- renderer build and type safety

Verification should include:

- targeted vitest runs for changed renderer components
- `npx tsc -p tsconfig.main.json`
- `npx tsc -p tsconfig.preload.json`
- `npm run build:renderer`

Where a user-visible issue is visual but contract-testable, add or extend the narrowest possible renderer test first.

## 9. Implementation Boundaries

Expected primary touch points:

- `src/renderer/components/preferences-modal.ts`
- `src/renderer/styles/preferences.css`
- `src/renderer/components/sidebar.ts`
- `src/renderer/styles/sidebar.css`
- `src/renderer/components/tab-bar.ts`
- `src/renderer/styles/tabs.css`
- `src/renderer/components/context-inspector.ts`
- `src/renderer/styles/context-inspector.css`
- shared renderer shell styles and i18n files as needed

Possible supporting files:

- `src/renderer/index.html`
- `src/renderer/index.ts`
- `src/renderer/i18n.ts`
- narrowly scoped renderer contract tests

## 10. Success Criteria

This pass is successful when:

- settings feels substantially cleaner and easier to scan
- the shell reads as one consistent Calder interface
- Turkish and English are each complete in their own mode
- active, hover, and collapsed states feel stable and intentional
- no protected workflows are broken
- the app feels more premium without feeling redesigned for its own sake
