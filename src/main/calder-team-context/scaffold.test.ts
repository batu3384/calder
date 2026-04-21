import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectTeamContextSpaceFile, createProjectTeamContextStarterFiles } from './scaffold.js';

const roots: string[] = [];

function makeProject(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('project team context scaffold', () => {
  it('creates starter team context spaces without overwriting existing files', async () => {
    const root = makeProject('team-context-starters');
    roots.push(root);
    const preexisting = join(root, '.calder/team/spaces/team-charter.md');
    mkdirSync(join(root, '.calder/team/spaces'), { recursive: true });
    writeFileSync(preexisting, '# Existing charter\n', 'utf8');

    const result = await createProjectTeamContextStarterFiles(root);

    expect(result.created).not.toContain('.calder/team/spaces/team-charter.md');
    expect(result.skipped).toContain('.calder/team/spaces/team-charter.md');
    expect(readFileSync(preexisting, 'utf8')).toContain('Existing charter');
    expect(result.state.spaces.length).toBeGreaterThan(0);
  });

  it('creates a named shared team context space and returns refreshed state', async () => {
    const root = makeProject('team-context-create');
    roots.push(root);

    const result = await createProjectTeamContextSpaceFile(root, 'Frontend alignment');
    const spacePath = join(root, result.relativePath);

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe('.calder/team/spaces/frontend-alignment.md');
    expect(readFileSync(spacePath, 'utf8')).toContain('# Frontend alignment');
    expect(result.state.spaces).toEqual([
      expect.objectContaining({
        displayName: 'frontend-alignment.md',
      }),
    ]);
  });

  it('does not overwrite an existing named team context space', async () => {
    const root = makeProject('team-context-existing');
    roots.push(root);

    const first = await createProjectTeamContextSpaceFile(root, 'Frontend alignment');
    const spacePath = join(root, first.relativePath);
    writeFileSync(spacePath, '# Custom content\n', 'utf8');

    const second = await createProjectTeamContextSpaceFile(root, 'Frontend alignment');

    expect(second.created).toBe(false);
    expect(readFileSync(spacePath, 'utf8')).toContain('Custom content');
  });

  it('throws when creating a team context space without a title', async () => {
    const root = makeProject('team-context-empty-title');
    roots.push(root);

    await expect(createProjectTeamContextSpaceFile(root, '   ')).rejects.toThrow('Team context title is required');
  });

  it('uses fallback slug when the team context title has no alphanumeric characters', async () => {
    const root = makeProject('team-context-fallback-slug');
    roots.push(root);

    const result = await createProjectTeamContextSpaceFile(root, '!!!');

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe('.calder/team/spaces/team-context.md');
    expect(readFileSync(join(root, result.relativePath), 'utf8')).toContain('# !!!');
  });
});
