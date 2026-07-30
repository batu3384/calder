# Security Diff Report — Element→CLI capture hardening

**Date:** 2026-07-30  
**Scope:** Unstaged diff — browser capture (preload selector engine, inspect/flow/draw routing, surface-routing, capture-prompt)  
**Verdict:** PASS (no new Critical/High)

## Scan summary

| Area                                | Result                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Injection (CSS selector / prompt)   | Mitigated — `escapeCssIdentifier`, `escapeCssAttributeValue`, `escapePromptLiteral`, `sanitizePromptBody`                  |
| XSS (renderer DOM)                  | Inspect/flow UI uses `textContent`; no `innerHTML` with user page data                                                     |
| IPC trust boundary (webview → host) | `verify-capture-selector` validates payload types; selector query wrapped in try/catch                                     |
| Data exposure                       | `pageUrl`, `aria-label`, `textContent` forwarded to CLI prompts — **pre-existing by design**; user-controlled page content |
| Secrets                             | None in changed files                                                                                                      |
| AuthZ                               | N/A — local Electron guest preload                                                                                         |

## Findings

| ID      | Severity | Status       | Notes                                                                                                                          |
| ------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| CAP-001 | LOW      | Accepted     | Prompt carries live page URL + element text; intentional for CLI context. Truncation at 200/4000 chars limits blast radius.    |
| CAP-002 | LOW      | Accepted     | `querySelector` on attacker-controlled page DOM runs in guest context only; invalid selectors return `[]` via safe wrappers.   |
| CAP-003 | NOTE     | Accepted     | `captureTargetRegistry` holds Element refs (max 64, disconnect prune) — memory bound, no cross-session leak in single webview. |
| CAP-004 | NOTE     | Fixed (code) | Flow `buildSelectorOptions` arity mismatch caused runtime crash — not security, but availability.                              |

## Regression fixes applied (this pass)

- Flow selector UI: correct `buildSelectorOptions` 4-arg call + `selectorVerifications` on `FlowStep` / `FlowPickerMetadata`
- Flow recording: `pickInitialActiveSelector` instead of `selectors[0]`
- Inspect: selector switch reads live `instance.selectedElement.selectorVerifications`
- Registry: disconnect prune + cap 64
- i18n: static `Target text: {text}` key
- Tests: +2 flow-recording regression tests (2065 total passing)

## Prior entries (unchanged)

See git history for governance siblings, PTY exit flush, DIFF-003/004 remediation.
