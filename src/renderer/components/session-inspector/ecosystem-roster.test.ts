import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../provider-availability.js', () => ({
  getProviderCapabilities: (providerId: string) =>
    providerId === 'cursor'
      ? { hookStatus: false, costTracking: false, contextWindow: false }
      : { hookStatus: true, costTracking: true, contextWindow: true },
}));

import {
  buildEcosystemCardElement,
  type EcosystemCardModel,
  truncateCliSessionId,
} from './ecosystem-roster.js';

function mockElement(tag = 'div'): HTMLElement {
  const children: HTMLElement[] = [];
  const listeners = new Map<string, Array<() => void>>();
  return {
    tagName: tag.toUpperCase(),
    className: '',
    dataset: {} as DOMStringMap,
    textContent: '',
    type: tag === 'button' ? 'button' : undefined,
    hidden: false,
    appendChild(child: HTMLElement) {
      children.push(child);
      this.textContent = [
        this.textContent,
        child.textContent ?? '',
        ...children.map((c) => c.textContent ?? ''),
      ].join('');
      return child;
    },
    setAttribute: vi.fn(),
    addEventListener(type: string, fn: () => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    click() {
      for (const fn of listeners.get('click') ?? []) fn();
    },
  } as unknown as HTMLElement;
}

describe('ecosystem roster cards', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: (tag: string) => mockElement(tag),
    });
  });

  it('truncates long cli session ids', () => {
    expect(truncateCliSessionId('abcdefghijklmnop')).toBe('abcdef…mnop');
    expect(truncateCliSessionId('short')).toBe('short');
    expect(truncateCliSessionId(null)).toBeNull();
  });

  it('renders provider mark, cli id, fidelity chip, and separate studio button', () => {
    const model: EcosystemCardModel = {
      session: {
        id: 's1',
        name: 'Cursor work',
        providerId: 'cursor',
        cliSessionId: 'cursor-session-abcdef123456',
      } as EcosystemCardModel['session'],
      events: [],
      runId: null,
      isActive: true,
      isInspected: false,
    };

    const selects: string[] = [];
    const studios: string[] = [];
    const card = buildEcosystemCardElement(
      model,
      (id) => selects.push(id),
      (id) => studios.push(id),
    );

    expect(card.dataset.provider).toBe('cursor');
    expect(card.dataset.state).toBe('idle');
    expect(String(card.textContent)).toContain('Cu');
    expect(String(card.textContent)).toContain('PTY only');
    expect(String(card.textContent)).toContain('cursor');
    expect(String(card.textContent)).toContain('No evidence run');
    expect(String(card.textContent)).toContain('Studio');

    vi.unstubAllGlobals();
  });
});
