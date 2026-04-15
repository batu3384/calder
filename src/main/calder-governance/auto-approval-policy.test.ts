import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GLOBAL_AUTO_APPROVAL_POLICY_PATH,
  readAutoApprovalModeFromPolicyFile,
  resolveEffectiveAutoApprovalMode,
} from './auto-approval-policy.js';

const roots: string[] = [];

function makeTempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

function writePolicy(root: string, relativePath: string, contents: unknown): string {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(contents, null, 2), 'utf8');
  return filePath;
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('resolveEffectiveAutoApprovalMode', () => {
  it('uses session override first', () => {
    const result = resolveEffectiveAutoApprovalMode({
      globalMode: 'off',
      projectMode: 'edit_only',
      sessionMode: 'edit_plus_safe_tools',
    });

    expect(result.effectiveMode).toBe('edit_plus_safe_tools');
    expect(result.policySource).toBe('session');
  });

  it('uses project mode over global mode', () => {
    const result = resolveEffectiveAutoApprovalMode({
      globalMode: 'off',
      projectMode: 'edit_only',
    });

    expect(result.effectiveMode).toBe('edit_only');
    expect(result.policySource).toBe('project');
  });

  it('uses global mode when no project or session override exists', () => {
    const result = resolveEffectiveAutoApprovalMode({
      globalMode: 'edit_plus_safe_tools',
    });

    expect(result.effectiveMode).toBe('edit_plus_safe_tools');
    expect(result.policySource).toBe('global');
  });

  it('falls back to off when all layers resolve to off', () => {
    const result = resolveEffectiveAutoApprovalMode({
      globalMode: 'off',
    });

    expect(result.effectiveMode).toBe('off');
    expect(result.policySource).toBe('fallback');
  });
});

describe('readAutoApprovalModeFromPolicyFile', () => {
  it('reads auto approval mode from a policy file', () => {
    const root = makeTempDir('auto-approval-policy');
    roots.push(root);
    const filePath = writePolicy(root, '.calder/governance/default-policy.json', {
      autoApproval: {
        mode: 'edit_plus_safe_tools',
      },
    });

    expect(readAutoApprovalModeFromPolicyFile(filePath)).toBe('edit_plus_safe_tools');
  });

  it('returns off for a missing policy file', () => {
    const root = makeTempDir('auto-approval-missing');
    roots.push(root);

    expect(readAutoApprovalModeFromPolicyFile(join(root, 'missing.json'))).toBe('off');
  });

  it('returns off for malformed policy content', () => {
    const root = makeTempDir('auto-approval-malformed');
    roots.push(root);
    const filePath = join(root, '.calder/governance/default-policy.json');
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, '{not-json', 'utf8');

    expect(readAutoApprovalModeFromPolicyFile(filePath)).toBe('off');
  });

  it('returns off for unsupported policy modes', () => {
    const root = makeTempDir('auto-approval-unsupported');
    roots.push(root);
    const filePath = writePolicy(root, '.calder/governance/default-policy.json', {
      autoApproval: {
        mode: 'always_on',
      },
    });

    expect(readAutoApprovalModeFromPolicyFile(filePath)).toBe('off');
  });

  it('exposes the default global policy path', () => {
    expect(GLOBAL_AUTO_APPROVAL_POLICY_PATH).toContain('.calder');
    expect(GLOBAL_AUTO_APPROVAL_POLICY_PATH).toContain('governance');
    expect(GLOBAL_AUTO_APPROVAL_POLICY_PATH).toContain('default-policy.json');
  });
});
