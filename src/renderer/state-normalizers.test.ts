import { describe, expect, it } from 'vitest';

import type { ProjectContextState } from '../shared/types/project-context.js';
import type { ProjectRecord } from '../shared/types/project-state.js';
import {
  buildWorkflowLaunchPrompt,
  deriveBrowserSessionName,
  normalizeProjectContextState,
  normalizeProjectLayout,
  normalizeProjectSurface,
} from './state-normalizers.js';

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Project',
    path: '/tmp/project',
    sessions: [],
    activeSessionId: null,
    layout: normalizeProjectLayout(),
    ...overrides,
  };
}

describe('state normalizers', () => {
  it('normalizes layout defaults and clones mutable collections', () => {
    const source = {
      mode: 'invalid' as never,
      splitPanes: ['a', 'b'],
      splitDirection: 'vertical' as const,
      mosaicRatios: { left: 0.4 },
    };

    const normalized = normalizeProjectLayout(source);

    expect(normalized).toEqual({
      mode: 'mosaic',
      splitPanes: ['a', 'b'],
      splitDirection: 'vertical',
      browserWidthRatio: 0.38,
      mosaicPreset: undefined,
      mosaicRatios: { left: 0.4 },
    });
    expect(normalized.splitPanes).not.toBe(source.splitPanes);
    expect(normalized.mosaicRatios).not.toBe(source.mosaicRatios);
  });

  it('preserves previous source enabled state while recomputing context counts', () => {
    const previous: ProjectContextState = {
      sources: [
        {
          id: 'shared-rules',
          provider: 'shared',
          scope: 'project',
          kind: 'rules',
          path: '.agents/rules.md',
          displayName: 'Rules',
          summary: 'Shared rules',
          lastUpdated: '2026-04-21T00:00:00Z',
          enabled: false,
        },
      ],
      sharedRuleCount: 0,
      providerSourceCount: 0,
    };
    const incoming: ProjectContextState = {
      sources: [
        { ...previous.sources[0], enabled: undefined },
        {
          id: 'codex-memory',
          provider: 'codex',
          scope: 'project',
          kind: 'memory',
          path: 'AGENTS.md',
          displayName: 'Memory',
          summary: 'Provider context',
          lastUpdated: '2026-04-21T00:00:00Z',
        },
      ],
      sharedRuleCount: 999,
      providerSourceCount: 999,
    };

    expect(normalizeProjectContextState(incoming, previous)).toMatchObject({
      sharedRuleCount: 0,
      providerSourceCount: 1,
      sources: [
        { id: 'shared-rules', enabled: false },
        { id: 'codex-memory', enabled: undefined },
      ],
    });
  });

  it('hydrates browser-backed web surfaces from project sessions', () => {
    const project = makeProject({
      sessions: [
        {
          id: 'cli-1',
          name: 'Claude',
          type: 'claude',
          providerId: 'claude',
          cliSessionId: 'cli-1',
          createdAt: '2026-04-21T00:00:00Z',
        },
        {
          id: 'browser-1',
          name: 'Browser',
          type: 'browser-tab',
          browserTabUrl: 'http://localhost:3000',
          browserTargetSessionId: 'cli-1',
          cliSessionId: null,
          createdAt: '2026-04-21T00:01:00Z',
        },
      ],
      surface: {
        kind: 'web',
        active: true,
        web: {
          sessionId: 'browser-1',
          url: 'http://localhost:3000',
          history: ['http://localhost:3000'],
        },
      },
    });

    expect(normalizeProjectSurface(project)).toEqual({
      kind: 'web',
      active: true,
      targetSessionId: 'cli-1',
      web: {
        sessionId: 'browser-1',
        url: 'http://localhost:3000',
        history: ['http://localhost:3000'],
      },
    });
  });

  it('drops stale browser session refs while preserving useful history', () => {
    const project = makeProject({
      sessions: [
        {
          id: 'cli-1',
          name: 'Claude',
          type: 'claude',
          providerId: 'claude',
          cliSessionId: 'cli-1',
          createdAt: '2026-04-21T00:00:00Z',
        },
        {
          id: 'browser-1',
          name: 'Browser',
          type: 'browser-tab',
          browserTabUrl: 'http://localhost:3000',
          browserTargetSessionId: 'cli-1',
          cliSessionId: null,
          createdAt: '2026-04-21T00:01:00Z',
        },
      ],
      surface: {
        kind: 'web',
        active: true,
        targetSessionId: 'missing-cli',
        web: {
          sessionId: 'missing-browser',
          url: 'http://stale.local',
          history: ['http://stale.local'],
        },
      },
    });

    expect(normalizeProjectSurface(project)).toEqual({
      kind: 'web',
      active: true,
      targetSessionId: 'cli-1',
      web: {
        sessionId: 'browser-1',
        url: 'http://localhost:3000',
        history: ['http://stale.local'],
      },
    });
  });

  it('derives browser names and workflow prompts', () => {
    expect(deriveBrowserSessionName('https://example.com/path')).toBe('example.com');
    expect(deriveBrowserSessionName('not a url', 'Fallback')).toBe('Fallback');
    expect(
      buildWorkflowLaunchPrompt({
        path: '/tmp/.agents/workflows/fix.md',
        relativePath: '.agents/workflows/fix.md',
        title: 'Fix Tests',
        contents: '  Run the failing test first.  ',
      }),
    ).toBe(
      [
        'Follow this reusable project workflow for the current task.',
        'Workflow: Fix Tests',
        'Source: .agents/workflows/fix.md',
        'Run the failing test first.',
      ].join('\n\n'),
    );
  });
});
