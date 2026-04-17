import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDiscoverProjectGovernance, mockReadFile } = vi.hoisted(() => ({
  mockDiscoverProjectGovernance: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('./discovery.js', () => ({
  POLICY_RELATIVE_PATH: '.calder/governance/policy.json',
  discoverProjectGovernance: mockDiscoverProjectGovernance,
}));

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

import { evaluateProjectGovernanceOperation } from './enforcement.js';

function enforcedPolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'governance:/tmp/project/.calder/governance/policy.json',
    path: '/tmp/project/.calder/governance/policy.json',
    displayName: 'Project guardrails',
    summary: 'enforced',
    lastUpdated: '2026-04-14T00:00:00.000Z',
    mode: 'enforced',
    toolPolicy: 'allow',
    writePolicy: 'allow',
    networkPolicy: 'allow',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReadFile.mockResolvedValue('{}');
  mockDiscoverProjectGovernance.mockResolvedValue({
    policy: enforcedPolicy(),
    lastUpdated: '2026-04-14T00:00:00.000Z',
  });
});

describe('evaluateProjectGovernanceOperation mcp branch edges', () => {
  it('asks when enforced tool policy is ask', async () => {
    mockDiscoverProjectGovernance.mockResolvedValueOnce({
      policy: enforcedPolicy({ toolPolicy: 'ask' }),
      lastUpdated: '2026-04-14T00:00:00.000Z',
    });

    await expect(
      evaluateProjectGovernanceOperation('/tmp/project', { kind: 'mcp', label: 'Add MCP server', target: 'memory' }),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'ask',
    });
  });

  it('blocks when enforced tool policy is block', async () => {
    mockDiscoverProjectGovernance.mockResolvedValueOnce({
      policy: enforcedPolicy({ toolPolicy: 'block' }),
      lastUpdated: '2026-04-14T00:00:00.000Z',
    });

    await expect(
      evaluateProjectGovernanceOperation('/tmp/project', { kind: 'mcp', label: 'Add MCP server', target: 'memory' }),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'block',
    });
  });

  it('falls back to write ask/block decisions when tool policy allows', async () => {
    mockDiscoverProjectGovernance.mockResolvedValueOnce({
      policy: enforcedPolicy({ toolPolicy: 'allow', writePolicy: 'ask' }),
      lastUpdated: '2026-04-14T00:00:00.000Z',
    });
    await expect(
      evaluateProjectGovernanceOperation('/tmp/project', { kind: 'mcp', label: 'Add MCP server', target: 'memory' }),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'ask',
    });

    mockDiscoverProjectGovernance.mockResolvedValueOnce({
      policy: enforcedPolicy({ toolPolicy: 'allow', writePolicy: 'block' }),
      lastUpdated: '2026-04-14T00:00:00.000Z',
    });
    await expect(
      evaluateProjectGovernanceOperation('/tmp/project', { kind: 'mcp', label: 'Add MCP server', target: 'memory' }),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'block',
    });
  });

  it('allows mcp when raw allowlist cannot be read (readRawPolicy fallback)', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

    await expect(
      evaluateProjectGovernanceOperation('/tmp/project', { kind: 'mcp', label: 'Add MCP server', target: 'browser' }),
    ).resolves.toMatchObject({
      allowed: true,
      status: 'allow',
    });
  });

  it('allows unknown operation kinds by default', async () => {
    await expect(
      evaluateProjectGovernanceOperation('/tmp/project', { kind: 'unknown' as any, label: 'Other op' }),
    ).resolves.toMatchObject({
      allowed: true,
      status: 'allow',
    });
  });

  it('enforces network ask/block decisions when mode is enforced', async () => {
    mockDiscoverProjectGovernance.mockResolvedValueOnce({
      policy: enforcedPolicy({ networkPolicy: 'ask' }),
      lastUpdated: '2026-04-14T00:00:00.000Z',
    });

    await expect(
      evaluateProjectGovernanceOperation('/tmp/project', { kind: 'network', label: 'Open external URL' }),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'ask',
    });

    mockDiscoverProjectGovernance.mockResolvedValueOnce({
      policy: enforcedPolicy({ networkPolicy: 'block' }),
      lastUpdated: '2026-04-14T00:00:00.000Z',
    });

    await expect(
      evaluateProjectGovernanceOperation('/tmp/project', { kind: 'network', label: 'Open external URL' }),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'block',
    });
  });

  it('blocks when estimated operation cost exceeds budget limit', async () => {
    mockDiscoverProjectGovernance.mockResolvedValueOnce({
      policy: enforcedPolicy({ budgetLimitUsd: 2 }),
      lastUpdated: '2026-04-14T00:00:00.000Z',
    });

    await expect(
      evaluateProjectGovernanceOperation('/tmp/project', {
        kind: 'budget',
        label: 'Run expensive task',
        estimatedCostUsd: 3,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'block',
    });
  });
});
