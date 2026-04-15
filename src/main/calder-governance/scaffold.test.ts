import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectGovernanceStarterPolicy } from './scaffold.js';

const roots: string[] = [];

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
    expect(result.state.autoApproval).toEqual({
      globalMode: 'off',
      projectMode: 'off',
      effectiveMode: 'off',
      policySource: 'fallback',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });

    const second = await createProjectGovernanceStarterPolicy(root);
    expect(second.created).toBe(false);
    expect(readFileSync(policyPath, 'utf8')).toContain('"mode": "advisory"');
  });
});
