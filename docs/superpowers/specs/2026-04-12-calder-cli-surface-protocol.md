# Calder CLI Surface Protocol

**Date:** 2026-04-12

**Purpose:** Provide an exact semantic inspect channel for first-party CLI applications running inside Calder's `CLI Surface`.

## Transport

- Transport: OSC 8970
- Prefix: `ESC ] 8970;calder=`
- Payload: base64-encoded UTF-8 JSON
- Terminator: BEL (`\u0007`)

## Message Shapes

### Node

```json
{
  "type": "node",
  "nodeId": "settings.footer",
  "label": "footer actions",
  "bounds": { "mode": "line", "startRow": 12, "endRow": 12, "startCol": 0, "endCol": 64 },
  "sourceFile": "src/ui/footer.ts",
  "meta": { "framework": "Calder" }
}
```

### Focus

```json
{
  "type": "focus",
  "nodeId": "settings.theme",
  "label": "theme selector"
}
```

### State

```json
{
  "type": "state",
  "nodeId": "settings.root",
  "meta": { "screen": "settings", "dirty": false }
}
```

## Reference Helper

Calder now keeps a shared helper at:

- `src/shared/cli-surface-protocol.ts`

For Node-based first-party CLI apps, the simplest integration path is:

```ts
import { createCliSurfaceEmitter } from './cli-surface-protocol.js';

const surface = createCliSurfaceEmitter(process.stdout);

surface.emitNode({
  nodeId: 'settings.footer',
  label: 'footer actions',
  sourceFile: 'src/ui/footer.ts',
  bounds: { mode: 'line', startRow: 12, endRow: 12, startCol: 0, endCol: 64 },
  meta: { framework: 'Textual', widgetType: 'footer' },
});

surface.emitFocus({
  nodeId: 'settings.footer',
  label: 'footer actions',
  meta: { framework: 'Textual', focusPath: ['screen', 'footer'] },
});

surface.emitState({
  nodeId: 'settings.root',
  meta: { framework: 'Textual', stateSummary: 'Ready' },
});
```

The helper writes valid OSC 8970 chunks directly to the target writer and keeps Node-side integration small.
