import { describe, expect, it } from 'vitest';
import { encodeCalderOsc, extractCalderOscMessages, parseCalderOsc } from './protocol.js';

describe('calder cli surface protocol', () => {
  it('encodes inspect metadata into OSC 8970', () => {
    const encoded = encodeCalderOsc({
      type: 'node',
      nodeId: 'settings.footer',
      label: 'footer actions',
      bounds: { mode: 'line', startRow: 12, endRow: 12, startCol: 0, endCol: 64 },
    });

    expect(encoded.startsWith('\u001b]8970;calder=')).toBe(true);
  });

  it('parses OSC 8970 messages back into semantic nodes', () => {
    const message = encodeCalderOsc({
      type: 'node',
      nodeId: 'settings.footer',
      label: 'footer actions',
      bounds: { mode: 'line', startRow: 12, endRow: 12, startCol: 0, endCol: 64 },
    });

    expect(parseCalderOsc(message)).toEqual(
      expect.objectContaining({
        type: 'node',
        nodeId: 'settings.footer',
        label: 'footer actions',
      }),
    );
  });

  it('extracts OSC messages from mixed terminal output without losing plain text', () => {
    const nodeMessage = encodeCalderOsc({
      type: 'node',
      nodeId: 'menu.root',
      label: 'command menu',
      bounds: { mode: 'region', startRow: 2, endRow: 6, startCol: 0, endCol: 40 },
      meta: { framework: 'Blessed', widgetType: 'list' },
    });
    const focusMessage = encodeCalderOsc({
      type: 'focus',
      nodeId: 'menu.item.2',
      label: 'second item',
      meta: { framework: 'Blessed', focusPath: ['screen', 'menu', 'second item'] } as any,
    });

    const extracted = extractCalderOscMessages(`hello${nodeMessage}world${focusMessage}!`);

    expect(extracted.plainText).toBe('helloworld!');
    expect(extracted.messages).toHaveLength(2);
    expect(extracted.messages[0]).toEqual(expect.objectContaining({ nodeId: 'menu.root' }));
    expect(extracted.messages[1]).toEqual(expect.objectContaining({ type: 'focus', nodeId: 'menu.item.2' }));
  });

  it('keeps incomplete OSC fragments buffered until the next chunk arrives', () => {
    const message = encodeCalderOsc({
      type: 'state',
      nodeId: 'menu.root',
      meta: { framework: 'Blessed', stateSummary: '3 items focused' },
    });
    const splitIndex = Math.floor(message.length / 2);

    const firstPass = extractCalderOscMessages(`hello${message.slice(0, splitIndex)}`);
    expect(firstPass.plainText).toBe('hello');
    expect(firstPass.messages).toHaveLength(0);
    expect(firstPass.remainder).toBe(message.slice(0, splitIndex));

    const secondPass = extractCalderOscMessages(`${message.slice(splitIndex)}world!`, firstPass.remainder);
    expect(secondPass.plainText).toBe('world!');
    expect(secondPass.messages).toHaveLength(1);
    expect(secondPass.messages[0]).toEqual(expect.objectContaining({ type: 'state', nodeId: 'menu.root' }));
    expect(secondPass.remainder).toBe('');
  });
});
