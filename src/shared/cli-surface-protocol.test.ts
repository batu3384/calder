import { describe, expect, it, vi } from 'vitest';
import {
  createCliSurfaceEmitter,
  parseCalderOsc,
} from './cli-surface-protocol.js';

describe('shared cli surface protocol helpers', () => {
  it('emits node, focus, and state messages through a stream-like writer', () => {
    const write = vi.fn();
    const emitter = createCliSurfaceEmitter({ write });

    emitter.emitNode({
      nodeId: 'settings.footer',
      label: 'footer actions',
      sourceFile: 'src/ui/footer.ts',
      bounds: { mode: 'line', startRow: 12, endRow: 12, startCol: 0, endCol: 64 },
      meta: { framework: 'Textual' },
    });
    emitter.emitFocus({
      nodeId: 'settings.footer',
      label: 'footer actions',
      meta: { framework: 'Textual', focusPath: ['screen', 'footer'] },
    });
    emitter.emitState({
      nodeId: 'settings.root',
      meta: { framework: 'Textual', stateSummary: 'Ready' },
    });

    expect(write).toHaveBeenCalledTimes(3);
    expect(parseCalderOsc(write.mock.calls[0]?.[0] ?? '')).toEqual(
      expect.objectContaining({
        type: 'node',
        nodeId: 'settings.footer',
        sourceFile: 'src/ui/footer.ts',
      }),
    );
    expect(parseCalderOsc(write.mock.calls[1]?.[0] ?? '')).toEqual(
      expect.objectContaining({
        type: 'focus',
        nodeId: 'settings.footer',
      }),
    );
    expect(parseCalderOsc(write.mock.calls[2]?.[0] ?? '')).toEqual(
      expect.objectContaining({
        type: 'state',
        nodeId: 'settings.root',
      }),
    );
  });

  it('supports function writers and returns the emitted OSC chunk', () => {
    const chunks: string[] = [];
    const emitter = createCliSurfaceEmitter((chunk) => {
      chunks.push(chunk);
    });

    const encoded = emitter.emitState({
      nodeId: 'menu.root',
      meta: { framework: 'Blessed', stateSummary: '3 items focused' },
    });

    expect(encoded).toBe(chunks[0]);
    expect(parseCalderOsc(encoded)).toEqual(
      expect.objectContaining({
        type: 'state',
        nodeId: 'menu.root',
        meta: expect.objectContaining({
          framework: 'Blessed',
          stateSummary: '3 items focused',
        }),
      }),
    );
  });
});
