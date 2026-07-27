import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AutoApprovalMode } from '../../shared/types/governance.js';
import { discoverProjectGovernance } from './discovery.js';

let mockedGlobalMode: AutoApprovalMode = 'ask';
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
  mockedGlobalMode = 'ask';
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
      '.calder/governance/policy.json': JSON.stringify(
        {
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
            mode: 'project_edits',
            safeToolProfile: 'default-read-only',
          },
        },
        null,
        2,
      ),
    });

    const result = await discoverProjectGovernance(root);

    expect(result.policy).toEqual(
      expect.objectContaining({
        displayName: 'Team safe mode',
        mode: 'enforced',
        toolPolicy: 'block',
        writePolicy: 'ask',
        networkPolicy: 'block',
        mcpAllowlistCount: 2,
        providerProfileCount: 2,
        budgetLimitUsd: 8,
      }),
    );
    expect(result.autoApproval).toEqual({
      globalMode: 'ask',
      projectMode: 'project_edits',
      effectiveMode: 'project_edits',
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
      globalMode: 'ask',
      effectiveMode: 'ask',
      policySource: 'fallback',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
    expect(result.lastUpdated).toBeUndefined();
  });

  it('keeps projectMode undefined for legacy policies without auto approval', async () => {
    const root = makeProject('governance-legacy');
    roots.push(root);
    mockedGlobalMode = 'session_safe';
    mockedGlobalIsExplicit = true;
    writeFiles(root, {
      '.calder/governance/policy.json': JSON.stringify(
        {
          schemaVersion: 1,
          profileName: 'Legacy policy',
          mode: 'advisory',
          toolPolicy: 'ask',
          writePolicy: 'ask',
          networkPolicy: 'ask',
        },
        null,
        2,
      ),
    });

    const result = await discoverProjectGovernance(root);

    expect(result.autoApproval).toEqual({
      globalMode: 'session_safe',
      projectMode: undefined,
      effectiveMode: 'session_safe',
      policySource: 'global',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
  });

  it('maps explicit legacy project off to ask', async () => {
    const root = makeProject('governance-project-off');
    roots.push(root);
    mockedGlobalMode = 'session_safe';
    mockedGlobalIsExplicit = true;
    writeFiles(root, {
      '.calder/governance/policy.json': JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    });

    const result = await discoverProjectGovernance(root);

    expect(result.autoApproval).toEqual({
      globalMode: 'session_safe',
      projectMode: 'ask',
      effectiveMode: 'ask',
      policySource: 'project',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
  });

  it('maps full_auto project override to ask', async () => {
    const root = makeProject('governance-project-full-auto');
    roots.push(root);
    mockedGlobalMode = 'ask';
    mockedGlobalIsExplicit = true;
    writeFiles(root, {
      '.calder/governance/policy.json': JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    });

    const result = await discoverProjectGovernance(root);

    expect(result.autoApproval).toEqual({
      globalMode: 'ask',
      projectMode: 'ask',
      effectiveMode: 'ask',
      policySource: 'project',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
  });

  it('maps full_auto_unsafe project override to ask', async () => {
    const root = makeProject('governance-project-full-auto-unsafe');
    roots.push(root);
    mockedGlobalMode = 'ask';
    mockedGlobalIsExplicit = true;
    writeFiles(root, {
      '.calder/governance/policy.json': JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    });

    const result = await discoverProjectGovernance(root);

    expect(result.autoApproval).toEqual({
      globalMode: 'ask',
      projectMode: 'ask',
      effectiveMode: 'ask',
      policySource: 'project',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });
  });
});
