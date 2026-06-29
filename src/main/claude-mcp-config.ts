import * as fs from 'fs';
import { homedir } from 'os';
import * as path from 'path';

import { readJsonSafe } from './fs-utils';

export type McpServerConfig =
  | { command: string; args?: string[]; env?: Record<string, string> }
  | { url: string };

function getWritableMcpConfigPaths(projectPath?: string): Set<string> {
  const home = homedir();
  const allowed = [
    path.join(home, '.claude.json'),
    path.join(home, '.claude', 'settings.json'),
    path.join(home, '.mcp.json'),
  ];

  if (projectPath) {
    const resolvedProjectPath = path.resolve(projectPath);
    allowed.push(
      path.join(resolvedProjectPath, '.claude', 'settings.json'),
      path.join(resolvedProjectPath, '.mcp.json'),
    );
  }

  return new Set(allowed.map((candidate) => path.resolve(candidate)));
}

function assertWritableMcpConfigPath(filePath: string, projectPath?: string): string {
  const resolved = path.resolve(filePath);
  const writablePaths = getWritableMcpConfigPaths(projectPath);
  if (!writablePaths.has(resolved)) {
    throw new Error(`Refusing to modify MCP config outside known locations: ${filePath}`);
  }

  try {
    if (fs.lstatSync(resolved).isSymbolicLink()) {
      throw new Error(`Refusing to modify symlinked MCP config: ${filePath}`);
    }
  } catch (err) {
    const errno = err as NodeJS.ErrnoException;
    if (errno.code !== 'ENOENT') {
      throw err;
    }
  }

  return resolved;
}

/**
 * Add an MCP server to ~/.claude.json at user or project scope.
 */
export function addMcpServer(
  name: string,
  config: McpServerConfig,
  scope: 'user' | 'project',
  projectPath?: string,
): void {
  const filePath = path.join(homedir(), '.claude.json');
  const json = readJsonSafe(filePath) ?? {};

  if (scope === 'project' && projectPath) {
    const projects = (json.projects ?? {}) as Record<string, Record<string, unknown>>;
    const entry = projects[projectPath] ?? {};
    const servers = (entry.mcpServers ?? {}) as Record<string, unknown>;
    servers[name] = config;
    entry.mcpServers = servers;
    projects[projectPath] = entry;
    json.projects = projects;
  } else {
    const servers = (json.mcpServers ?? {}) as Record<string, unknown>;
    servers[name] = config;
    json.mcpServers = servers;
  }

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
}

/**
 * Remove an MCP server from a config file at the given scope.
 * filePath is the config file where the server was found (e.g. ~/.claude.json, ~/.mcp.json).
 */
export function removeMcpServer(
  name: string,
  filePath: string,
  scope: 'user' | 'project',
  projectPath?: string,
): void {
  const safeFilePath = assertWritableMcpConfigPath(filePath, projectPath);
  const json = readJsonSafe(safeFilePath);
  if (!json) return;

  const homeClaudeJsonPath = path.resolve(path.join(homedir(), '.claude.json'));
  const isHomeClaudeJson = safeFilePath === homeClaudeJsonPath;

  if (scope === 'project' && projectPath) {
    if (isHomeClaudeJson) {
      const projects = json.projects as Record<string, Record<string, unknown>> | undefined;
      const entry = projects?.[projectPath];
      if (entry && typeof entry.mcpServers === 'object' && entry.mcpServers !== null) {
        const servers = entry.mcpServers as Record<string, unknown>;
        delete servers[name];
      }
    } else if (typeof json.mcpServers === 'object' && json.mcpServers !== null) {
      const servers = json.mcpServers as Record<string, unknown>;
      delete servers[name];
    }
  } else {
    if (typeof json.mcpServers === 'object' && json.mcpServers !== null) {
      const servers = json.mcpServers as Record<string, unknown>;
      delete servers[name];
    }
  }

  fs.writeFileSync(safeFilePath, JSON.stringify(json, null, 2) + '\n');
}
