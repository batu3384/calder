import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverProjectGovernance } from './discovery.js';

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

describe('discoverProjectGovernance', () => {
  it('discovers a Calder governance policy file', async () => {
    const root = makeProject('governance-discovery');
    roots.push(root);
    writeFiles(root, {
      '.calder/governance/policy.json': JSON.stringify({
        schemaVersion: 1,
        profileName: 'Team safe mode',
        mode: 'enforced',
        toolPolicy: 'block',
        writePolicy: 'ask',
        networkPolicy: 'block',
        mcpAllowlist: ['github', 'figma'],
        providerProfiles: {
          codex: { defaultArgs: '--approval-mode=plan' },
          claude: { defaultArgs: '--permission-mode=plan' },
        },
        budgetLimitUsd: 8,
      }, null, 2),
    });

    const result = await discoverProjectGovernance(root);

    expect(result.policy).toEqual(expect.objectContaining({
      displayName: 'Team safe mode',
      mode: 'enforced',
      toolPolicy: 'block',
      writePolicy: 'ask',
      networkPolicy: 'block',
      mcpAllowlistCount: 2,
      providerProfileCount: 2,
      budgetLimitUsd: 8,
    }));
    expect(result.lastUpdated).toBeTypeOf('string');
  });

  it('returns an empty state when no governance policy exists', async () => {
    const root = makeProject('governance-empty');
    roots.push(root);

    const result = await discoverProjectGovernance(root);

    expect(result.policy).toBeUndefined();
    expect(result.lastUpdated).toBeUndefined();
  });
});
