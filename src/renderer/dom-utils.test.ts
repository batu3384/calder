import { afterEach, describe, expect, it, vi } from 'vitest';

import { areaLabel, createPassphraseInput, esc } from './dom-utils';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function makeSpan() {
  const node: { innerHTML: string; _text: string } = { innerHTML: '', _text: '' };
  Object.defineProperty(node, 'textContent', {
    get: () => node._text,
    set: (next: string) => {
      node._text = String(next ?? '');
      node.innerHTML = escapeHtml(node._text);
    },
  });
  return node;
}

function makeInput() {
  const listeners: Record<string, Array<() => void>> = {};
  const element: Record<string, unknown> = {
    type: '',
    inputMode: '',
    className: '',
    placeholder: '',
    value: '',
    minLength: 0,
    maxLength: 0,
    autocomplete: '',
    spellcheck: true,
    addEventListener: (event: string, handler: () => void) => {
      listeners[event] ??= [];
      listeners[event].push(handler);
    },
    emit: (event: string) => {
      for (const handler of listeners[event] ?? []) handler();
    },
  };
  return element;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dom-utils', () => {
  it('esc encodes html-sensitive characters via a span element', () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => makeSpan()),
    });

    expect(esc(`<script>alert("x")</script> &'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;&#39;');
  });

  it('areaLabel maps known areas and falls back for unknown values', () => {
    expect(areaLabel('staged')).toBe('Staged');
    expect(areaLabel('working')).toBe('Changes');
    expect(areaLabel('untracked')).toBe('Untracked');
    expect(areaLabel('conflicted')).toBe('Conflicted');
    expect(areaLabel('renamed')).toBe('renamed');
  });

  it('createPassphraseInput configures defaults and sanitizes user input', () => {
    const input = makeInput();
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        expect(tag).toBe('input');
        return input;
      }),
    });

    const created = createPassphraseInput();
    expect(created.placeholder).toBe('Passphrase');
    expect(created.minLength).toBe(12);
    expect(created.maxLength).toBe(64);
    expect(created.autocomplete).toBe('off');
    expect(created.spellcheck).toBe(false);
    expect(created.className).toBe('share-pin-input');

    created.value = 'ab-c 12_?!xy';
    (created as any).emit('input');
    expect(created.value).toBe('AB-C 12XY');
  });

  it('createPassphraseInput respects explicit placeholder and value', () => {
    const input = makeInput();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => input),
    });

    const created = createPassphraseInput({ placeholder: 'Pairing Key', value: 'abc def' });
    expect(created.placeholder).toBe('Pairing Key');
    expect(created.value).toBe('abc def');
  });
});
