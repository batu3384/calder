import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MCP_GOVERNANCE_ERROR_CODES } from './ipc-mcp-governance';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockMcpClient = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  listTools: vi.fn(),
  listResources: vi.fn(),
  listPrompts: vi.fn(),
  callTool: vi.fn(),
  readResource: vi.fn(),
  getPrompt: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
}));

vi.mock('./mcp-client', () => ({
  connect: mockMcpClient.connect,
  disconnect: mockMcpClient.disconnect,
  listTools: mockMcpClient.listTools,
  listResources: mockMcpClient.listResources,
  listPrompts: mockMcpClient.listPrompts,
  callTool: mockMcpClient.callTool,
  readResource: mockMcpClient.readResource,
  getPrompt: mockMcpClient.getPrompt,
}));

import { registerMcpHandlers } from './mcp-ipc-handlers';

type McpGovernanceOps = NonNullable<Parameters<typeof registerMcpHandlers>[0]>;

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

function createGovernanceOps() {
  const ops = {
    getActiveProjectPath: vi.fn<() => string | undefined>(() => '/repo'),
    requireKnownProjectPath: vi.fn((projectPath: string, _contextLabel: string) => projectPath),
    assertProjectGovernanceAllows: vi.fn(async () => {}),
  } satisfies McpGovernanceOps;

  return ops;
}

const runtimeCases = [
  {
    channel: 'mcp:connect',
    label: 'Connect MCP server',
    args: ['session-1', 'http://localhost:3000/mcp'] as const,
    mockFn: mockMcpClient.connect,
    result: { success: true, data: 'connected' },
  },
  {
    channel: 'mcp:callTool',
    label: 'Call MCP tool',
    args: ['session-1', 'echo', { text: 'hello' }] as const,
    mockFn: mockMcpClient.callTool,
    result: { success: true, data: { ok: true } },
  },
  {
    channel: 'mcp:readResource',
    label: 'Read MCP resource',
    args: ['session-1', 'resource://docs/readme'] as const,
    mockFn: mockMcpClient.readResource,
    result: { success: true, data: { uri: 'resource://docs/readme' } },
  },
  {
    channel: 'mcp:getPrompt',
    label: 'Get MCP prompt',
    args: ['session-1', 'draft', { topic: 'governance' }] as const,
    mockFn: mockMcpClient.getPrompt,
    result: { success: true, data: { prompt: 'ok' } },
  },
] as const;

