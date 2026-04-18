import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import {
  startProjectContextWatcher,
  stopProjectContextWatcher,
} from './watcher.js';

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
  stopProjectContextWatcher();
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('project context watcher', () => {
  it('emits a refreshed project context snapshot when a watched file changes', async () => {
    const root = makeProject('context-watch');
    roots.push(root);
    writeFiles(root, {
      'CLAUDE.md': '# First summary\nUse vitest.\n',
    });

    const seen: string[] = [];
    let resolveUpdate: (() => void) | null = null;
    const updateSeen = new Promise<void>((resolve) => {
      resolveUpdate = resolve;
    });
    startProjectContextWatcher(root, (state) => {
      const summary = state.sources[0]?.summary ?? '';
      seen.push(summary);
      if (summary === 'Updated summary') {
        resolveUpdate?.();
      }
    });

    writeFileSync(join(root, 'CLAUDE.md'), '# Updated summary\nUse vitest.\n', 'utf8');
    await updateSeen;

    expect(seen).toContain('Updated summary');
  });

  it('watches provider instruction files beyond CLAUDE memory', async () => {
    const root = makeProject('provider-watch');
    roots.push(root);
    writeFiles(root, {
      'AGENTS.md': '# First codex summary\nUse AGENTS defaults.\n',
    });

    const seen: string[] = [];
    let resolveUpdate: (() => void) | null = null;
    const updateSeen = new Promise<void>((resolve) => {
      resolveUpdate = resolve;
    });

    startProjectContextWatcher(root, (state) => {
      const codexSource = state.sources.find((source) => source.provider === 'codex');
      const summary = codexSource?.summary ?? '';
      seen.push(summary);
      if (summary === 'Updated codex summary') {
        resolveUpdate?.();
      }
    });

    writeFileSync(join(root, 'AGENTS.md'), '# Updated codex summary\nUse AGENTS defaults.\n', 'utf8');
    await updateSeen;

    expect(seen).toContain('Updated codex summary');
  });

  it('detects shared rule files created after watcher startup', async () => {
    const root = makeProject('shared-rule-watch');
    roots.push(root);

    const seen: string[] = [];
    let resolveUpdate: (() => void) | null = null;
    let rejectUpdate: ((error: Error) => void) | null = null;
    const updateSeen = new Promise<void>((resolve, reject) => {
      resolveUpdate = resolve;
      rejectUpdate = reject;
    });
    const timeout = setTimeout(() => {
      rejectUpdate?.(new Error('Timed out waiting for shared rule update'));
    }, 1800);

    startProjectContextWatcher(root, (state) => {
      const sharedRule = state.sources.find((source) =>
        source.provider === 'shared' && source.kind === 'rules' && source.displayName === 'new-guideline.soft.md');
      const summary = sharedRule?.summary ?? '';
      seen.push(summary);
      if (summary === 'New guideline') {
        clearTimeout(timeout);
        resolveUpdate?.();
      }
    });

    writeFiles(root, {
      '.calder/rules/new-guideline.soft.md': '# New guideline\nKeep updates concise.\n',
    });
    await updateSeen;

    expect(seen).toContain('New guideline');
  });

  it('stops emitting updates after teardown', async () => {
    const root = makeProject('context-stop');
    roots.push(root);
    writeFiles(root, {
      'CLAUDE.md': '# First summary\nUse vitest.\n',
    });

    const seen: string[] = [];
    startProjectContextWatcher(root, (state) => {
      seen.push(state.sources[0]?.summary ?? '');
    });
    stopProjectContextWatcher();

    writeFileSync(join(root, 'CLAUDE.md'), '# Updated summary\nUse vitest.\n', 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 650));

    expect(seen).toEqual([]);
  });
});
