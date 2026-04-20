import { ipcMain } from 'electron';
import { addMcpServer, removeMcpServer } from './claude-cli';
import type { McpServerConfig } from './claude-cli';

interface McpGovernanceOps {
  requireKnownProjectPath: (projectPath: string, contextLabel: string) => string;
  assertProjectGovernanceAllows: (
    projectPath: string,
    operation: { kind: 'mcp'; label: string; target: string },
  ) => Promise<void>;
}

export function registerMcpGovernanceIpcHandlers(ops: McpGovernanceOps): void {
  ipcMain.handle('mcp:addServer', async (_event, name: string, config: McpServerConfig, scope: 'user' | 'project', projectPath?: string) => {
    try {
      let validatedProjectPath: string | undefined;
      if (scope === 'project') {
        if (!projectPath) {
          throw new Error('projectPath is required for project MCP scope');
        }
        validatedProjectPath = ops.requireKnownProjectPath(projectPath, 'Add project MCP server');
        await ops.assertProjectGovernanceAllows(validatedProjectPath, { kind: 'mcp', label: 'Add project MCP server', target: name });
      }
      addMcpServer(name, config, scope, validatedProjectPath);
      return { success: true };
    } catch (error) {
      console.error('mcp:addServer failed:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('mcp:removeServer', async (_event, name: string, filePath: string, scope: 'user' | 'project', projectPath?: string) => {
    try {
      let validatedProjectPath: string | undefined;
      if (scope === 'project') {
        if (!projectPath) {
          throw new Error('projectPath is required for project MCP scope');
        }
        validatedProjectPath = ops.requireKnownProjectPath(projectPath, 'Remove project MCP server');
        await ops.assertProjectGovernanceAllows(validatedProjectPath, { kind: 'mcp', label: 'Remove project MCP server', target: name });
      }
      removeMcpServer(name, filePath, scope, validatedProjectPath);
      return { success: true };
    } catch (error) {
      console.error('mcp:removeServer failed:', error);
      return { success: false, error: String(error) };
    }
  });
}
