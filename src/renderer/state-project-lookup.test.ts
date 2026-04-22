import { describe, expect, it } from 'vitest';
import type { ProjectRecord } from '../shared/types/project.js';
import { normalizeProjectLayout } from './state-normalizers.js';
import { findProjectForPath } from './state-project-lookup.js';

function makeProject(id: string, path: string): ProjectRecord {
  return {
    id,
    name: id,
    path,
    sessions: [],
    activeSessionId: null,
    layout: normalizeProjectLayout(),
  };
}

describe('state project lookup', () => {
  it('returns the deepest matching project for nested paths', () => {
    const parent = makeProject('parent', '/workspace/root');
    const child = makeProject('child', '/workspace/root/packages/app');
    const sibling = makeProject('sibling', '/workspace/other');

    expect(findProjectForPath(
      [parent, child, sibling],
      '/workspace/root/packages/app/src/pages',
    )).toBe(child);
  });

  it('normalizes backslashes and trailing slashes before matching', () => {
    const project = makeProject('windowsish', 'C:/repo/app/');

    expect(findProjectForPath([project], 'C:\\repo\\app\\src\\index.ts')).toBe(project);
  });

  it('returns undefined for empty or unrelated paths', () => {
    const project = makeProject('project', '/workspace/root');

    expect(findProjectForPath([project], undefined)).toBeUndefined();
    expect(findProjectForPath([project], null)).toBeUndefined();
    expect(findProjectForPath([project], '/workspace/rootish/file.ts')).toBeUndefined();
  });
});
