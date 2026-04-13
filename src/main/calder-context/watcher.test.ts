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
