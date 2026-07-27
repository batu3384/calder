import { afterEach, describe, expect, it, vi } from 'vitest';

import { areaLabel, esc } from './dom-utils';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dom-utils', () => {
  it('esc encodes html-sensitive characters via a span element', () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => makeSpan()),
    });

    expect(esc(`<script>alert("x")</script> &'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;&#39;',
    );
  });

  it('areaLabel maps known areas and falls back for unknown values', () => {
    expect(areaLabel('staged')).toBe('Staged');
    expect(areaLabel('working')).toBe('Changes');
    expect(areaLabel('untracked')).toBe('Untracked');
    expect(areaLabel('conflicted')).toBe('Conflicted');
    expect(areaLabel('renamed')).toBe('renamed');
  });
});
