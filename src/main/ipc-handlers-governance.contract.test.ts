import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('IPC governance contract', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
  const calderIpcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-calder.ts'), 'utf8');
  const mcpGovernanceSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-mcp-governance.ts'), 'utf8');

  it('guards Calder-controlled project writes through governance enforcement', () => {
    expect(source).toContain('registerCalderIpcHandlers({');
    expect(calderIpcSource).toContain('ops.assertProjectGovernanceAllows');
    expect(calderIpcSource).toContain("label: 'Create context starter files'");
    expect(calderIpcSource).toContain("label: 'Create shared context rule'");
    expect(calderIpcSource).toContain("label: 'Create workflow file'");
    expect(calderIpcSource).toContain("label: 'Create review findings file'");
    expect(calderIpcSource).toContain("label: 'Create checkpoint'");
    expect(calderIpcSource).toContain("label: 'Create governance starter policy'");
  });

  it('guards project MCP server additions and removals with governance enforcement', () => {
    expect(source).toContain('registerMcpGovernanceIpcHandlers({');
    expect(mcpGovernanceSource).toContain("kind: 'mcp'");
    expect(mcpGovernanceSource).toContain("label: 'Add project MCP server'");
    expect(mcpGovernanceSource).toContain("label: 'Remove project MCP server'");
    expect(mcpGovernanceSource).toContain('target: name');
    expect(mcpGovernanceSource).toContain("projectPath is required for project MCP scope");
  });

  it('guards renderer-triggered external URL opens with network governance', () => {
    expect(source).toContain("requireKnownProjectPath(cwd, 'Open external URL')");
    expect(source).toContain('getActiveProjectPath()');
    expect(source).toContain("kind: 'network'");
    expect(source).toContain("label: 'Open external URL'");
    expect(source).toContain('target: parsed.hostname');
  });

  it('exposes governance IPC handlers for auto-approval controls', () => {
    expect(calderIpcSource).toContain("'governance:setAutoApprovalMode'");
    expect(calderIpcSource).toContain("'governance:setSessionAutoApprovalOverride'");
    expect(calderIpcSource).toContain("scope === 'project' && (mode === null || ops.isAutoApprovalMode(mode))");
  });

  it('uses provider-aware auto-approval dispatch with missing-session fallback', () => {
    expect(source).toContain('resolveAutoApprovalInput(providerId)');
    expect(source).toContain('Failed to write approval input: missing PTY session');
  });
});
