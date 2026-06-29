import { describe, expect, it } from 'vitest';

import { classifyBrowserTrustZone, syncBrowserTrustZoneBadge } from './trust-zone.js';

function createFakeBadge(): HTMLSpanElement {
  const attributes = new Map<string, string>();
  return {
    dataset: {},
    textContent: '',
    title: '',
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
  } as unknown as HTMLSpanElement;
}

describe('browser trust zone classifier', () => {
  it('classifies local loopback pages as trusted local surfaces', () => {
    expect(classifyBrowserTrustZone('http://localhost:3000').id).toBe('local');
    expect(classifyBrowserTrustZone('localhost:3000').id).toBe('local');
    expect(classifyBrowserTrustZone('https://127.0.0.1:8443').access).toBe('trusted');
    expect(classifyBrowserTrustZone('http://app.localhost').id).toBe('local');
  });

  it('classifies remote and file URLs as restricted surfaces', () => {
    expect(classifyBrowserTrustZone('https://example.com').id).toBe('remote');
    expect(classifyBrowserTrustZone('https://example.com').access).toBe('restricted');
    expect(classifyBrowserTrustZone('file:///Users/demo/index.html').id).toBe('file');
    expect(classifyBrowserTrustZone('file:///Users/demo/index.html').access).toBe('restricted');
  });

  it('keeps blank, about, malformed, and unsupported URLs unknown', () => {
    expect(classifyBrowserTrustZone('').id).toBe('unknown');
    expect(classifyBrowserTrustZone('about:blank').access).toBe('unknown');
    expect(classifyBrowserTrustZone('not a url').id).toBe('unknown');
    expect(classifyBrowserTrustZone('data:text/plain,hello').id).toBe('unknown');
  });
});

describe('browser trust zone badge', () => {
  it('syncs compact badge text, data attributes, and tooltip copy', () => {
    const badge = createFakeBadge();

    const zone = syncBrowserTrustZoneBadge(badge, 'https://example.com/docs');

    expect(zone.id).toBe('remote');
    expect(badge.dataset.zone).toBe('remote');
    expect(badge.dataset.access).toBe('restricted');
    expect(badge.textContent).toBe('Remote');
    expect(badge.title).toContain('Runtime permissions are unchanged');
    expect(badge.getAttribute('aria-label')).toBe('Remote trust zone: restricted');
  });
});
