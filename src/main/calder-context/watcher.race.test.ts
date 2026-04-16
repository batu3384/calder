import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

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

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out while waiting for condition');
}

const roots: string[] = [];

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('project context watcher race safety', () => {
  it('does not call stale handler or throw when stopped during async discovery', async () => {
    const discoverySpy = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      return {
        sources: [],
        sharedRuleCount: 0,
        providerSourceCount: 0,
        lastUpdated: undefined,
      };
    });
    vi.doMock('./discovery.js', () => ({
      discoverProjectContext: discoverySpy,
    }));

    const { startProjectContextWatcher, stopProjectContextWatcher } = await import('./watcher.js');
    const root = makeProject('context-race');
    roots.push(root);
    writeFiles(root, {
      'CLAUDE.md': '# First summary\nUse vitest.\n',
    });

    const seen: string[] = [];
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      startProjectContextWatcher(root, () => {
        seen.push('called');
      });

      writeFileSync(join(root, 'CLAUDE.md'), '# Updated summary\nUse vitest.\n', 'utf8');
      await waitFor(() => discoverySpy.mock.calls.length > 0, 2500);

      stopProjectContextWatcher();
      await new Promise((resolve) => setTimeout(resolve, 220));

      expect(seen).toEqual([]);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      stopProjectContextWatcher();
    }
  });
});