describe('mcp IPC runtime governance handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves runtime behavior for allowed governance calls', async () => {
    const ops = createGovernanceOps();
    registerMcpHandlers(ops);

    for (const testCase of runtimeCases) {
      testCase.mockFn.mockResolvedValueOnce(testCase.result);
      const handler = getHandleHandler(testCase.channel);
      await expect(handler({}, ...testCase.args)).resolves.toEqual(testCase.result);
    }

    expect(ops.getActiveProjectPath).toHaveBeenCalledTimes(runtimeCases.length);
    expect(ops.requireKnownProjectPath).toHaveBeenNthCalledWith(1, '/repo', 'Connect MCP server');
    expect(ops.requireKnownProjectPath).toHaveBeenNthCalledWith(2, '/repo', 'Call MCP tool');
    expect(ops.requireKnownProjectPath).toHaveBeenNthCalledWith(3, '/repo', 'Read MCP resource');
    expect(ops.requireKnownProjectPath).toHaveBeenNthCalledWith(4, '/repo', 'Get MCP prompt');
    expect(ops.assertProjectGovernanceAllows).toHaveBeenNthCalledWith(
      1,
      '/repo',
      { kind: 'mcp', label: 'Connect MCP server' },
    );
    expect(ops.assertProjectGovernanceAllows).toHaveBeenNthCalledWith(
      2,
      '/repo',
      { kind: 'mcp', label: 'Call MCP tool' },
    );
    expect(ops.assertProjectGovernanceAllows).toHaveBeenNthCalledWith(
      3,
      '/repo',
      { kind: 'mcp', label: 'Read MCP resource' },
    );
    expect(ops.assertProjectGovernanceAllows).toHaveBeenNthCalledWith(
      4,
      '/repo',
      { kind: 'mcp', label: 'Get MCP prompt' },
    );
  });

  it('returns deterministic no-active-project errors for governed runtime calls', async () => {
    const ops = createGovernanceOps();
    ops.getActiveProjectPath.mockReturnValue(undefined);
    registerMcpHandlers(ops);

    for (const testCase of runtimeCases) {
      const handler = getHandleHandler(testCase.channel);
      await expect(handler({}, ...testCase.args)).resolves.toEqual({
        success: false,
        error: `${MCP_GOVERNANCE_ERROR_CODES.NO_ACTIVE_PROJECT}: ${testCase.label} requires an active project`,
      });
      expect(testCase.mockFn).not.toHaveBeenCalled();
    }
    expect(ops.requireKnownProjectPath).not.toHaveBeenCalled();
    expect(ops.assertProjectGovernanceAllows).not.toHaveBeenCalled();
  });

  it('returns deterministic unknown-project errors when active project is outside known roots', async () => {
    const ops = createGovernanceOps();
    ops.requireKnownProjectPath.mockImplementation((_projectPath: string, contextLabel: string) => {
      throw new Error(`${contextLabel} requires a known project path`);
    });
    registerMcpHandlers(ops);

    for (const testCase of runtimeCases) {
      const handler = getHandleHandler(testCase.channel);
      await expect(handler({}, ...testCase.args)).resolves.toEqual({
        success: false,
        error: `${MCP_GOVERNANCE_ERROR_CODES.UNKNOWN_PROJECT}: ${testCase.label} requires a known project path`,
      });
      expect(testCase.mockFn).not.toHaveBeenCalled();
    }
    expect(ops.assertProjectGovernanceAllows).not.toHaveBeenCalled();
  });

  it('returns deterministic deny errors when governance blocks runtime operations', async () => {
    const ops = createGovernanceOps();
    ops.assertProjectGovernanceAllows.mockRejectedValue(new Error('Governance policy blocked runtime MCP operation'));
    registerMcpHandlers(ops);

    for (const testCase of runtimeCases) {
      const handler = getHandleHandler(testCase.channel);
      await expect(handler({}, ...testCase.args)).resolves.toEqual({
        success: false,
        error: `${MCP_GOVERNANCE_ERROR_CODES.DENIED}: ${testCase.label} is blocked by project governance policy.`,
      });
      expect(testCase.mockFn).not.toHaveBeenCalled();
    }
  });

  it('keeps non-governed MCP list/disconnect handlers unchanged', async () => {
    const ops = createGovernanceOps();
    registerMcpHandlers(ops);

    mockMcpClient.disconnect.mockResolvedValueOnce({ success: true });
    mockMcpClient.listTools.mockResolvedValueOnce({ success: true, data: [] });
    mockMcpClient.listResources.mockResolvedValueOnce({ success: true, data: [] });
    mockMcpClient.listPrompts.mockResolvedValueOnce({ success: true, data: [] });

    const disconnect = getHandleHandler('mcp:disconnect');
    const listTools = getHandleHandler('mcp:listTools');
    const listResources = getHandleHandler('mcp:listResources');
    const listPrompts = getHandleHandler('mcp:listPrompts');

    await expect(disconnect({}, 'session-1')).resolves.toEqual({ success: true });
    await expect(listTools({}, 'session-1')).resolves.toEqual({ success: true, data: [] });
    await expect(listResources({}, 'session-1')).resolves.toEqual({ success: true, data: [] });
    await expect(listPrompts({}, 'session-1')).resolves.toEqual({ success: true, data: [] });

    expect(ops.getActiveProjectPath).not.toHaveBeenCalled();
    expect(ops.requireKnownProjectPath).not.toHaveBeenCalled();
    expect(ops.assertProjectGovernanceAllows).not.toHaveBeenCalled();
  });
});
