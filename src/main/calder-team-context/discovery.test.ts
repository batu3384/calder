import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverProjectTeamContext } from './discovery.js';

function makeProject(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
}

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('discoverProjectTeamContext', () => {
  it('discovers shared team context spaces and linked project assets', async () => {
    const root = makeProject('team-context-discovery');
    roots.push(root);
    writeFiles(root, {
      '.calder/team/spaces/frontend.md': '# Frontend Agreements\nUse stable surface routing first.\n',
      '.calder/team/spaces/release.md': '\nRelease handoff belongs here.\n',
      '.calder/rules/accessibility.md': '# Accessibility\n',
      '.calder/workflows/review-pr.md': '# Review PR\n',
    });

    const result = await discoverProjectTeamContext(root);

    expect(result.spaces).toEqual([
      expect.objectContaining({
        displayName: 'frontend.md',
        summary: 'Frontend Agreements',
        linkedRuleCount: 1,
        linkedWorkflowCount: 1,
      }),
      expect.objectContaining({
        displayName: 'release.md',
        summary: 'Release handoff belongs here.',
        linkedRuleCount: 1,
        linkedWorkflowCount: 1,
      }),
    ]);
    expect(result.sharedRuleCount).toBe(1);
    expect(result.workflowCount).toBe(1);
    expect(result.lastUpdated).toBeTypeOf('string');
  });

  it('returns an empty state when no shared team context exists', async () => {
    const root = makeProject('team-context-empty');
    roots.push(root);
    writeFiles(root, {
      'README.md': '# Empty\n',
    });

    const result = await discoverProjectTeamContext(root);

    expect(result.spaces).toEqual([]);
    expect(result.sharedRuleCount).toBe(0);
    expect(result.workflowCount).toBe(0);
    expect(result.lastUpdated).toBeUndefined();
  });
});
