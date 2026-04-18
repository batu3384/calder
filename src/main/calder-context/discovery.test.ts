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

  it('discovers provider-native instruction files across supported CLIs', async () => {
    const root = makeProject('provider-context');
    roots.push(root);
    writeFiles(root, {
      'AGENTS.md': '# Codex instructions\nUse AGENTS.md defaults.\n',
      'GEMINI.md': '# Gemini instructions\nKeep responses short.\n',
      'QWEN.md': '# Qwen instructions\nPrioritize safety checks.\n',
      '.github/copilot-instructions.md': '# Copilot instructions\nPrefer concise PR notes.\n',
      '.github/instructions/api/backend.instructions.md': '# Backend instructions\nUse strict API schemas.\n',
      '.claude/CLAUDE.md': '# Claude workspace memory\nFavor vitest for tests.\n',
    });

    const result = await discoverProjectContext(root);

    expect(result.providerSourceCount).toBe(6);
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'codex',
          kind: 'instructions',
          displayName: 'AGENTS.md',
          summary: 'Codex instructions',
        }),
        expect.objectContaining({
          provider: 'gemini',
          kind: 'instructions',
          displayName: 'GEMINI.md',
          summary: 'Gemini instructions',
        }),
        expect.objectContaining({
          provider: 'qwen',
          kind: 'instructions',
          displayName: 'QWEN.md',
          summary: 'Qwen instructions',
        }),
        expect.objectContaining({
          provider: 'copilot',
          kind: 'instructions',
          displayName: 'copilot-instructions.md',
          summary: 'Copilot instructions',
        }),
        expect.objectContaining({
          provider: 'copilot',
          kind: 'instructions',
          displayName: 'backend.instructions.md',
          summary: 'Backend instructions',
        }),
        expect.objectContaining({
          provider: 'claude',
          kind: 'memory',
          displayName: 'CLAUDE.md',
          summary: 'Claude workspace memory',
        }),
      ]),
    );
  });

  it('indexes all Claude memory variants and keeps non-rule shared files out of rule counts', async () => {
    const root = makeProject('claude-memory-context');
    roots.push(root);
    writeFiles(root, {
      'CLAUDE.md': '# Root Claude memory\nKeep global conventions here.\n',
      'CLAUDE.local.md': '# Local Claude memory\nOnly local machine notes.\n',
      '.claude/CLAUDE.md': '# Workspace Claude memory\nWorkspace-only memory.\n',
      '.mcp.json': JSON.stringify({ mcpServers: { local: { command: 'npx test-server' } } }),
    });

    const result = await discoverProjectContext(root);
    const claudeMemorySources = result.sources
      .filter((source) => source.provider === 'claude' && source.kind === 'memory')
      .map((source) => source.path);

    expect(claudeMemorySources).toEqual([
      join(root, 'CLAUDE.md'),
      join(root, 'CLAUDE.local.md'),
      join(root, '.claude', 'CLAUDE.md'),
    ]);
    expect(result.sharedRuleCount).toBe(0);
    expect(result.providerSourceCount).toBe(3);
    expect(result.sources).toEqual(
      expect.arrayContaining([
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
