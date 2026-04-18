import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAttachBrowserTabToContainer,
  mockShowBrowserTabPane,
  mockAttachCliSurfacePane,
  mockShowCliSurfacePane,
  mockAttachMobileSurfacePane,
  mockShowMobileSurfacePane,
} = vi.hoisted(() => ({
  mockAttachBrowserTabToContainer: vi.fn(),
  mockShowBrowserTabPane: vi.fn(),
  mockAttachCliSurfacePane: vi.fn(),
  mockShowCliSurfacePane: vi.fn(),
  mockAttachMobileSurfacePane: vi.fn(),
  mockShowMobileSurfacePane: vi.fn(),
}));

vi.mock('./browser-tab-pane.js', () => ({
  attachBrowserTabToContainer: mockAttachBrowserTabToContainer,
  showBrowserTabPane: mockShowBrowserTabPane,
}));

vi.mock('./cli-surface/pane.js', () => ({
  attachCliSurfacePane: mockAttachCliSurfacePane,
  showCliSurfacePane: mockShowCliSurfacePane,
}));

vi.mock('./mobile-surface/pane.js', () => ({
  attachMobileSurfacePane: mockAttachMobileSurfacePane,
  showMobileSurfacePane: mockShowMobileSurfacePane,
}));

import { renderSurfaceHost } from './surface-host.js';

describe('surface host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
          tabFocus: 'cli',
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

  it('renders the mobile surface when the active surface is mobile', () => {
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
          kind: 'mobile',
          active: true,
          tabFocus: 'mobile',
          web: { history: [] },
          cli: { profiles: [], runtime: { status: 'idle' } },
        },
      } as any,
      container,
    );

    expect(mockAttachMobileSurfacePane).toHaveBeenCalledWith('project-1', container);
    expect(mockShowMobileSurfacePane).toHaveBeenCalledWith('project-1');
  });

  it('falls back to browser live view when mobile surface tab focus is on sessions', () => {
    const container = {} as HTMLElement;
    renderSurfaceHost(
      {
        id: 'project-1',
        name: 'Demo',
        path: '/tmp/demo',
        activeSessionId: 'browser-1',
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
          kind: 'mobile',
          active: true,
          tabFocus: 'session',
          web: { sessionId: 'browser-1', url: 'http://localhost:3000' },
          cli: { profiles: [], runtime: { status: 'idle' } },
        },
      } as any,
      container,
    );

    expect(mockAttachMobileSurfacePane).not.toHaveBeenCalled();
    expect(mockShowMobileSurfacePane).not.toHaveBeenCalled();
    expect(mockAttachBrowserTabToContainer).toHaveBeenCalledWith('browser-1', container);
    expect(mockShowBrowserTabPane).toHaveBeenCalledWith('browser-1', true);
  });
});
