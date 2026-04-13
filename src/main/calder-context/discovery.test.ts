import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { discoverProjectContext } from './discovery.js';

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

describe('discoverProjectContext', () => {
  it('discovers provider and shared project context sources', async () => {
    const root = makeProject('project-context');
    roots.push(root);
    writeFiles(root, {
      'CLAUDE.md': '# Claude notes\nUse vitest and keep patches minimal.\n',
      'CALDER.shared.md': '# Shared rules\nAlways run tests before completion.\n',
      '.calder/rules/testing.hard.md': '# Testing\nDo not ship without coverage updates.\n',
      '.mcp.json': JSON.stringify({ mcpServers: { local: { command: 'npx server' } } }),
    });

    const result = await discoverProjectContext(root);

    expect(result.sharedRuleCount).toBe(2);
    expect(result.providerSourceCount).toBe(1);
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'claude',
          kind: 'memory',
          displayName: 'CLAUDE.md',
          summary: 'Claude notes',
        }),
        expect.objectContaining({
          provider: 'shared',
          kind: 'rules',
          displayName: 'CALDER.shared.md',
          summary: 'Shared rules',
        }),
        expect.objectContaining({
          provider: 'shared',
          kind: 'rules',
          displayName: 'testing.hard.md',
          summary: 'Testing',
          priority: 'hard',
        }),
        expect.objectContaining({
          provider: 'shared',
          kind: 'mcp',
          displayName: '.mcp.json',
        }),
      ]),
    );
  });

  it('returns a clean empty result when no supported project context files exist', async () => {
    const root = makeProject('empty-context');
    roots.push(root);
    writeFiles(root, {
      'README.md': '# Empty\n',
    });

    const result = await discoverProjectContext(root);

    expect(result.sources).toEqual([]);
    expect(result.sharedRuleCount).toBe(0);
    expect(result.providerSourceCount).toBe(0);
    expect(result.lastUpdated).toBeUndefined();
  });

  it('derives summaries from the first non-empty heading or content line', async () => {
    const root = makeProject('summary-context');
    roots.push(root);
    writeFiles(root, {
      '.calder/rules/style.md': '\n\nPrefer compact copy in the UI.\nKeep labels short.\n',
    });

    const result = await discoverProjectContext(root);

    expect(result.sources).toEqual([
      expect.objectContaining({
        displayName: 'style.md',
        summary: 'Prefer compact copy in the UI.',
        priority: 'soft',
      }),
    ]);
  });
});
