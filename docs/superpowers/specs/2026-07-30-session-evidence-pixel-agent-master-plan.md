# Calder Session Evidence & Pixel Agent Live — Master Planning Prompt

<!-- markdownlint-disable MD013 -->

> **Usage:** Copy the complete prompt below into the coding agent that has access to the current Calder repository. This is a planning-only task. The agent must inspect the actual repository and return a design document; it must not implement the feature.

---

## Master Prompt

You are acting as a principal software architect, product engineer, security engineer, UX architect, and technical program manager for the **Calder** repository.

Your task is to inspect the current Calder codebase and prepare a professional, implementation-ready plan for two connected capabilities:

1. **Session Evidence & Policy** — a local-first, trustworthy record of what happened during an AI coding session.
2. **Pixel Agent Live** — an optional pixel-art visualization driven exclusively by sanitized Session Evidence events.

The broader product concept may later be called **Agent Evidence Gateway**, but the first version MUST remain a bounded feature inside Calder. Do not create a separate repository, service, daemon, SaaS product, or mandatory external dependency.

## Non-negotiable instruction: planning only

**DO NOT WRITE OR MODIFY CODE.**

For this task:

- Do not edit repository files.
- Do not create implementation files or assets.
- Do not install or update dependencies.
- Do not modify `package.json` or lockfiles.
- Do not create branches, commits, pull requests, releases, or tags.
- Do not refactor existing code.
- Do not run destructive commands.
- Do not begin implementation after producing the plan.

Your only deliverable is a detailed, repository-aware planning and design document. Small illustrative JSON/YAML fragments are allowed only to clarify conceptual contracts. Do not provide production TypeScript, HTML, CSS, or animation code.

---

## 1. Product context

Calder is an Electron and TypeScript application for orchestrating multiple AI coding CLI sessions. It appears to support providers such as Claude Code, OpenAI Codex CLI, GitHub Copilot CLI, Antigravity, and Qwen Code.

The repository already appears to contain:

- PTY and session orchestration,
- provider-specific adapters, hooks, and session watchers,
- Session Inspector activity and insight surfaces,
- session status and lifecycle tracking,
- token, context, and cost telemetry,
- Git status and file watchers,
- project governance and auto-approval policies,
- checkpoints, reviews, tasks, and workflows,
- project/global/session settings,
- local persistence,
- preload and IPC boundaries,
- English and Turkish localization,
- contract and behavior tests,
- documented architecture guardrails.

Do not assume this list is exact. Verify every relevant capability against the current repository.

The new feature should answer:

> What happened during this AI coding session, what evidence supports that account, what changed during the session window, what risks and policy decisions occurred, and is the result ready for human review?

Pixel Agent Live should answer the same question visually:

> What verifiable type of activity is the agent currently performing, according to the evidence Calder can safely observe?

Neither capability may claim perfect operating-system-level observation or access to a model's hidden reasoning.

---

## 2. Mandatory repository audit

Before proposing architecture, inspect the current repository. At minimum inspect these files and areas, plus any related files discovered while tracing ownership:

### Root and documentation

