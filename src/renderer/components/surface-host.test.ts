import { describe, expect, it, vi } from 'vitest';

const {
  mockAttachBrowserTabToContainer,
  mockShowBrowserTabPane,
  mockAttachCliSurfacePane,
  mockShowCliSurfacePane,
} = vi.hoisted(() => ({
  mockAttachBrowserTabToContainer: vi.fn(),
  mockShowBrowserTabPane: vi.fn(),
  mockAttachCliSurfacePane: vi.fn(),
  mockShowCliSurfacePane: vi.fn(),
}));

vi.mock('./browser-tab-pane.js', () => ({
  attachBrowserTabToContainer: mockAttachBrowserTabToContainer,
  showBrowserTabPane: mockShowBrowserTabPane,
}));

vi.mock('./cli-surface/pane.js', () => ({
  attachCliSurfacePane: mockAttachCliSurfacePane,
  showCliSurfacePane: mockShowCliSurfacePane,
}));

import { renderSurfaceHost } from './surface-host.js';

describe('surface host', () => {
  it('renders the browser live view when the active surface is web', () => {
    const container = {} as HTMLElement;
    renderSurfaceHost(
      {
        id: 'project-1',
        name: 'Demo',
        path: '/tmp/demo',
        activeSessionId: 'claude-1',
        sessions: [
          {
            id: 'browser-1',
            name: 'Live View',
            type: 'browser-tab',
            cliSessionId: null,
            createdAt: '2026-04-12',
            browserTabUrl: 'http://localhost:3000',
          },
        ],
        layout: { mode: 'mosaic', splitPanes: [], splitDirection: 'horizontal' },
        surface: {
          kind: 'web',
          active: true,
          web: { sessionId: 'browser-1', url: 'http://localhost:3000' },
          cli: { profiles: [], runtime: { status: 'idle' } },
        },
      } as any,
      container,
    );

    expect(mockAttachBrowserTabToContainer).toHaveBeenCalledWith('browser-1', container);
    expect(mockShowBrowserTabPane).toHaveBeenCalledWith('browser-1', true);
  });

  it('renders the cli surface when the active surface is cli', () => {
    const container = {} as HTMLElement;
    renderSurfaceHost(
      {
        id: 'project-1',
        name: 'Demo',
        path: '/tmp/demo',
        activeSessionId: 'claude-1',
        sessions: [],
        layout: { mode: 'mosaic', splitPanes: [], splitDirection: 'horizontal' },
        surface: {
          kind: 'cli',
          active: true,
          cli: {
            selectedProfileId: 'textual',
            profiles: [{ id: 'textual', name: 'Textual', command: 'python' }],
            runtime: { status: 'idle' },
          },
        },
      } as any,
      container,
    );

    expect(mockAttachCliSurfacePane).toHaveBeenCalledWith('project-1', container);
    expect(mockShowCliSurfacePane).toHaveBeenCalledWith('project-1');
  });

  it('falls back to the latest browser tab when surface session id is stale', () => {
    const container = {} as HTMLElement;
    renderSurfaceHost(
      {
        id: 'project-1',
        name: 'Demo',
        path: '/tmp/demo',
        activeSessionId: 'claude-1',
        sessions: [
          {
            id: 'browser-1',
            name: 'Live View',
            type: 'browser-tab',
            cliSessionId: null,
            createdAt: '2026-04-12',
            browserTabUrl: 'http://localhost:3000',
          },
          {
            id: 'browser-2',
            name: 'Live View 2',
            type: 'browser-tab',
            cliSessionId: null,
            createdAt: '2026-04-13',
            browserTabUrl: 'http://localhost:3001',
          },
        ],
        layout: { mode: 'mosaic', splitPanes: [], splitDirection: 'horizontal' },
        surface: {
          kind: 'web',
          active: true,
          web: { sessionId: 'missing-session', url: 'http://localhost:3000' },
          cli: { profiles: [], runtime: { status: 'idle' } },
        },
      } as any,
      container,
    );

    expect(mockAttachBrowserTabToContainer).toHaveBeenCalledWith('browser-2', container);
    expect(mockShowBrowserTabPane).toHaveBeenCalledWith('browser-2', true);
  });
});
