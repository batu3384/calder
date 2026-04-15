import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('IPC governance contract', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');

  it('guards Calder-controlled project writes through governance enforcement', () => {
    expect(source).toContain('assertProjectGovernanceAllows');
    expect(source).toContain("label: 'Create context starter files'");
    expect(source).toContain("label: 'Create shared context rule'");
    expect(source).toContain("label: 'Create workflow file'");
    expect(source).toContain("label: 'Create review findings file'");
    expect(source).toContain("label: 'Create checkpoint'");
  });

  it('guards project MCP server additions with the governance allowlist', () => {
    expect(source).toContain("kind: 'mcp'");
    expect(source).toContain("label: 'Add project MCP server'");
    expect(source).toContain('target: name');
  });

  it('exposes governance IPC handlers for auto-approval controls', () => {
    expect(source).toContain("'governance:setAutoApprovalMode'");
    expect(source).toContain("'governance:setSessionAutoApprovalOverride'");
    expect(source).toContain("scope === 'project' && (mode === null || isAutoApprovalMode(mode))");
  });
});
