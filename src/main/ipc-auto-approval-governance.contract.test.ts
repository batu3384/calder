import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('auto-approval governance helper delegation contract', () => {
  const ipcHandlersSource = readFileSync(
    path.join(process.cwd(), 'src/main/ipc-handlers.ts'),
    'utf8',
  );
  const helperSource = readFileSync(
    path.join(process.cwd(), 'src/main/ipc-auto-approval-governance.ts'),
    'utf8',
  );

  it('uses dedicated helper module from ipc-handlers', () => {
    expect(ipcHandlersSource).toContain("from './ipc-auto-approval-governance'");
    expect(helperSource).toContain('export function isAutoApprovalMode');
    expect(helperSource).toContain('export function updateAutoApprovalMode');
    expect(helperSource).toContain('export async function applySessionOverrideToGovernanceState');
  });
});
