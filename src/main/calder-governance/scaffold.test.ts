import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AutoApprovalMode } from '../../shared/types.js';
import { createProjectGovernanceStarterPolicy } from './scaffold.js';

const roots: string[] = [];
const AUTO_APPROVAL_MODES = new Set<AutoApprovalMode>([
  'off',
  'edit_only',
  'edit_plus_safe_tools',
  'full_auto',
  'full_auto_unsafe',
]);

function makeProject(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('project governance scaffold', () => {
  it('creates a starter governance policy without overwriting existing files', async () => {
    const root = makeProject('governance-starter');
    roots.push(root);

    const result = await createProjectGovernanceStarterPolicy(root);
    const policyPath = join(root, result.relativePath);

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe('.calder/governance/policy.json');
    expect(readFileSync(policyPath, 'utf8')).toContain('"mode": "advisory"');
    expect(readFileSync(policyPath, 'utf8')).toContain('"toolPolicy": "ask"');
    expect(readFileSync(policyPath, 'utf8')).toContain('"autoApproval": {');
    expect(readFileSync(policyPath, 'utf8')).toContain('"mode": "off"');
    expect(readFileSync(policyPath, 'utf8')).toContain('"safeToolProfile": "default-read-only"');
    expect(readFileSync(policyPath, 'utf8')).toContain('"providerProfiles": {}');
    expect(result.state.policy?.writePolicy).toBe('ask');
    expect(result.state.autoApproval).toEqual(expect.objectContaining({
      projectMode: 'off',
      effectiveMode: 'off',
      policySource: 'project',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    }));
    expect(result.state.autoApproval?.globalMode).toBeDefined();
    expect(AUTO_APPROVAL_MODES.has(result.state.autoApproval!.globalMode)).toBe(true);

    const second = await createProjectGovernanceStarterPolicy(root);
    expect(second.created).toBe(false);
    expect(readFileSync(policyPath, 'utf8')).toContain('"mode": "advisory"');
  });
});
