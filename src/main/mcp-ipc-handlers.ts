import { ipcMain } from 'electron';

import { assertProjectGovernanceAllows as assertProjectGovernanceAllowsFromEnforcement } from './calder-governance/enforcement';
import {
  buildMcpGovernanceFailure,
  buildMcpGovernanceFailureFromError,
  MCP_GOVERNANCE_ERROR_CODES,
  type McpGovernanceOperation,
} from './ipc-mcp-governance';
import { getActiveProjectPath as getActiveProjectPathFromPolicy, requireKnownProjectPath as requireKnownProjectPathFromPolicy } from './ipc-path-policy';
import * as mcpClient from './mcp-client';

interface McpRuntimeGovernanceOps {
  getActiveProjectPath: () => string | undefined;
  requireKnownProjectPath: (projectPath: string, contextLabel: string) => string;
  assertProjectGovernanceAllows: (
    projectPath: string,
    operation: McpGovernanceOperation,
  ) => Promise<void>;
}

const defaultMcpRuntimeGovernanceOps: McpRuntimeGovernanceOps = {
  getActiveProjectPath: getActiveProjectPathFromPolicy,
  requireKnownProjectPath: requireKnownProjectPathFromPolicy,
  assertProjectGovernanceAllows: assertProjectGovernanceAllowsFromEnforcement,
};

async function enforceMcpRuntimeGovernance(
  ops: McpRuntimeGovernanceOps,
  operation: McpGovernanceOperation,
): Promise<{ success: false; error: string } | null> {
  const activeProjectPath = ops.getActiveProjectPath();
  if (!activeProjectPath) {
    return buildMcpGovernanceFailure(
      MCP_GOVERNANCE_ERROR_CODES.NO_ACTIVE_PROJECT,
      `${operation.label} requires an active project`,
    );
  }

  let validatedProjectPath: string;
  try {
    validatedProjectPath = ops.requireKnownProjectPath(activeProjectPath, operation.label);
  } catch (error) {
    return buildMcpGovernanceFailureFromError(
      error,
      MCP_GOVERNANCE_ERROR_CODES.UNKNOWN_PROJECT,
      `${operation.label} requires a known project path`,
    );
  }

  try {
    await ops.assertProjectGovernanceAllows(validatedProjectPath, operation);
  } catch (error) {
    return buildMcpGovernanceFailureFromError(
      error,
      MCP_GOVERNANCE_ERROR_CODES.DENIED,
      `${operation.label} is blocked by project governance policy.`,
    );
  }

  return null;
}

async function withMcpRuntimeGovernance<T>(
  ops: McpRuntimeGovernanceOps,
  operation: McpGovernanceOperation,
  run: () => Promise<T>,
): Promise<T | { success: false; error: string }> {
  const failure = await enforceMcpRuntimeGovernance(ops, operation);
  if (failure) {
    return failure;
  }
  return run();
}

export function registerMcpHandlers(ops: McpRuntimeGovernanceOps = defaultMcpRuntimeGovernanceOps): void {
  ipcMain.handle('mcp:connect', (_event, id: string, url: string) =>
    withMcpRuntimeGovernance(
      ops,
      { kind: 'mcp', label: 'Connect MCP server' },
      () => mcpClient.connect(id, url),
    ));

  ipcMain.handle('mcp:disconnect', (_event, id: string) =>
    mcpClient.disconnect(id));

  ipcMain.handle('mcp:listTools', (_event, id: string) =>
    mcpClient.listTools(id));

  ipcMain.handle('mcp:listResources', (_event, id: string) =>
    mcpClient.listResources(id));

  ipcMain.handle('mcp:listPrompts', (_event, id: string) =>
    mcpClient.listPrompts(id));

  ipcMain.handle('mcp:callTool', (_event, id: string, name: string, args: Record<string, unknown>) =>
    withMcpRuntimeGovernance(
      ops,
      { kind: 'mcp', label: 'Call MCP tool' },
      () => mcpClient.callTool(id, name, args),
    ));

  ipcMain.handle('mcp:readResource', (_event, id: string, uri: string) =>
    withMcpRuntimeGovernance(
      ops,
      { kind: 'mcp', label: 'Read MCP resource' },
      () => mcpClient.readResource(id, uri),
    ));

  ipcMain.handle('mcp:getPrompt', (_event, id: string, name: string, args: Record<string, string>) =>
    withMcpRuntimeGovernance(
      ops,
      { kind: 'mcp', label: 'Get MCP prompt' },
      () => mcpClient.getPrompt(id, name, args),
    ));
}
