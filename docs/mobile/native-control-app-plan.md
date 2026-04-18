# Calder Native Mobile Control Plan

## Decision (Web vs Native)

For Calder's target scope (session switching, CLI routing, browser controls, inspect tooling, and secure remote control), a pure mobile web app is possible but fragile for long-running, premium control.

Chosen direction: **native mobile app (React Native) + desktop bridge**, with the current mobile web flow kept as fallback.

Why native is the better fit:

- Better runtime reliability when switching apps or reconnecting.
- Stronger device trust model (keychain/secure storage, biometric gate, trusted device list).
- Better mobile UX ergonomics for dense control surfaces.
- Better push/background expansion path for "remote supervision" features.

## Product Goal

Mobile app should be a **true Calder companion**, not only QR handoff:

- See active sessions and states.
- Open a session and send input.
- Route text/actions to selected CLI session.
- Trigger browser actions and inspect workflows.
- Observe connection + health state from both mobile and desktop sides.

## System Architecture

### 1) Desktop Control Gateway (inside Calder desktop)

- Expose a versioned control API namespace (`/api/mobile/v1`).
- Keep the existing pairing bridge for backward compatibility.
- Add an authenticated realtime channel (`/ws/mobile`).
- Maintain authoritative state:
  - Session catalog
  - Active session
  - Provider/CLI availability
  - Browser/inspect state summary
  - Connection health and device list

### 2) Auth + Pairing Model

- QR contains short-lived pairing token + nonce.
- Mobile submits OTP + pairing token.
- Desktop verifies and returns challenge.
- Mobile signs challenge with a device key (stored in secure storage).
- Desktop issues short-lived access token + refresh token scope.
- Desktop marks device as trusted (revocable per device).

### 3) Realtime Data Plane

- WebSocket message groups:
  - `state.sync` (session/browser/cli snapshots)
  - `state.patch` (incremental updates)
  - `terminal.data` / `terminal.input`
  - `browser.action`
  - `inspect.action`
  - `health.status`
- Server-side ACK + sequence number to avoid out-of-order UI state.

### 4) Mobile App UI Information Architecture

- `Overview`: connection status, active project, active session.
- `Sessions`: list + session switch + input console.
- `CLI`: provider/session target selection + send actions/prompts.
- `Browser`: viewport controls + quick actions.
- `Inspect`: select node mode, selected element summary, send-to-session.
- `Security`: trusted device info, revoke, re-pair, language.

## Delivery Phases

### Phase 0 (Completed in this update)

- Desktop top bar now distinguishes:
  - share waiting state
  - active mobile connection state
- Added contract coverage for this status behavior.

### Phase 1

- Add desktop `mobile/v1` state and command endpoints.
- Add connection presence card in desktop share panel (device + latency + since).
- Create native app shell and pairing flow screens.

Current snapshot (April 18, 2026):

- Desktop top action rail now shows waiting vs connected states.
- Share dialog now displays mobile connection presence in the hero area, including active routed session, mode, and live connection duration.
- Native app shell exists and can open Calder mobile control page in-app via WebView.
- Native app can inject verified bootstrap payload into WebView for auto-connect attempt (no second OTP entry in the same flow).
- Native app now receives live session catalog telemetry, can switch sessions, and can send command/quick controls from native tabs.
- Mobile bridge protocol now includes browser state + browser control commands (back/forward/reload/inspect/viewport preset).
- Native Browser/Inspect tabs now trigger live browser controls through the mobile bridge and show browser status/session telemetry.

### Phase 2

- Session list + open session stream + send input.
- CLI routing screen (choose provider/session target).
- Robust reconnect and token refresh.

### Phase 3

- Browser controls + inspect actions from mobile.
- Cross-device live state parity (desktop edits reflected on mobile and vice versa).

### Phase 4

- Security hardening:
  - device trust list
  - rotate/revoke
  - optional biometric confirmation for critical actions
- Observability:
  - control command audit trail
  - connection diagnostics

## Quality Gates

- Must pass existing desktop tests and new mobile-bridge contracts.
- Manual acceptance:
  - pair within 30s
  - reconnect within 5s after temporary network drop
  - session switch reflected on both ends in <1s
- UX acceptance:
  - one clear primary action per mobile screen
  - no blocking modal loops
  - complete TR/EN parity