- `README.md`
- `HOOKS.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `.calderignore`
- `.env.example`
- `.nvmrc`
- `package.json`
- `vitest.config.ts`
- `docs/architecture-guardrails.md`
- `docs/development-workflow.md`
- `docs/reports/`
- `docs/superpowers/`

### Main process

- `src/main/pty-manager.ts`
- `src/main/store.ts`
- `src/main/git-status.ts`
- `src/main/git-watcher.ts`
- `src/main/file-watcher.ts`
- `src/main/session-permission-policy.ts`
- `src/main/external-hook-policy.ts`
- `src/main/settings-guard.ts`
- `src/main/claude-cli.ts`
- `src/main/claude-event-hook-template-source.ts`
- `src/main/claude-event-hook-template.ts`
- `src/main/claude-mcp-config.ts`
- `src/main/codex-hooks.ts`
- `src/main/codex-session-watcher.ts`
- `src/main/copilot-session-watcher.ts`
- `src/main/antigravity-hooks.ts`
- `src/main/qwen-hooks.ts`
- `src/main/calder-governance/`
- `src/main/calder-reviews/`
- `src/main/calder-checkpoints/`
- `src/main/calder-tasks/`
- `src/main/calder-workflows/`
- `src/main/providers/`
- `src/main/hooks/`
- `src/main/security/`
- preload bridge and IPC registration files

### Shared contracts

- `src/shared/types-session.ts`
- `src/shared/types-provider.ts`
- `src/shared/types-governance.ts`
- `src/shared/types-project.ts`
- `src/shared/types.ts`
- `src/shared/project-governance.contract.test.ts`
- `src/shared/tracking-health.ts`

### Renderer

- `src/renderer/session-activity.ts`
- `src/renderer/session-cost.ts`
- `src/renderer/session-insights.ts`
- `src/renderer/session-inspector-state.ts`
- `src/renderer/project-governance-sync.ts`
- `src/renderer/project-review-sync.ts`
- `src/renderer/project-review-actions.ts`
- `src/renderer/state.ts`
- `src/renderer/state-appstate-core.ts`
- `src/renderer/state-appstate-runtime.ts`
- `src/renderer/state-session-factory.ts`
- `src/renderer/state-session-ops.ts`
- `src/renderer/i18n.ts`
- `src/renderer/i18n-translations.ts`
- translation split files and localization contract tests
- `src/renderer/components/`
- `src/renderer/insights/`
- `src/renderer/styles/`
- `src/renderer/index.html`

Search the repository for concepts including:

- `InspectorEvent`
- `PreToolUse`
- `PostToolUse`
- `PermissionRequest`
- `PermissionDenied`
- `approval_decision`
- `auto_approval`
- `tool_input`
- `file_changed`
- `config_change`
- `session_end`
- tracking health
- provider capabilities
- project/session/global policy precedence
- session archive and recovery
- runtime `.events`, `.status`, `.cost`, and `.toolfailure` data
- Git watcher ownership
- cost/context telemetry
- review and checkpoint ownership
- preload exposure
- IPC handler registration
- Electron `userData`
- renderer event subscriptions
- architecture/file-size audits

For every relevant subsystem, record:

- current owner,
- current contract,
- what can be reused unchanged,
- what should be extended,
- what must remain separate,
- missing capability,
- architectural risk,
- tests that already protect it.

Do not propose a new manager or store until existing ownership boundaries have been mapped.

---

## 3. Required planning document structure

Return one cohesive design document with these top-level sections:

1. Executive Summary
2. Current-State Audit
3. Existing Components to Reuse
4. Product Definition and Terminology
5. Target Users and User Stories
6. Goals and Success Criteria
7. Explicit Non-Goals
8. Trust, Evidence, and Attribution Model
9. Provider Capability and Confidence Matrix
10. Functional Requirements
11. Policy Model and Precedence
12. Evidence Event Taxonomy and Domain Model
13. Session Evidence Lifecycle
14. Git Baseline and Change-Evidence Strategy
15. Secret Redaction and Safe-Data Rules
16. Persistence, Retention, Deletion, and Recovery
17. JSON and Human-Readable Report Design
18. Session Inspector UX
19. Pixel Agent Live UX and Visual State Machine
20. Main/Preload/Renderer Boundaries and IPC
21. Proposed Module Ownership and Dependency Direction
22. Conceptual Data Contracts
23. Error and Degraded-Mode Behavior
24. Security Threat Model
25. Privacy Model
26. Performance Budgets
27. Accessibility and Localization
28. Cross-Platform Considerations
29. Testing Strategy
30. Migration and Backward Compatibility
31. Delivery Phases and Pull Request Breakdown
32. Acceptance Criteria and Definition of Done
33. Proposed File Map
34. Risks, Open Questions, and Decisions Requiring Approval
35. Final MVP Recommendation
36. Go/No-Go Checklist

The plan must be specific to Calder. Avoid generic enterprise architecture language.

For each major recommendation:

- name the existing Calder component involved,
- state whether it is reused, extended, or left unchanged,
- identify likely affected files/directories,
- explain the dependency direction,
- identify tests required,
- classify it as MVP, later phase, or non-goal,
- state any uncertainty and how to verify it.

---

## 4. Product definition

### 4.1 Session Evidence

Working user-facing name: **Session Evidence**.

Possible settings or inspector label: **Evidence & Policy**.

It is a local record of supported Calder/provider events, policy decisions, Git observations, evidence limitations, and human review annotations for one Calder session run.

The broader term **Agent Evidence Gateway** may describe the future provider-neutral core, but do not expose or extract it as a standalone product in the MVP.

### 4.2 Pixel Agent Live

Working user-facing name: **Pixel Agent Live**.

Settings label: **Pixel Mode**.

It is an optional renderer visualization of sanitized, normalized Session Evidence activity. It is not a second telemetry pipeline, not a terminal parser, and not a representation of hidden model reasoning.

### 4.3 Product principles

1. **Local-first:** no cloud account, hosted control plane, or automatic upload.
2. **Evidence before claims:** UI language must reflect what was actually observed.
3. **Provider honesty:** providers may have different coverage and enforcement abilities.
4. **Reuse governance:** do not build a competing policy engine.
5. **Append-oriented evidence:** raw event history is not silently rewritten.
6. **Privacy by default:** do not store full prompts, terminal transcripts, file contents, or secrets by default.
7. **Graceful degradation:** incomplete tracking must be visible, not disguised.
8. **No PTY disruption:** evidence and animation failures should not freeze interactive work.
9. **Bounded architecture:** avoid turning `pty-manager.ts`, `state.ts`, or other global files into feature dumping grounds.
10. **Accessible visualization:** Pixel Mode must never be required to understand session state.

---

## 5. Target users and user stories

Plan for at least these users:

- an individual developer using multiple AI coding CLIs,
- a security-conscious local-first developer,
- a maintainer reviewing an agent-assisted change,
- a developer comparing provider observability,
- a future small team that may need exportable review evidence without surveillance.

Include user stories such as:

- As a developer, I can see what kind of activity the agent is currently performing based on direct or observed evidence.
- As a developer, I can understand whether a risky action was allowed, approved, denied, blocked, or only warned about.
- As a reviewer, I can distinguish pre-existing Git changes from changes observed during the session.
- As a reviewer, I can inspect evidence completeness and known blind spots.
- As a privacy-conscious user, I can use the feature without storing full prompts or terminal transcripts.
- As a user, I can export a sanitized report explicitly.
- As a user, I can disable animation or use reduced motion without losing information.
- As a user, I can mark a session pending, approved, rejected, or needing changes without altering historical evidence.

---

## 6. Exact MVP scope

The Session Evidence MVP should do only the following:

1. Normalize existing provider hooks/watchers and Calder-originated events into a common safe event envelope.
2. Record relevant policy and approval decisions already produced by Calder governance.
3. Capture a Git baseline at session start.
4. Capture and compare final Git state at session end.
5. Distinguish pre-existing dirty state from session-window observations.
6. Redact secrets before persistence, IPC, rendering, logging, and export.
7. Store normalized evidence locally.
8. Present a live evidence timeline in or adjacent to the existing Session Inspector.
9. Generate a deterministic session summary.
10. Show provider coverage, capture confidence, tracking health, and known gaps.
11. Allow local human-review status and notes.
12. Export sanitized JSON and one human-readable report format on explicit user request.
13. Provide a compact Pixel Agent Live visualization driven by normalized events, with approximately 8–10 essential states.

### Recommended MVP visual states

- idle
- preparing
- reading/searching project
- researching web
- editing code
- running command
- running tests/build
- checking Git
- waiting for approval
- blocked/failed
- completed

The plan may consolidate these to remain within 8–10 states if it preserves clarity.

---

## 7. Explicit non-goals

The MVP must not implement:

- a separate Agent Evidence Gateway repository,
- a hosted SaaS service,
- organization accounts or employee monitoring,
- cloud synchronization or automatic evidence upload,
- full operating-system auditing,
- kernel/eBPF tracing,
- universal process or network monitoring,
- keylogging or screen recording,
- full terminal transcript persistence,
- full prompt persistence by default,
- complete file-access monitoring,
- attribution of every Git change to an agent,
- universal sandboxing or provider-independent blocking,
- legal/compliance certification claims,
- opaque AI-generated developer trust/productivity scores,
- automatic rollback, commit, pull request, or remote sharing,
- a generic command parser based only on PTY text,
- full Pixel Studio, themes, character customization, or complex multi-agent scenes in the first MVP.

List useful deferred items separately without allowing them to expand the MVP.

---

## 8. Trust, evidence, and attribution model

Design an explicit trust model for every evidence record.

### Evidence sources

Evaluate at least:

- `provider_hook`
- `provider_session_log`
- `calder_pty`
- `calder_governance`
- `calder_git`
- `calder_runtime`
- `user_annotation`
- `derived_summary`
- `external_adapter`

### Capture confidence

Use clear provider-neutral levels such as:

- `verified` — Calder itself produced/enforced the event or received a strongly correlated structured event.
- `provider_reported` — provider hook/log reported it, but Calder did not independently verify the underlying action.
- `inferred` — derived from timing, category, or state; not authoritative.
- `unavailable` — the provider or runtime cannot expose the information.

If a different vocabulary fits current Calder contracts better, recommend it and explain the mapping.

### Attribution rules

Define exactly what UI/report language is allowed:

- Structured provider hook: “Provider reported that the tool was requested.”
- Calder governance decision: “Calder allowed/asked/blocked the operation.”
- Git delta: “Change observed during the session window.”
- User review: “User-recorded review annotation.”
- Inference: must be labeled as inferred and must never be presented as verified fact.

Do not state “the agent changed this file” unless a structured provider event reliably correlates the operation to that path. Even then, distinguish provider-reported attribution from independent verification.

### Hidden reasoning rule

Pixel Agent Live must never claim to display chain-of-thought or hidden reasoning.

Avoid definitive labels such as:

- “The AI is thinking.”
- “The model decided internally.”

Use honest alternatives:

- “Preparing”
- “Evaluating the task”
- “Agent working”
- “Waiting for structured activity”
- “Planning stage reported by provider” — only if explicitly reported

When no direct event exists, show a neutral `unknown_working` or idle state and explain the limitation.

---

## 9. Provider capability matrix

Inspect and compare at least:

- Claude
- Codex
- Copilot
- Antigravity
- Qwen

Verify, do not assume, support for:

- session start/end,
- prompt-submitted metadata,
- pre-tool-use,
- post-tool-use,
- structured tool name/input,
- tool success/failure,
- permission request/result,
- file-change event,
- subagent/task event,
- context compaction,
- cost/token/context telemetry,
- provider session ID,
- MCP invocation visibility,
- enforceable pre-execution policy,
- advisory-only policy,
- Git baseline independent of provider.

Design a reusable capability contract rather than scattered provider-name conditionals.

For every capability distinguish:

- supported and enforceable,
- supported but observable only,
- partially supported,
- unavailable,
- unknown pending verification.

Define an evidence coverage calculation, for example:

- full,
- partial,
- minimal,
- unavailable.

Coverage must be derived from declared capability plus runtime tracking health—not provider reputation or optimistic assumptions.

Recommend the first reference provider. Claude is the expected candidate because its hooks appear richer, but confirm this from current code.

---

## 10. Policy model and precedence

Reuse and extend Calder’s existing governance, operation classifier, auto-approval policy/orchestration, and enforcement behavior. Do not create a second policy engine.

Verify actual policy precedence from code. Expected conceptual levels may include:

- global,
- project,
- session,
- fallback/default.

Reuse current operation categories where possible, such as:

- edit,
- safe tool,
- risky tool,
- destructive,
- unknown.

Distinguish policy intent from enforcement result.

### Policy intent

Use existing Calder terminology if canonical. If a new evidence-facing vocabulary is needed, map cleanly between:

- `allow`
- `warn`
- `require_approval`
- `deny`

and existing governance decisions such as:

- allow,
- ask,
- block.

Do not change established governance semantics merely to satisfy a display label.

### Enforcement outcomes

Evidence must distinguish:

- allowed and enforced,
- approval requested,
- approved by user,
- denied by user,
- blocked by Calder before execution,
- denied by provider,
- advisory warning only,
- attempted enforcement unavailable,
- outcome unknown.

### Policy examples to evaluate

- reading `.env` requires approval,
- accessing `~/.ssh` is blocked,
- force push requires approval,
- destructive filesystem commands are blocked,
- network calls may require approval,
- read-only project inspection is allowed,
- writes outside project root are blocked or require approval,
- unknown MCP server usage requires approval.

For every example classify it as:

- enforceable in MVP,
- record/advisory only,
- deferred.

Recommend a safe default that does not unexpectedly break current Calder workflows. The likely default is observe/advisory, with strict enforcement only where current provider-native mechanisms are reliable and tested.

---

## 11. Provider-neutral evidence taxonomy

Design a stable normalized event taxonomy. Evaluate at least:

- `session_started`
- `session_resumed`
- `prompt_submitted`
- `tool_requested`
- `tool_started`
- `tool_completed`
- `tool_failed`
- `permission_requested`
- `permission_approved`
- `permission_denied`
- `operation_blocked`
- `policy_decision`
- `file_change_reported`
- `git_state_captured`
- `git_change_observed`
- `cwd_changed`
- `config_changed`
- `subagent_started`
- `subagent_completed`
- `task_created`
- `task_completed`
- `context_compaction_started`
- `context_compaction_completed`
- `cost_snapshot`
- `tracking_health_changed`
- `session_completed`
- `session_failed`
- `session_interrupted`
- `session_ended`
- `pty_exited`
- `export_created`
- `review_status_changed`
- `review_note_added`

Do not keep unnecessary event types merely because they are listed here. Consolidate where current contracts justify it.

Review annotations and export history should remain logically separate from immutable provider/runtime evidence, even if they share a common display timeline.

### Conceptual event envelope

Describe fields precisely, including:

- schema version,
- event ID,
- Calder session ID,
- provider ID,
- provider CLI session ID if known,
- project ID/path reference,
- event type,
- original provider event name,
- wall-clock timestamp,
- monotonic sequence number,
- source,
- confidence,
- tool/operation name,
- sanitized operation metadata,
- sanitized path metadata,
- policy-decision reference,
- risk classification,
- result/outcome,
- safe error category,
- redaction metadata,
- parent event ID,
- subagent/task ID,
- optional integrity metadata.

Define idempotency, duplicate handling, out-of-order behavior, and unknown future event handling.

---

## 12. Session evidence lifecycle

Plan the complete lifecycle.

### Before session spawn

- resolve project/provider,
- evaluate provider capabilities,
- resolve effective governance policy,
- create evidence-run identity,
- capture hook/tracking health,
- capture Git baseline and pre-existing dirty state,
- initialize sequence/deduplication state,
- prepare local persistence without blocking startup unnecessarily.

### During session

- ingest structured provider events,
- ingest Calder governance decisions,
- ingest safe runtime and telemetry events,
- normalize,
- validate and bound payloads,
- redact,
- persist asynchronously,
- broadcast only sanitized renderer data,
- update counters, timeline, health, and visual state,
- avoid writing on the PTY hot path synchronously.

### Completion or PTY exit

- flush bounded queues,
- capture final Git state,
- compare against baseline,
- generate deterministic summary,
- record known gaps,
- mark final completion state,
- expose review/export actions,
- do not export automatically.

### Crash/interruption recovery

- recover an unfinished evidence run,
- label it interrupted/incomplete,
- never fabricate a clean session-end event or final Git snapshot,
- make it inspectable after restart.

### Resumed provider conversations

Recommend a safe MVP boundary. Preferred default:

- each Calder PTY run creates a separate evidence run,
- resumed runs may link to the same provider conversation/session ID,
- raw histories are not silently merged.

Verify compatibility with current session semantics.

---

## 13. Git evidence strategy

At session start, capture where available:

- repository root,
- worktree path,
- branch or detached HEAD state,
- HEAD commit,
- staged paths,
- unstaged paths,
- untracked paths,
- pre-existing dirty state,
- submodule state only if already practical.

At session end capture:

- final branch and HEAD,
- staged/unstaged/untracked paths,
- added/modified/deleted/renamed classifications,
- bounded additions/deletions counts where reliable,
- whether HEAD moved,
- whether commits appeared,
- worktree-change summary.

Critical wording:

> “Observed during the session window.”

Do not automatically say:

> “Changed by the agent.”

Address:

- manual user edits during the session,
- other local processes,
- multiple Calder sessions in one working tree,
- Git worktrees,
- non-Git projects,
- dirty starting state,
- rename/delete behavior,
- binary and generated files,
- ignored files,
- large repositories and diffs,
- secrets in diffs,
- diff truncation,
- Git command timeout/failure.

Prefer bounded metadata and summaries over storing complete diffs. Decide whether full diff export is optional or deferred; it should not be default MVP persistence.

---

## 14. Redaction and safe persistence

Design one centralized redaction pipeline that executes before:

- persistence,
- logs,
- IPC broadcast,
- renderer display,
- Pixel Mode context,
- export.

The renderer must never be the security boundary.

Cover:

- API keys and bearer tokens,
- authorization headers,
- cookies/session tokens,
- private keys,
- passwords,
- credential-bearing database URLs,
- cloud credentials,
- GitHub tokens,
- SSH private material,
- environment-variable values,
- secrets in tool inputs,
- sensitive URL query parameters,
- secrets in error messages,
- secrets in Git diffs,
- home-directory/path privacy.

Distinguish:

1. field removal,
2. masking,
3. safe hashing for correlation,
4. key-name-only storage,
5. safe path classification.

Redaction metadata may contain safe type/count information but never original values.

Plan defenses for:

- nested objects and arrays,
- command strings,
- URLs,
- malformed/unexpected payloads,
- extremely large values,
- terminal escape sequences,
- untrusted provider text.

Do not persist full prompt text by default. Prompt evidence should normally be limited to timestamp, event presence, optional character count, and optional user-created safe label.

Do not persist full terminal output by default.

---

## 15. Persistence, retention, deletion, and recovery

Inspect current Calder storage/runtime conventions before selecting storage.

Evidence must not pollute project repositories or produce Git changes. Prefer an application-owned location under Electron `userData` or an established Calder data directory.

Evaluate:

- append-only JSONL per evidence run,
- versioned JSON documents,
- SQLite,
- reuse/extension of an existing Calder store.

Choose based on:

- existing dependencies,
- crash recovery,
- append behavior,
- expected queries,
- migration/versioning,
- corruption risk,
- export needs,
- operational complexity.

Do not introduce a database dependency unless actual requirements justify it.

Define conceptual storage for:

- run metadata,
- normalized event log,
- derived summary,
- review annotations,
- export metadata,
- schema version,
- recovery markers.

Plan the smallest useful MVP retention controls:

- keep until manually deleted,
- delete one run,
- delete all evidence with clear confirmation,
- show approximate storage usage.

Time-based retention and disk quotas may be phased later if not necessary for MVP. No automatic remote backup.

Discuss whether append-only hash chaining/tamper evidence belongs in MVP, phase 2, or post-MVP. Never call the system tamper-proof unless that is actually achieved.

---

## 16. Session summary and exports

The deterministic session summary should include, where available:

- Calder session/evidence-run identity,
- provider and provider-session identity,
- project and safe path representation,
- start/end/duration,
- completion/interruption state,
- starting/final Git state,
- pre-existing dirty files,
- session-window changed paths,
- tool-call/failure/approval/block counts,
- policy profile and decision summary,
- observed tests/checks and their confidence,
- token/context/cost totals,
- redaction counts,
- tracking health and completeness warnings,
- human-review status,
- export metadata/integrity digest if applicable.

Support explicit export of:

1. sanitized machine-readable JSON,
2. one sanitized human-readable format: Markdown or HTML.

Choose the first human-readable format based on existing Calder report patterns. If HTML is chosen, require safe escaping and no executable content from provider data.

The human-readable report should include:

1. Session Overview
2. Evidence Coverage
3. Risk and Policy Summary
4. Timeline
5. Tools and Failures
6. Git Changes Observed
7. Cost and Context
8. Human Review
9. Known Limitations
10. Redaction Statement

Include a disclaimer equivalent to:

> This report reflects events available to Calder through provider hooks, Calder runtime observations, governance decisions, and Git snapshots. It is not an operating-system audit and may not capture activity outside supported observation paths.

Export must be explicitly initiated by the user and must never contain unredacted raw data.

---

## 17. Session Inspector UX

Prefer extending the existing Session Inspector instead of adding an unrelated top-level product area.

Evaluate an information architecture such as:

- Activity
- Evidence
- Changes
- Cost/Context
- Review

Do not force this exact tab structure if current UI patterns suggest a better design.

### Active-session state

Show:

- evidence coverage: full/partial/minimal/unavailable,
- tools/failures/approvals/blocked counters,
- files observed,
- safe cost estimate where available,
- compact live event timeline,
- compact Pixel Agent Live if enabled.

### Completed-session state

Show:

- deterministic summary,
- risk/policy overview,
- Git observations,
- evidence coverage and limitations,
- review status,
- explicit export action.

### Degraded state

Explain impact rather than only displaying an error code.

Example:

> Tool activity is only partially available for this provider. Git changes can still be compared, but Calder may not attribute them to individual tool calls.

Cover missing hooks, non-Git projects, unavailable cost tracking, persistence failures, unsupported enforcement, and interrupted sessions.

### Event detail

Display only sanitized information:

- timestamp,
- event type,
- source,
- confidence,
- tool/operation category,
- policy result,
- safe metadata,
- related events,
- redaction notice.

### Human review

Support:

- pending review,
- approved,
- approved with notes,
- rejected,
- needs changes,
- local optional reviewer label,
- review timestamp,
- notes stored separately from raw evidence.

---

## 18. Pixel Agent Live

### 18.1 Core rule

Pixel Agent Live must consume only sanitized, normalized Session Evidence events. It must not parse raw PTY output, access unredacted tool input, or create a second provider-specific telemetry path.

Required data flow:

```text
Provider hook/session watcher
        ↓
