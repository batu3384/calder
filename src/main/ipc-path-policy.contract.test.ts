import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('path policy delegation contract', () => {
  const ipcHandlersSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
  const pathPolicySource = readFileSync(path.join(process.cwd(), 'src/main/ipc-path-policy.ts'), 'utf8');

  it('uses dedicated path-policy module from ipc-handlers', () => {
    expect(ipcHandlersSource).toContain("from './ipc-path-policy'");
    expect(pathPolicySource).toContain('export function isWithinKnownProject');
    expect(pathPolicySource).toContain('export function requireKnownProjectPath');
    expect(pathPolicySource).toContain('export function getActiveProjectPath');
    expect(pathPolicySource).toContain('export function isAllowedDirectoryLookupPath');
  });
});
