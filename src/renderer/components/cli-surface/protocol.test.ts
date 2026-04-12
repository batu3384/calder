import { describe, expect, it } from 'vitest';
import { encodeCalderOsc, parseCalderOsc } from './protocol.js';

describe('calder cli surface protocol', () => {
  it('encodes inspect metadata into OSC 8970', () => {
    const encoded = encodeCalderOsc({
      type: 'node',
      nodeId: 'settings.footer',
      label: 'footer actions',
      bounds: { startRow: 12, endRow: 12, startCol: 0, endCol: 64 },
    });

    expect(encoded.startsWith('\u001b]8970;calder=')).toBe(true);
  });

  it('parses OSC 8970 messages back into semantic nodes', () => {
    const message = encodeCalderOsc({
      type: 'node',
      nodeId: 'settings.footer',
      label: 'footer actions',
      bounds: { startRow: 12, endRow: 12, startCol: 0, endCol: 64 },
    });

    expect(parseCalderOsc(message)).toEqual(
      expect.objectContaining({
        type: 'node',
        nodeId: 'settings.footer',
        label: 'footer actions',
      }),
    );
  });
});
