import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
  },
});

vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'uuid-1'),
});

vi.mock('./session-cost.js', () => ({
  getCost: vi.fn().mockReturnValue(null),
  restoreCost: vi.fn(),
}));

vi.mock('./session-context.js', () => ({
  restoreContext: vi.fn(),
}));

import { appState, _resetForTesting } from './state.js';
import { appendAppliedContextToPrompt, buildAppliedContextSummary } from './project-context-prompt.js';

describe('project context prompt helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
  });

  it('builds a provider-aware applied context summary from project sources', () => {
    const project = appState.addProject('Calder', '/proj');
    appState.setProjectContext(project.id, {
      sources: [
        {
          id: 'claude:memory:/proj/CLAUDE.md',
          provider: 'claude',
          scope: 'project',
          kind: 'memory',
          path: '/proj/CLAUDE.md',
          displayName: 'CLAUDE.md',
          summary: 'Claude repo guidance',
          lastUpdated: '2026-04-13T12:00:00.000Z',
        },
        {
          id: 'shared:rules:/proj/.calder/rules/testing.hard.md',
          provider: 'shared',
          scope: 'project',
          kind: 'rules',
          path: '/proj/.calder/rules/testing.hard.md',
          displayName: 'testing.hard.md',
          summary: 'Tests are required',
          lastUpdated: '2026-04-13T12:10:00.000Z',
          priority: 'hard',
        },
      ],
      sharedRuleCount: 1,
      providerSourceCount: 1,
      lastUpdated: '2026-04-13T12:10:00.000Z',
    });

    const summary = buildAppliedContextSummary(project.id, 'claude');

    expect(summary).toMatchObject({
      sharedRuleCount: 1,
      providerContextSummary: 'CLAUDE.md',
      sharedRulesSummary: 'testing.hard.md',
    });
    expect(summary?.sources.map((source) => source.displayName)).toEqual(['CLAUDE.md', 'testing.hard.md']);
  });

  it('appends a compact project context block to routed prompts', () => {
    const prompt = appendAppliedContextToPrompt('Inspect this element', {
      sources: [
        {
          id: 'claude:memory:/proj/CLAUDE.md',
          provider: 'claude',
          displayName: 'CLAUDE.md',
          kind: 'memory',
        },
      ],
      sharedRuleCount: 1,
      providerContextSummary: 'CLAUDE.md',
      sharedRulesSummary: 'testing.hard.md',
    });

    expect(prompt).toContain('Project context:');
    expect(prompt).toContain('Provider memory: CLAUDE.md');
    expect(prompt).toContain('Shared rules: testing.hard.md');
    expect(prompt).toContain('Applied sources: CLAUDE.md');
  });
});
