import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertProjectGovernanceAllows, evaluateProjectGovernanceOperation } from './enforcement.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'calder-governance-enforcement-'));
  roots.push(root);
  return root;
}

function writePolicy(root: string, policy: Record<string, unknown>): void {
  const dir = path.join(root, '.calder', 'governance');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'policy.json'), JSON.stringify(policy, null, 2), 'utf8');
}

describe('project governance enforcement', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows operations when no policy exists or policy is advisory', async () => {
    const root = tempRoot();
    expect(await evaluateProjectGovernanceOperation(root, { kind: 'write', label: 'Create workflow' })).toMatchObject({
      allowed: true,
      status: 'allow',
    });

    writePolicy(root, {
      mode: 'advisory',
      writePolicy: 'block',
      networkPolicy: 'block',
    });

    expect(await evaluateProjectGovernanceOperation(root, { kind: 'write', label: 'Create workflow' })).toMatchObject({
      allowed: true,
      status: 'advisory',
    });
  });

  it('blocks enforced write operations when write policy is ask or block', async () => {
    const root = tempRoot();
    writePolicy(root, {
      mode: 'enforced',
      writePolicy: 'ask',
      networkPolicy: 'allow',
    });

    expect(await evaluateProjectGovernanceOperation(root, { kind: 'write', label: 'Create checkpoint' })).toMatchObject({
      allowed: false,
      status: 'ask',
    });

    writePolicy(root, {
      mode: 'enforced',
      writePolicy: 'block',
      networkPolicy: 'allow',
    });

    await expect(assertProjectGovernanceAllows(root, { kind: 'write', label: 'Create checkpoint' }))
      .rejects.toThrow('Governance policy blocked Create checkpoint');
  });

  it('blocks project MCP additions outside an enforced allowlist', async () => {
    const root = tempRoot();
    writePolicy(root, {
      mode: 'enforced',
      toolPolicy: 'allow',
      writePolicy: 'allow',
      networkPolicy: 'allow',
      mcpAllowlist: ['memory'],
    });

    expect(await evaluateProjectGovernanceOperation(root, { kind: 'mcp', label: 'Add MCP server', target: 'memory' })).toMatchObject({
      allowed: true,
      status: 'allow',
    });
    expect(await evaluateProjectGovernanceOperation(root, { kind: 'mcp', label: 'Add MCP server', target: 'browser' })).toMatchObject({
      allowed: false,
      status: 'block',
    });
  });

  it('enforces network policy for runtime URL opens', async () => {
    const root = tempRoot();
    writePolicy(root, {
      mode: 'enforced',
      toolPolicy: 'allow',
      writePolicy: 'allow',
      networkPolicy: 'ask',
    });

    expect(await evaluateProjectGovernanceOperation(root, {
      kind: 'network',
      label: 'Open external URL',
      target: 'https://example.com',
    })).toMatchObject({
      allowed: false,
      status: 'ask',
    });

    writePolicy(root, {
      mode: 'enforced',
      toolPolicy: 'allow',
      writePolicy: 'allow',
      networkPolicy: 'block',
    });

    expect(await evaluateProjectGovernanceOperation(root, {
      kind: 'network',
      label: 'Open external URL',
      target: 'https://example.com',
    })).toMatchObject({
      allowed: false,
      status: 'block',
    });
  });

  it('blocks operations that exceed the enforced project budget limit', async () => {
    const root = tempRoot();
    writePolicy(root, {
      mode: 'enforced',
      toolPolicy: 'allow',
      writePolicy: 'allow',
      networkPolicy: 'allow',
      budgetLimitUsd: 5,
    });

    expect(await evaluateProjectGovernanceOperation(root, {
      kind: 'budget',
      label: 'Run premium automation',
      estimatedCostUsd: 3,
    })).toMatchObject({
      allowed: true,
      status: 'allow',
    });

    expect(await evaluateProjectGovernanceOperation(root, {
      kind: 'budget',
      label: 'Run premium automation',
      estimatedCostUsd: 7.5,
    })).toMatchObject({
      allowed: false,
      status: 'block',
    });
  });
});
