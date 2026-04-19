import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AutoApprovalMode } from '../../shared/types.js';
import { discoverProjectGovernance } from './discovery.js';

let mockedGlobalMode: AutoApprovalMode = 'off';
let mockedGlobalIsExplicit = false;

vi.mock('./auto-approval-policy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auto-approval-policy.js')>();
  return {
    ...actual,
    readGlobalAutoApprovalPolicy: () => ({
      mode: mockedGlobalMode,
      isExplicit: mockedGlobalIsExplicit,
    }),
  };
});

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
  mockedGlobalMode = 'off';
  mockedGlobalIsExplicit = false;
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
        autoApproval: {
          mode: 'edit_only',
          safeToolProfile: 'default-read-only',
        },
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
    expect(result.autoApproval).toEqual({
      globalMode: 'off',
      projectMode: 'edit_only',
      effectiveMode: 'edit_only',
      policySource: 'project',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
    expect(result.lastUpdated).toBeTypeOf('string');
  });

  it('returns an empty state when no governance policy exists', async () => {
    const root = makeProject('governance-empty');
    roots.push(root);

    const result = await discoverProjectGovernance(root);

    expect(result.policy).toBeUndefined();
    expect(result.autoApproval).toEqual({
      globalMode: 'off',
      effectiveMode: 'off',
      policySource: 'fallback',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
    expect(result.lastUpdated).toBeUndefined();
  });

  it('keeps projectMode undefined for legacy policies without auto approval', async () => {
    const root = makeProject('governance-legacy');
    roots.push(root);
    mockedGlobalMode = 'edit_plus_safe_tools';
    mockedGlobalIsExplicit = true;
    writeFiles(root, {
      '.calder/governance/policy.json': JSON.stringify({
        schemaVersion: 1,
        profileName: 'Legacy policy',
        mode: 'advisory',
        toolPolicy: 'ask',
        writePolicy: 'ask',
        networkPolicy: 'ask',
      }, null, 2),
    });

    const result = await discoverProjectGovernance(root);

    expect(result.autoApproval).toEqual({
      globalMode: 'edit_plus_safe_tools',
      projectMode: undefined,
      effectiveMode: 'edit_plus_safe_tools',
      policySource: 'global',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
  });

  it('uses explicit project off as the effective source', async () => {
    const root = makeProject('governance-project-off');
    roots.push(root);
    mockedGlobalMode = 'edit_plus_safe_tools';
    mockedGlobalIsExplicit = true;
    writeFiles(root, {
      '.calder/governance/policy.json': JSON.stringify({
        schemaVersion: 1,
        profileName: 'Project override',
        mode: 'advisory',
        toolPolicy: 'ask',
        writePolicy: 'ask',
        networkPolicy: 'ask',
        autoApproval: {
          mode: 'off',
          safeToolProfile: 'default-read-only',
        },
      }, null, 2),
    });

    const result = await discoverProjectGovernance(root);

    expect(result.autoApproval).toEqual({
      globalMode: 'edit_plus_safe_tools',
      projectMode: 'off',
      effectiveMode: 'off',
      policySource: 'project',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
  });

  it('parses full_auto project override from policy', async () => {
    const root = makeProject('governance-project-full-auto');
    roots.push(root);
    mockedGlobalMode = 'off';
    mockedGlobalIsExplicit = true;
    writeFiles(root, {
      '.calder/governance/policy.json': JSON.stringify({
        schemaVersion: 1,
        profileName: 'Project full auto',
        mode: 'advisory',
        toolPolicy: 'ask',
        writePolicy: 'ask',
        networkPolicy: 'ask',
        autoApproval: {
          mode: 'full_auto',
          safeToolProfile: 'default-read-only',
        },
      }, null, 2),
    });

    const result = await discoverProjectGovernance(root);

    expect(result.autoApproval).toEqual({
      globalMode: 'off',
      projectMode: 'full_auto',
      effectiveMode: 'full_auto',
      policySource: 'project',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
  });

  it('parses full_auto_unsafe project override from policy', async () => {
    const root = makeProject('governance-project-full-auto-unsafe');
    roots.push(root);
    mockedGlobalMode = 'off';
    mockedGlobalIsExplicit = true;
    writeFiles(root, {
      '.calder/governance/policy.json': JSON.stringify({
        schemaVersion: 1,
        profileName: 'Project full auto unsafe',
        mode: 'advisory',
        toolPolicy: 'ask',
        writePolicy: 'ask',
        networkPolicy: 'ask',
        autoApproval: {
          mode: 'full_auto_unsafe',
          safeToolProfile: 'default-read-only',
        },
      }, null, 2),
    });

    const result = await discoverProjectGovernance(root);

    expect(result.autoApproval).toEqual({
      globalMode: 'off',
      projectMode: 'full_auto_unsafe',
      effectiveMode: 'full_auto_unsafe',
      policySource: 'project',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
  });
});
