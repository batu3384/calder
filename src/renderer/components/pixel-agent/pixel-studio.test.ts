import { describe, expect, it, vi } from 'vitest';

import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { EVIDENCE_SCHEMA_VERSION } from '../../../shared/types-evidence.js';
import { updatePixelStudio } from './pixel-studio.js';

function event(type: EvidenceEvent['type']): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: 'e1',
    evidenceRunId: 'run-1',
    calderSessionId: 'session-1',
    providerId: 'claude',
    projectId: 'p1',
    type,
    timestamp: Date.now(),
    seq: 1,
    source: 'provider_hook',
    confidence: 'provider_reported',
  };
}

function mockElement(className: string): HTMLElement {
  return {
    className,
    dataset: {} as DOMStringMap,
    hidden: true,
    textContent: '',
    replaceChildren: vi.fn(),
    appendChild: vi.fn(),
    setAttribute: vi.fn(),
  } as unknown as HTMLElement;
}

describe('pixel studio', () => {
  it('updates station, scene, and state datasets from evidence', () => {
    const status = { textContent: '' };
    const subagentBadge = { hidden: true, textContent: '' };
    const children: HTMLElement[] = [];

    const studio = {
      dataset: {} as Record<string, string>,
      style: { setProperty: vi.fn() },
      appendChild: (el: HTMLElement) => {
        children.push(el);
        return el;
      },
      prepend: (el: HTMLElement) => {
        children.unshift(el);
        return el;
      },
      querySelector: (selector: string) => {
        if (selector === '.inspector-pixel-studio-status') return status;
        if (selector === '.inspector-pixel-studio-subagents') return subagentBadge;
        const className = selector.startsWith('.') ? selector.slice(1) : selector;
        return children.find((child) => child.className === className) ?? null;
      },
      querySelectorAll: () => [],
    } as unknown as HTMLElement;

    vi.stubGlobal('document', {
      createElement: () => mockElement(''),
    });

    updatePixelStudio(studio, [event('operation_blocked')], { paused: false });
    expect(studio.dataset.station).toBe('security');
    expect(studio.dataset.state).toBe('blocked');
    expect(studio.dataset.scene).toBe('gate');
    expect(studio.dataset.paused).toBe('false');
    expect(studio.dataset.provider).toBe('claude');
    expect(studio.dataset.motion).toBe('idle');
    expect(status.textContent).toContain('Claude');
    expect(status.textContent).toContain('Security');

    updatePixelStudio(
      studio,
      [{ ...event('tool_started'), toolName: 'apply_patch', providerId: 'codex' }],
      {
        paused: false,
      },
    );
    expect(studio.dataset.provider).toBe('codex');
    expect(studio.dataset.station).toBe('files');
    expect(studio.dataset.motion).toBe('active');
    expect(status.textContent).toContain('Codex');

    vi.unstubAllGlobals();
  });
});