Normalized evidence event
        ↓
Validation and redaction
        ↓
Evidence persistence + safe renderer event
        ↓
Visual state resolver
        ↓
Pixel Agent Live animation
```

### 18.2 Provider-neutral visual activity model

Design a small visual state taxonomy such as:

- `idle`
- `preparing`
- `unknown_working`
- `reading_project`
- `searching_project`
- `researching_web`
- `reading_file`
- `editing_code`
- `running_command`
- `running_tests`
- `building`
- `checking_git`
- `using_mcp`
- `waiting_for_approval`
- `blocked`
- `failed`
- `completed`
- `interrupted`

Consolidate states when needed. Tool-name checks must not be scattered through renderer components. Plan a central event-to-visual-state resolver with provider/tool mapping at an appropriate boundary.

For every visual state define conceptually:

- animation/state identifier,
- Turkish and English safe label,
- evidence source,
- confidence requirement,
- start timestamp,
- optional sanitized context,
- minimum display duration,
- maximum stale duration,
- fallback state,
- transition priority,
- reduced-motion representation.

### 18.3 Example event mapping

Plan mappings such as:

| Evidence category      | Pixel scene                 | Safe label                      |
| ---------------------- | --------------------------- | ------------------------------- |
| Session start          | Agent arrives at desk       | Preparing session               |
| Prompt metadata        | Agent reads task board      | Evaluating task                 |
| Project search         | Magnifier/file cabinet      | Searching project               |
| Web search/fetch       | Browser station             | Researching the web             |
| File read              | Document/code viewer        | Reading files                   |
| File edit/write        | Typing at workstation       | Editing code                    |
| Shell/tool execution   | Terminal station            | Running command                 |
| Test command           | Test laboratory             | Running tests                   |
| Build command          | Gears/build station         | Building project                |
| Git status/diff        | Change board                | Checking changes                |
| Permission request     | Security gate/raised hand   | Waiting for approval            |
| Block/deny             | Shield/closed gate          | Operation blocked               |
| Tool failure           | Error indicator             | Operation failed                |
| Subagent start         | Additional worker           | Subtask started                 |
| Session completion     | Checkmark/short celebration | Session completed               |
| No structured activity | Neutral idle/working pose   | Waiting for structured activity |

Mappings are illustrative. Verify which categories can be derived reliably from existing events.

### 18.4 Display preferences

Plan three user preferences:

1. **Off** — no pixel visualization.
2. **Compact** — small animated agent near session status with short text.
3. **Studio** — richer workspace in Session Inspector.

The MVP should include Off and Compact. Studio should be a later phase unless the audit proves it can be delivered without delaying core evidence reliability.

### 18.5 Studio concept for later phase

A possible pixel workspace contains:

- terminal workstation,
- browser/research station,
- files/document area,
- test/build station,
- Git/change board,
- policy/security gate,
- optional subagent desks.

The character moves only when a reliable visual-state transition occurs. Do not replay every event as a separate animation.

### 18.6 Multiple agents and subagents

Defer rich multi-agent scenes beyond the first Pixel Mode release. Later design may:

- display the main agent at the primary desk,
- add workers for supported structured subagent events,
- group excess workers as `+N active subtasks`,
- avoid showing sensitive task content,
- never invent subagents for providers that do not report them.

### 18.7 Visual transition priority

Plan deterministic priority. A reasonable starting order is:

```text
waiting_for_approval / blocked
    > failed
    > active tool operation
    > test/build/Git activity
    > preparing/unknown_working
    > idle
