import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GLOBAL_AUTO_APPROVAL_POLICY_PATH,
  readAutoApprovalModeFromPolicyFile,
  resolveEffectiveAutoApprovalMode,
  setAutoApprovalModeInPolicyFile,
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

  it('supports full_auto as an explicit override mode', () => {
    const result = resolveEffectiveAutoApprovalMode({
      globalMode: 'off',
      projectMode: 'full_auto',
    });

    expect(result.effectiveMode).toBe('full_auto');
    expect(result.policySource).toBe('project');
  });

  it('supports full_auto_unsafe as an explicit override mode', () => {
    const result = resolveEffectiveAutoApprovalMode({
      globalMode: 'off',
      projectMode: 'full_auto_unsafe',
    });

    expect(result.effectiveMode).toBe('full_auto_unsafe');
    expect(result.policySource).toBe('project');
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

  it('treats explicit project off as an override over global mode', () => {
    const result = resolveEffectiveAutoApprovalMode({
      globalMode: 'edit_plus_safe_tools',
      projectMode: 'off',
    });

    expect(result.effectiveMode).toBe('off');
    expect(result.policySource).toBe('project');
  });

  it('treats explicit session off as an override over project and global mode', () => {
    const result = resolveEffectiveAutoApprovalMode({
      globalMode: 'edit_plus_safe_tools',
      projectMode: 'edit_only',
      sessionMode: 'off',
    });

    expect(result.effectiveMode).toBe('off');
    expect(result.policySource).toBe('session');
  });

  it('falls back to off when all layers resolve to off', () => {
    const result = resolveEffectiveAutoApprovalMode({});

    expect(result.effectiveMode).toBe('off');
    expect(result.policySource).toBe('fallback');
  });

  it('honors precedence across global, project, and session mode combinations', () => {
    const modeOptions = [undefined, 'off', 'edit_only', 'edit_plus_safe_tools', 'full_auto', 'full_auto_unsafe'] as const;

    for (const globalMode of modeOptions) {
      for (const projectMode of modeOptions) {
        for (const sessionMode of modeOptions) {
          const result = resolveEffectiveAutoApprovalMode({
            ...(globalMode !== undefined ? { globalMode } : {}),
            ...(projectMode !== undefined ? { projectMode } : {}),
            ...(sessionMode !== undefined ? { sessionMode } : {}),
          });

          const expectedMode = sessionMode ?? projectMode ?? globalMode ?? 'off';
          const expectedSource = sessionMode !== undefined
            ? 'session'
            : projectMode !== undefined
              ? 'project'
              : globalMode !== undefined
                ? 'global'
                : 'fallback';

          expect(result.effectiveMode).toBe(expectedMode);
          expect(result.policySource).toBe(expectedSource);
        }
      }
    }
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

  it('reads full_auto mode from policy files', () => {
    const root = makeTempDir('auto-approval-full-auto');
    roots.push(root);
    const filePath = writePolicy(root, '.calder/governance/default-policy.json', {
      autoApproval: {
        mode: 'full_auto',
      },
    });

    expect(readAutoApprovalModeFromPolicyFile(filePath)).toBe('full_auto');
  });

  it('reads full_auto_unsafe mode from policy files', () => {
    const root = makeTempDir('auto-approval-full-auto-unsafe');
    roots.push(root);
    const filePath = writePolicy(root, '.calder/governance/default-policy.json', {
      autoApproval: {
        mode: 'full_auto_unsafe',
      },
    });

    expect(readAutoApprovalModeFromPolicyFile(filePath)).toBe('full_auto_unsafe');
  });

  it('exposes the default global policy path', () => {
    expect(GLOBAL_AUTO_APPROVAL_POLICY_PATH).toContain('.calder');
    expect(GLOBAL_AUTO_APPROVAL_POLICY_PATH).toContain('governance');
    expect(GLOBAL_AUTO_APPROVAL_POLICY_PATH).toContain('default-policy.json');
  });
});

describe('setAutoApprovalModeInPolicyFile', () => {
  it('writes a mode into a missing policy file', () => {
    const root = makeTempDir('auto-approval-set-mode');
    roots.push(root);
    const filePath = join(root, '.calder/governance/policy.json');

    setAutoApprovalModeInPolicyFile(filePath, 'edit_plus_safe_tools');

    expect(readAutoApprovalModeFromPolicyFile(filePath)).toBe('edit_plus_safe_tools');
  });

  it('removes project auto approval override while preserving other policy fields', () => {
    const root = makeTempDir('auto-approval-clear-mode');
    roots.push(root);
    const filePath = writePolicy(root, '.calder/governance/policy.json', {
      schemaVersion: 1,
      profileName: 'Project guardrails',
      toolPolicy: 'ask',
      autoApproval: {
        mode: 'edit_only',
        safeToolProfile: 'default-read-only',
      },
    });

    setAutoApprovalModeInPolicyFile(filePath, null);

    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    const autoApproval = parsed.autoApproval as Record<string, unknown>;
    expect(autoApproval.mode).toBeUndefined();
    expect(autoApproval.safeToolProfile).toBe('default-read-only');
    expect(parsed.toolPolicy).toBe('ask');
  });

  it('does not create a policy file when clearing a missing override', () => {
    const root = makeTempDir('auto-approval-clear-missing');
    roots.push(root);
    const filePath = join(root, '.calder/governance/policy.json');

    setAutoApprovalModeInPolicyFile(filePath, null);

    expect(existsSync(filePath)).toBe(false);
  });
});
