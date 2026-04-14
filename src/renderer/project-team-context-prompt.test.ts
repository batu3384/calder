import { describe, expect, it } from 'vitest';
import { appendProjectTeamContextToPrompt, buildProjectTeamContextPromptBlock } from './project-team-context-prompt.js';

describe('project team context prompt', () => {
  it('builds a compact shared team context prompt block', () => {
    const block = buildProjectTeamContextPromptBlock({
      spaces: [
        {
          id: 'team-context:/proj/.calder/team/spaces/frontend.md',
          path: '/proj/.calder/team/spaces/frontend.md',
          displayName: 'frontend.md',
          summary: 'Frontend Agreements',
          lastUpdated: '2026-04-13T20:00:00.000Z',
          linkedRuleCount: 2,
          linkedWorkflowCount: 3,
        },
      ],
      sharedRuleCount: 2,
      workflowCount: 3,
      lastUpdated: '2026-04-13T20:00:00.000Z',
    });

    expect(block).toContain('Team context:');
    expect(block).toContain('Shared spaces: frontend.md');
    expect(block).toContain('Rules/workflows: 2 shared rules, 3 reusable workflows');
    expect(block).toContain('Frontend Agreements');
  });

  it('appends team context after the user prompt when available', () => {
    const prompt = appendProjectTeamContextToPrompt('Fix this flow', {
      spaces: [
        {
          id: 'team-context:/proj/.calder/team/spaces/release.md',
          path: '/proj/.calder/team/spaces/release.md',
          displayName: 'release.md',
          summary: 'Release handoff belongs here.',
          lastUpdated: '2026-04-13T20:00:00.000Z',
          linkedRuleCount: 1,
          linkedWorkflowCount: 1,
        },
      ],
      sharedRuleCount: 1,
      workflowCount: 1,
    });

    expect(prompt).toContain('Fix this flow');
    expect(prompt).toContain('Team context:');
    expect(prompt).toContain('release.md');
  });

  it('leaves prompts unchanged when no team context exists', () => {
    expect(appendProjectTeamContextToPrompt('Fix this flow', { spaces: [], sharedRuleCount: 0, workflowCount: 0 })).toBe('Fix this flow');
  });
});
