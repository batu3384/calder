import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockAddMcpServer = vi.hoisted(() => vi.fn());
const mockRemoveMcpServer = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
}));

vi.mock('./claude-cli', () => ({
  addMcpServer: mockAddMcpServer,
  removeMcpServer: mockRemoveMcpServer,
}));

import { registerMcpGovernanceIpcHandlers } from './ipc-mcp-governance';

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

describe('ipc MCP governance handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects project-scoped add/remove calls when projectPath is missing', async () => {
    const ops = {
      requireKnownProjectPath: vi.fn(),
      assertProjectGovernanceAllows: vi.fn(async () => {}),
    };
    registerMcpGovernanceIpcHandlers(ops);

    const addServer = getHandleHandler('mcp:addServer');
    const removeServer = getHandleHandler('mcp:removeServer');

    const addResult = await addServer({}, 'docs', { command: 'npx', args: ['-y', 'docs'] }, 'project');
    const removeResult = await removeServer({}, 'docs', '/tmp/.mcp.json', 'project');

    expect(addResult.success).toBe(false);
    expect(removeResult.success).toBe(false);
    expect(String(addResult.error)).toContain('projectPath is required');
    expect(String(removeResult.error)).toContain('projectPath is required');
    expect(mockAddMcpServer).not.toHaveBeenCalled();
    expect(mockRemoveMcpServer).not.toHaveBeenCalled();
  });

  it('enforces governance for project-scoped add/remove operations', async () => {
    const ops = {
      requireKnownProjectPath: vi.fn(() => '/repo'),
      assertProjectGovernanceAllows: vi.fn(async () => {}),
    };
    registerMcpGovernanceIpcHandlers(ops);

    const addServer = getHandleHandler('mcp:addServer');
    const removeServer = getHandleHandler('mcp:removeServer');

    const addResult = await addServer({}, 'docs', { command: 'npx' }, 'project', '/repo');
    const removeResult = await removeServer({}, 'docs', '/repo/.mcp.json', 'project', '/repo');

    expect(ops.requireKnownProjectPath).toHaveBeenCalledWith('/repo', 'Add project MCP server');
    expect(ops.requireKnownProjectPath).toHaveBeenCalledWith('/repo', 'Remove project MCP server');
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith(
      '/repo',
      { kind: 'mcp', label: 'Add project MCP server', target: 'docs' },
    );
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith(
      '/repo',
      { kind: 'mcp', label: 'Remove project MCP server', target: 'docs' },
    );
    expect(mockAddMcpServer).toHaveBeenCalledWith('docs', { command: 'npx' }, 'project', '/repo');
    expect(mockRemoveMcpServer).toHaveBeenCalledWith('docs', '/repo/.mcp.json', 'project', '/repo');
    expect(addResult).toEqual({ success: true });
    expect(removeResult).toEqual({ success: true });
  });

  it('allows user-scoped add/remove operations without project governance checks', async () => {
    const ops = {
      requireKnownProjectPath: vi.fn(() => '/repo'),
      assertProjectGovernanceAllows: vi.fn(async () => {}),
    };
    registerMcpGovernanceIpcHandlers(ops);

    const addServer = getHandleHandler('mcp:addServer');
    const removeServer = getHandleHandler('mcp:removeServer');

    await addServer({}, 'docs', { command: 'npx' }, 'user');
    await removeServer({}, 'docs', '/home/test/.mcp.json', 'user');

    expect(ops.requireKnownProjectPath).not.toHaveBeenCalled();
    expect(ops.assertProjectGovernanceAllows).not.toHaveBeenCalled();
    expect(mockAddMcpServer).toHaveBeenCalledWith('docs', { command: 'npx' }, 'user', undefined);
    expect(mockRemoveMcpServer).toHaveBeenCalledWith('docs', '/home/test/.mcp.json', 'user', undefined);
  });
});