```

Approval, block, and failure states should interrupt lower-priority decorative animation. Define behavior for event bursts, out-of-order completion, simultaneous subagents, and stale events.

### 18.8 Performance and accessibility

Pixel Mode must:

- update on normalized state changes, not every PTY character,
- debounce/batch bursts,
- cap animation frequency,
- pause or reduce background-session animation,
- support `prefers-reduced-motion`,
- provide static icon/text alternatives,
- remain keyboard accessible,
- provide screen-reader live status without noisy repetition,
- avoid conveying meaning by color alone,
- preserve full functionality when disabled,
- never block evidence persistence or PTY rendering.

Define an explicit performance budget and rendering strategy based on the existing renderer stack. Evaluate CSS sprites, canvas, SVG, or another approach without implementing assets. Select based on current dependencies, accessibility, bundle size, and maintainability.

---

## 19. Main, preload, renderer, and IPC boundaries

### Main process responsibilities

- provider/runtime event ingestion,
- normalization and validation,
- governance-decision correlation,
- redaction,
- local persistence,
- Git snapshots/comparison,
- deterministic summary,
- recovery, retention, deletion, and export,
- sanitized renderer event publication.

### Preload responsibilities

- narrow typed bridge,
- bounded queries and subscriptions,
- no broad filesystem access,
- no arbitrary command execution,
- no direct raw evidence-file exposure.

### Renderer responsibilities

- safe state presentation,
- timeline filtering and virtualized display,
- review interactions,
- export request initiation,
- visible limitations and health,
- event-to-visual-state resolution if safe contracts support it,
- pixel animation and accessibility behavior.

Decide whether the visual-state resolver belongs in shared or renderer. It must never require raw unredacted input.

List conceptual IPC operations, including:

- get evidence summary,
- list/paginate sanitized events,
- subscribe/unsubscribe to safe updates,
- get evidence health,
- update review annotation,
- request export,
- delete one evidence run,
- delete all evidence,
- get/update evidence settings,
- get storage usage.

For each operation define:

- caller,
- input validation,
- authorization/trust boundary,
- conceptual return value,
- error behavior,
- security considerations,
- pagination/bounds where needed.

---

## 20. Proposed bounded architecture

Prefer a bounded main-process module such as:

```text
src/main/calder-evidence/
```

or a repository-conventional equivalent.

Possible responsibilities—not mandatory filenames—include:

- session lifecycle coordinator,
- provider-event normalizer,
- redaction service,
- evidence store,
- Git evidence adapter,
- summary builder,
- health/completeness evaluator,
- export service,
- recovery/retention service.

Shared evidence contracts should live under `src/shared/` and must not be duplicated in renderer.

Renderer concerns should follow existing decomposition conventions, potentially separating:

- state/selectors,
- sync/subscriptions,
- actions/handlers,
- view/render,
- Pixel Mode resolver,
- Pixel Mode view,
- tests.

Do not:

- turn `pty-manager.ts` into the evidence service,
- put all evidence state into a single global `state.ts` expansion,
- mix provider-specific parsing directly into UI components,
- duplicate governance decisions,
- duplicate Git watcher logic,
- import main-process modules into renderer/shared,
- create one oversized “EvidenceManager.”

Respect actual architecture guardrails and contract-test style. State dependency direction explicitly and identify circular-dependency risks.

---

## 21. Error and degraded-mode behavior

Plan explicit behavior for:

- evidence directory creation failure,
- append/write failure,
- malformed hook event,
- duplicate or replayed event,
- out-of-order event,
- event after session close,
- application crash,
- PTY exit before provider session-end,
- missing Git or non-Git project,
- Git timeout/large repository,
- oversized event payload,
- unknown provider/tool/event,
- redaction failure,
- export failure,
- corrupted evidence file,
- schema mismatch,
- governance unavailable,
- enforcement unsupported,
- concurrent sessions in one project,
- resumed sessions after crash,
- animation asset/state failure.

Rules:

- Evidence failure must never silently become “complete evidence.”
- Pixel Mode failure must fall back to text/status without affecting the session.
- The coding session should normally continue if evidence persistence fails.
- Only an explicitly selected strict mode may fail closed, and only where the provider can enforce safely and the behavior is tested.

---

## 22. Security and privacy threat model

### Assets

- evidence records,
- project/path metadata,
- tool input metadata,
- policy configuration,
- review notes,
- exports,
- provider/session identifiers,
- cost/context data.

### Threat actors

- malicious repository content,
- malicious prompt/tool output,
- forged provider hook payload,
- malicious MCP server,
- local untrusted process,
- accidental user disclosure,
- compromised dependency.

### Threats

- secret leakage,
- path traversal or arbitrary-file overwrite during export,
- symlink attacks,
- event-log/HTML/UI injection,
- terminal escape sequences,
- forged/replayed events,
- cross-session mixing,
- oversized payload/event flooding,
- renderer exposure of raw data,
- policy display differing from actual enforcement,
- ambiguous evidence deletion,
- tampering with local evidence,
- Pixel Mode labels revealing sensitive paths or operations.

Plan mitigations including:

- strict runtime validation,
- bounded payload/event rates,
- safe serialization/escaping,
- session/provider correlation,
- renderer-safe view models,
- atomic or crash-safe writes where practical,
- explicit health/completeness states,
- defense-in-depth redaction,
- safe export destination validation,
- no raw HTML from provider content.

Clarify that local evidence is not automatically authentic against a fully compromised local machine.

---

## 23. Performance budgets

Propose measurable targets after inspecting current patterns. Include:

- no synchronous evidence write on PTY data hot path,
- bounded ingestion queue and payload size,
- batching/debounced renderer updates,
- pagination or virtualization for long timelines,
- bounded cost/context snapshot frequency,
- Git command timeout,
- maximum diff metadata and path count,
- export off the interactive path,
- animation frame/update budget,
- paused/reduced background animations,
- behavior at 1,000 and 10,000 events,
- event-drop/coalescing visibility.

Prevent duplicate storage from polling, file watchers, provider hooks, and repeated cost snapshots.

---

## 24. Accessibility and localization

The complete feature must support English and Turkish through existing i18n infrastructure.

Requirements:

- localized event labels and evidence explanations,
- localized Pixel Mode status text,
- keyboard navigation,
- screen-reader labels and sensible live-region behavior,
- no color-only meaning,
- reduced-motion mode,
- static fallback for animation,
- focus management for approval/review/export controls,
- understandable empty, partial, unavailable, and failure states,
- localization contract tests.

Do not localize raw provider/tool identifiers when those identifiers are technical facts; localize their user-facing category and explanation.

---

## 25. Cross-platform considerations

Plan for macOS, Linux, and Windows differences in:

- PTY behavior,
- process/session lifecycle,
- provider hook support,
- shell quoting,
- file paths and separators,
- home-directory redaction,
- case sensitivity,
- symlinks,
- Git discovery and worktrees,
- file locking and atomic writes,
- export destinations,
- background animation/resource behavior.

Provider/platform limitations are acceptable if documented and reflected in evidence coverage. Do not present a macOS-only capability as universal.

---

## 26. Testing strategy

### Unit tests

- event normalization,
- schema validation,
- source/confidence mapping,
- policy-decision correlation,
- redaction including nested/URL/command/error cases,
- evidence-health calculation,
- deterministic summary,
- Git baseline comparison,
- deduplication and ordering,
- retention/deletion rules,
- export sanitization,
- visual-state resolver,
- transition priority/staleness,
- schema migration.

### Contract tests

- shared evidence contracts,
- provider capability declarations,
- preload bridge and IPC registration,
- main/renderer contract,
- export schema,
- localization keys,
- architecture boundaries,
- no raw sensitive payload in renderer contracts.

### Integration tests

- start → events → end → summary,
- abnormal PTY exit,
- missing hooks,
- dirty Git baseline,
- non-Git project,
- concurrent sessions,
- allow/ask/block flow,
- export containing attempted secret payloads,
- restart and interrupted-session recovery,
- Pixel Mode fallback when evidence is partial,
- disabling/reduced motion.

### Provider fixture tests

Use recorded sanitized fixtures instead of paid live provider calls in CI. Include:

- Claude full coverage,
- Codex partial coverage,
- Copilot partial/minimal coverage,
- Antigravity/Qwen based on actual adapters,
- malformed and oversized events,
- duplicate/replayed events,
- late/out-of-order events,
- unknown future event type.

### Security tests

- nested secret redaction,
- malicious HTML/script strings,
- terminal escape data,
- export path traversal,
- symlink targets,
- event flooding,
- cross-session correlation attack,
- forged session/provider ID,
- malformed JSON,
- untrusted visual label/context.

### Performance tests

- ingestion under event bursts,
- 1,000/10,000-event timeline,
- Git snapshots on small/large repositories,
- animation update/coalescing behavior,
- background-session resource usage.

### Manual platform acceptance

Provide macOS, Linux, and Windows checklists.

Final implementation quality gates must include the canonical repository commands discovered from `package.json`, expected at minimum:

- `npm run build`
- `npm run audit:structure`
- `npm test`

Do not assume command names if the current repository differs.

---

## 27. Delivery phases

Do not put the entire feature into one pull request. Provide objective, dependencies, likely files, tests, acceptance criteria, rollback plan, complexity (S/M/L/XL), and recommended PR split for every phase.

### Phase 0 — Audit, contracts, and accepted design

- current-state architecture map,
- provider capability matrix,
- trust/attribution vocabulary,
- event taxonomy,
- persistence decision,
- IPC plan,
- Session Inspector information architecture,
- Pixel visual-state model,
- confirmed MVP boundary.

No production behavior.

### Phase 1 — Evidence foundation

- shared contracts,
- normalization,
- centralized redaction,
- evidence-run lifecycle,
- local persistence,
- completeness/health,
- recovery basics,
- fixtures and tests.

No full UI.

### Phase 2 — Git evidence and deterministic summary

- start/final snapshots,
- pre-existing dirty-state distinction,
- bounded change summary,
- non-Git degraded behavior,
- deterministic summary,
- tests.

### Phase 3 — Session Inspector Evidence UI

- live safe timeline,
- summary and health,
- filters/event details,
- Git observations,
- degraded/error states,
- English/Turkish localization,
- accessibility and performance tests.

### Phase 4 — Pixel Agent Live Compact

- Off/Compact preference,
- approximately 8–10 essential states,
- evidence-driven state resolver,
- transition priority and stale-state handling,
- static/reduced-motion fallback,
- localized text,
- accessibility/performance tests.

### Phase 5 — Review, export, and deletion

- review status/notes,
- JSON export,
- one human-readable export,
- safe destination flow,
- individual/all evidence deletion,
- storage usage display,
- tests.

### Phase 6 — Provider hardening and enforcement clarity

- explicit capability declarations,
- full sanitized fixture matrix,
- duplicate/out-of-order handling,
- enforced versus advisory UI,
- platform validation,
- strict mode only where reliable.

### Phase 7 — Pixel Studio

Post-MVP:

- full pixel workspace,
- research/terminal/files/test/Git/security stations,
- movement/transitions,
- richer error/completion scenes,
- optional structured subagent visualization.

### Future extraction gate

Define measurable conditions before extracting a standalone Agent Evidence Core, such as:

- at least two providers share most normalization/policy/report logic,
- Calder-specific UI/runtime dependencies are isolated,
- a non-Calder consumer exists,
- stable versioned contracts are proven,
- extraction reduces rather than increases maintenance cost.

---

## 28. MVP acceptance criteria

Refine and make testable at least these criteria:

1. A supported Calder session creates one evidence run.
2. Existing hooks/watchers are normalized without breaking current tracking.
3. Existing governance decisions appear with source and actual enforcement outcome.
4. Sensitive values are redacted before persistence and renderer access.
5. Session Inspector displays a safe live evidence timeline.
6. Calder records starting and final Git snapshots when available.
7. Pre-existing dirty files are distinguishable from session-window observations.
8. Reports do not falsely attribute all Git changes to the agent.
9. Session completion produces a deterministic summary.
10. Coverage reflects real provider capabilities and runtime tracking health.
11. Missing hooks create a visible incomplete-evidence warning.
12. The coding session normally continues if evidence persistence fails.
13. Review status/notes are separate from raw events.
14. JSON and one human-readable export are explicitly user-triggered and sanitized.
15. No full terminal transcript is persisted by default.
16. No full prompt is persisted by default.
17. No cloud service is required.
18. Current session, cost, context, governance, and inspector behavior remains compatible.
19. Pixel Compact consumes only sanitized normalized events.
20. Unknown activity produces a neutral state rather than a fabricated claim.
21. Pixel Mode can be disabled and supports reduced motion.
22. Pixel failures do not affect PTY or evidence capture.
23. Platform/provider limitations are documented and shown in coverage.
24. Build, tests, lint/type checks, and architecture audits pass.
25. No new file violates current Calder architecture/file-size limits.
26. Existing oversized/global files do not grow unnecessarily.

---

## 29. Definition of done

The final implementation is not done merely because events appear on screen. Define completion to require:

- accepted architecture and threat model,
- versioned contracts,
- centralized redaction,
- tested degraded states,
- provider capability truthfulness,
- deterministic summaries,
- safe export,
- accessibility and i18n,
- performance budgets met,
- platform/provider documentation,
- migration/recovery behavior,
- no known secret leakage path,
- canonical repository quality gates passing.

---

## 30. Required final recommendations

Conclude with firm, evidence-based answers:

1. Should Session Evidence live inside Session Inspector or become a separate top-level surface?
2. Which current subsystem owns event capture, governance, Git observation, persistence, summary, renderer state, export, and Pixel Mode?
3. Should MVP policy behavior be observe-only, advisory, or partially enforced?
4. Which provider should be the first reference implementation?
5. What is the minimum useful release?
6. What must be deferred to prevent scope failure?
7. Which human-readable export format should ship first?
8. Which storage approach best fits current Calder?
9. Should tamper-evident chaining be MVP or later?
10. What conditions justify Pixel Studio?
11. What conditions justify extracting Agent Evidence Core?

Expected initial direction—challenge only if the repository supports a clearly better choice:

- keep Session Evidence inside Calder,
- extend Session Inspector,
- use a bounded module such as `src/main/calder-evidence/`,
- keep shared contracts under `src/shared/`,
- reuse provider hooks/watchers, PTY lifecycle, Git utilities, governance, reviews, and existing inspector state,
- avoid expanding `pty-manager.ts`, `state.ts`, or other global files into feature dumping grounds,
- use Claude as the first full-capability reference provider if code confirms it,
- begin with trustworthy evidence recording and advisory/default behavior,
- use strict enforcement only where provider-native pre-execution control is reliable,
- describe Git deltas as session-window observations,
- keep all evidence local,
- ship Pixel Compact only after the evidence contract is stable,
- defer Pixel Studio integration.

---

## 31. Final output rules

- Produce the complete planning/design document only.
- Cite repository paths for all codebase-specific claims.
- Separate verified findings from assumptions and proposals.
- Include a proposed file map, but do not create files.
- Include a provider matrix, trust matrix, event taxonomy, visual-state matrix, phase table, risk register, and acceptance checklist.
- Mark decisions that require product-owner approval.
- Do not write production code.
- Do not edit the repository.
- Do not start implementation.
- Stop after delivering the plan.
