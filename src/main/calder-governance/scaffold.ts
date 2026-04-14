import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectGovernanceStarterPolicyResult } from '../../shared/types.js';
import { discoverProjectGovernance, POLICY_RELATIVE_PATH } from './discovery.js';

function buildStarterPolicy(): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    profileName: 'Project guardrails',
    mode: 'advisory',
    toolPolicy: 'ask',
    writePolicy: 'ask',
    networkPolicy: 'ask',
    mcpAllowlist: [],
    providerProfiles: {},
    budgetLimitUsd: 10,
    notes: [
      'Use advisory mode while tuning the project policy.',
      'Switch to enforced mode only after the team agrees on the guardrails.',
    ],
  }, null, 2)}\n`;
}

export async function createProjectGovernanceStarterPolicy(
  projectPath: string,
): Promise<ProjectGovernanceStarterPolicyResult> {
  const fullPath = path.join(projectPath, POLICY_RELATIVE_PATH);
  let created = false;

  try {
    await readFile(fullPath, 'utf8');
  } catch {
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buildStarterPolicy(), 'utf8');
    created = true;
  }

  const state = await discoverProjectGovernance(projectPath);
  return {
    created,
    relativePath: POLICY_RELATIVE_PATH.split(path.sep).join(path.posix.sep),
    state,
  };
}
