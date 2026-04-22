import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBrowserSessionPartition } from '../../../shared/constants.js';

const mockAppState = {
  projects: [] as Array<{
    id: string;
    sessions: Array<{ id: string }>;
  }>,
};

vi.mock('../../state.js', () => ({
  appState: mockAppState,
}));

class FakeElement {
  className = '';
  textContent = '';
  children: FakeElement[] = [];

  constructor(public tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
}

describe('browser tab pane helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppState.projects = [];
    (globalThis as unknown as { document?: unknown }).document = {
      createElement: (tagName: string) => new FakeElement(tagName),
    };
  });

  it('builds toolbar clusters with label and controls shells', async () => {
    const { createBrowserToolbarCluster } = await import('./pane-helpers.js');

    const cluster = createBrowserToolbarCluster('Capture');

    expect(cluster.element.className).toBe('browser-toolbar-cluster');
    expect(cluster.label.className).toBe('browser-toolbar-cluster-label');
    expect(cluster.label.textContent).toBe('Capture');
    expect(cluster.controls.className).toBe('browser-toolbar-cluster-controls');
    expect(cluster.element.children).toEqual([cluster.label, cluster.controls]);
  });

  it('resolves credential origins only for http and https URLs', async () => {
    const { resolveCredentialOrigin } = await import('./pane-helpers.js');

    expect(resolveCredentialOrigin('https://example.com/path')).toBe('https://example.com');
    expect(resolveCredentialOrigin('http://localhost:3000/login')).toBe('http://localhost:3000');
    expect(resolveCredentialOrigin('file:///tmp/index.html')).toBeNull();
    expect(resolveCredentialOrigin('notaurl')).toBeNull();
    expect(resolveCredentialOrigin(undefined)).toBeNull();
  });

  it('derives capture mode precedence from inspect/draw/flow state', async () => {
    const { resolveCaptureModeState } = await import('./pane-helpers.js');

    expect(resolveCaptureModeState({ inspectMode: true, drawMode: true, flowMode: true, flowSteps: [] } as any)).toBe('inspect');
    expect(resolveCaptureModeState({ inspectMode: false, drawMode: true, flowMode: true, flowSteps: [] } as any)).toBe('draw');
    expect(resolveCaptureModeState({ inspectMode: false, drawMode: false, flowMode: true, flowSteps: [] } as any)).toBe('flow');
    expect(resolveCaptureModeState({ inspectMode: false, drawMode: false, flowMode: false, flowSteps: [{ type: 'navigate' }] } as any)).toBe('flow');
    expect(resolveCaptureModeState({ inspectMode: false, drawMode: false, flowMode: false, flowSteps: [] } as any)).toBe('idle');
  });

  it('uses project-scoped partitions when resolving browser session storage', async () => {
    const { resolveBrowserPartitionForSession } = await import('./pane-helpers.js');

    mockAppState.projects = [
      { id: 'proj-1', sessions: [{ id: 'session-1' }] },
      { id: 'proj-2', sessions: [{ id: 'session-2' }] },
    ];

    expect(resolveBrowserPartitionForSession('session-2')).toBe(buildBrowserSessionPartition('proj-2'));
    expect(resolveBrowserPartitionForSession('missing-session')).toBe(buildBrowserSessionPartition(undefined));
  });
});
