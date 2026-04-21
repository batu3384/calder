import { describe, expect, it } from 'vitest';
import type { ProjectContextState, ProjectRecord } from '../shared/types.js';
import { normalizeProjectLayout } from './state-normalizers.js';
import { setProjectDomainState } from './state-project-domain-updater.js';

function makeProject(): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Project',
    path: '/tmp/project',
    sessions: [],
    activeSessionId: null,
    layout: normalizeProjectLayout(),
  };
}

function makeContext(id: string): ProjectContextState {
  return {
    sources: [{
      id,
      provider: 'shared',
      scope: 'project',
      kind: 'rules',
      path: `${id}.md`,
      displayName: id,
      summary: id,
      lastUpdated: '2026-04-21T00:00:00Z',
    }],
    sharedRuleCount: 1,
    providerSourceCount: 0,
  };
}

describe('state project domain updater', () => {
  it('assigns normalized state when the domain value changes', () => {
    const project = makeProject();
    const changed = setProjectDomainState(
      project,
      'projectContext',
      makeContext('rules'),
      (incoming) => ({ ...incoming, sharedRuleCount: 7 }),
    );

    expect(changed).toBe(true);
    expect(project.projectContext?.sharedRuleCount).toBe(7);
  });

  it('returns false without mutating when serialized state is unchanged', () => {
    const project = makeProject();
    const context = makeContext('rules');
    project.projectContext = context;

    const changed = setProjectDomainState(
      project,
      'projectContext',
      makeContext('rules'),
      (incoming) => incoming,
    );

    expect(changed).toBe(false);
    expect(project.projectContext).toBe(context);
  });
});
