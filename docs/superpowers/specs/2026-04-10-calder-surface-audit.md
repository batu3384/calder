# Calder Surface Audit

Date: 2026-04-10
Scope: renderer shell, workspace chrome, empty states, right-side context surfaces

## Goal

Identify which visible boxes still feel inherited from the previous product shape, decide whether each surface is necessary, and define the next cleanup priorities without changing the working session model.

## Current Surface Map

### 1. Project Rail

Purpose:
- Switch active projects
- Show unread state and live session count
- Hold global creation and preferences actions

Keep:
- Yes

Why:
- This is the only durable workspace navigation surface
- The rail is now structurally separated from operational context, which is correct

Problems:
- When collapsed, the shell loses too much identity
- The current visual density is functional but still slightly utilitarian

Next improvement:
- Let the command deck carry more project identity so the rail can stay minimal

### 2. Command Deck

Purpose:
- Session tabs
- New session action
- Swarm toggle
- Inspector toggle
- Git and spend status

Keep:
- Yes

Why:
- This is the primary operational surface and should remain compact

Problems:
- It still reads like a thin toolbar instead of a workspace command surface
- The active project identity is not visible enough
- The overflow menu is useful but visually disconnected from the rest of the shell

Next improvement:
- Add a visible workspace identity block
- Make the deck feel like the top control surface, not just tab chrome

### 3. Workspace Empty State

Purpose:
- Explain what the user should do when no session is open

Keep:
- Yes, but redesign

Why:
- The empty canvas is one of the first brand impressions

Problems:
- Current copy is too generic
- No direct action exists inside the state
- It feels like a placeholder rather than a deliberate product moment

Next improvement:
- Replace with a branded, action-oriented launch state

### 4. Readiness Card

Purpose:
- Show project health and readiness scan entry point

Keep:
- Yes

Why:
- It is useful product intelligence, especially for project takeover/setup flows

Problems:
- The card logic is useful, but the current accordion styling still feels inherited
- Title and control density are acceptable, but the card needs better visual hierarchy

Next improvement:
- Keep behavior, refine card language and spacing in a later pass

### 5. Git Card

Purpose:
- Surface branch, file counts, worktree selection, staging shortcuts

Keep:
- Yes

Why:
- This is one of the highest-value side surfaces in a desktop coding shell

Problems:
- This is currently the strongest inspector card functionally, but visually still tied to the old card language
- It competes with the top git pill instead of complementing it

Next improvement:
- Treat the top pill as summary and the inspector card as detail

### 6. Activity / History Card

Purpose:
- Resume archived sessions
- Bookmark and filter prior work

Keep:
- Yes

Why:
- It supports long-running project ownership and continuity

Problems:
- When sparse, it can feel like filler
- Header language is plain and less product-defining than the rest of the shell

Next improvement:
- Keep the feature, but sharpen naming and quiet the card when empty or low-signal

### 7. Capabilities Card Group

Purpose:
- Show MCP, agents, skills, commands from the active provider context

Keep:
- Yes, but simplify presentation

Why:
- This is genuinely useful project context, especially for takeover and cleanup work

Problems:
- It is the most “old product” looking area in the new shell
- Four stacked accordions read like a settings dump rather than curated context
- Counts are informative, but the presentation is verbose for everyday use

Next improvement:
- Move toward a more compact stack summary language
- Keep full drill-down behavior, but reduce the feeling of a raw config browser

## What Still Feels Too Close To The Old Product

- The center empty state is generic and weak
- The top chrome still behaves more like a classic toolbar than a strong command surface
- The right inspector cards share one repeated accordion visual system, which makes the whole side feel like a transplanted panel instead of a designed context column

## Priority Order

1. Strengthen workspace identity in the command deck
2. Replace the center empty state with a better launch surface
3. Compact the capabilities area so the inspector feels curated
4. Refine inspector card language and spacing without removing useful behavior

## Guardrails

- Do not break session creation, swarm mode, session history, git actions, or provider config access
- Prefer structural and visual cleanup over feature removal
- Keep the app feeling desktop-native and tool-forward, not like a generic AI dashboard
