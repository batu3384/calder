# Calder Mobile (Native App Skeleton)

This folder contains the first native mobile foundation for Calder.

Current scope:

- Native shell UI with TR/EN toggle.
- Connection status surface (idle / waiting / connected / error).
- Pairing bootstrap against desktop bridge:
  - parse desktop QR/pairing link
  - submit OTP to `/api/pair/:pairingId/bootstrap`
- Embedded live control console inside native app (WebView) that opens Calder's mobile control page.
- Live status telemetry relay from WebView (`status`, `connBadge`) to native header state.
- Session catalog relay from live page into native state.
- Native session switch action (select session and trigger switch in live channel).
- Native command deck (send command + quick controls like Ctrl+C / Ctrl+L / Enter / Tab).
- Native browser control deck:
  - browser session selection
  - back / forward / reload
  - inspect toggle
  - viewport preset actions (Responsive / iPhone 14)
- Browser control status relay from live page into native Browser/Inspect tabs.
- Mobile tabs scaffold for:
  - Overview
  - Sessions
  - CLI
  - Browser
  - Inspect
  - Live

## Run locally

1. `cd apps/calder-mobile`
2. `npm install`
3. `npm run start`

Use Expo for iOS/Android run targets.

## Next implementation steps

- Complete secure challenge/answer flow after bootstrap.
- Replace WebView bridge with fully native WebRTC/data-channel pipeline.
- Bind websocket realtime state sync (`session`, `cli`, `browser`, `inspect`).
- Implement command surfaces per tab.
- Add trusted-device persistence + revoke flows.
