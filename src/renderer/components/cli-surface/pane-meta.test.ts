import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../state.js', () => ({
  appState: {
    resolveSurfaceTargetSession: vi.fn((projectId: string) =>
      projectId === 'project-with-route' ? { name: 'Codex Main' } : null,
    ),
  },
}));

vi.mock('./adapters/registry.js', () => ({
  detectCliAdapter: vi.fn(),
}));

vi.mock('./profile.js', () => ({
  getCliSurfaceProfileLabel: vi.fn(
    (profile: { name?: string }) => profile.name ?? 'Unknown profile',
  ),
}));

import { detectCliAdapter } from './adapters/registry.js';
import { formatCliSurfaceTiming, renderCliSurfaceRuntimeMeta } from './pane-meta.js';

type FakeElement = {
  textContent: string;
  innerHTML: string;
  className: string;
  children: FakeElement[];
  classList: {
    add: (value: string) => void;
    remove: (value: string) => void;
    contains: (value: string) => boolean;
  };
  appendChild: (child: FakeElement) => FakeElement;
};

function makeElement(): FakeElement {
  const classes = new Set<string>();
  return {
    textContent: '',
    innerHTML: '',
    className: '',
    children: [],
    classList: {
      add: (value: string) => {
        classes.add(value);
      },
      remove: (value: string) => {
        classes.delete(value);
      },
      contains: (value: string) => classes.has(value),
    },
    appendChild(child: FakeElement) {
      this.children.push(child);
      return child;
    },
  };
}

function buildInstance(projectId = 'project-1') {
  return {
    projectId,
    metaEl: makeElement() as unknown as HTMLDivElement,
    routeEl: makeElement() as unknown as HTMLDivElement,
    adapterMetaEl: makeElement() as unknown as HTMLDivElement,
    emptyEl: makeElement() as unknown as HTMLDivElement,
    viewportLines: [] as string[],
    targetMenuController: { syncControls: vi.fn() },
  };
}

describe('cli-surface pane meta helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('document', {
      createElement: () => makeElement(),
    } as unknown as Document);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formats startup timing labels with ms and seconds values', () => {
    expect(formatCliSurfaceTiming({ spawnLatencyMs: 18 })).toBe('spawn 18ms');
    expect(formatCliSurfaceTiming({ firstOutputLatencyMs: 3_400 })).toBe('first output 3.4s');
    expect(formatCliSurfaceTiming({ spawnLatencyMs: 50, firstOutputLatencyMs: 11_000 })).toBe(
      'spawn 50ms · first output 11s',
    );
    expect(formatCliSurfaceTiming()).toBe('');
  });

  it('renders runtime metadata, route copy, adapter badges, and empty-state messaging', () => {
    const instance = buildInstance('project-with-route');
    const detectCliAdapterMock = vi.mocked(detectCliAdapter);
    detectCliAdapterMock.mockReturnValue({
      displayName: 'Codex CLI',
      capabilityBadges: ['Inspect'],
      enrich: () => ({}),
    } as any);

    renderCliSurfaceRuntimeMeta({
      instance,
      getRuntimeState: () =>
        ({
          status: 'starting',
          command: 'codex',
          startupTiming: { spawnLatencyMs: 42 },
        }) as any,
      resolveSelectedProfile: () => ({ name: 'Codex', command: 'codex', args: [] }),
      adapterHint: 'codex',
    });

    expect(instance.metaEl.textContent).toContain('Codex');
    expect(instance.metaEl.textContent).toContain('starting');
    expect(instance.routeEl.textContent).toBe('Routing to Codex Main');
    expect(instance.adapterMetaEl.children).toHaveLength(2);
    expect(instance.emptyEl.textContent).toContain('Starting CLI surface runtime.');
  });

  it('maps runtime statuses to expected labels and running/error empty states', () => {
    const instance = buildInstance('project-2');
    const detectCliAdapterMock = vi.mocked(detectCliAdapter);
    detectCliAdapterMock.mockReturnValue(null);

    renderCliSurfaceRuntimeMeta({
      instance,
      getRuntimeState: () => ({ status: 'running', command: 'codex' }) as any,
      resolveSelectedProfile: () => undefined,
    });
    expect(instance.metaEl.textContent).toContain('live');
    expect(instance.emptyEl.textContent).toContain('Runtime is live.');

    renderCliSurfaceRuntimeMeta({
      instance,
      getRuntimeState: () => ({ status: 'error', command: 'codex', lastError: 'boom' }) as any,
      resolveSelectedProfile: () => undefined,
    });
    expect(instance.metaEl.textContent).toContain('error');
    expect(instance.emptyEl.textContent).toBe('boom');
  });
});
