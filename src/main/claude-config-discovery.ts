import * as fs from 'fs';
import { homedir } from 'os';
import * as path from 'path';

import type { Agent, ClaudeConfig, Command, McpServer, Skill } from '../shared/types/provider';
import { readDirSafe, readJsonSafe } from './fs-utils';

/** Parse YAML-ish frontmatter from an .md file (between --- delimiters) */
function parseFrontmatter(filePath: string): Record<string, string> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return {};
    const result: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/** Read MCP servers from settings.json mcpServers key and .mcp.json files */
function readMcpServers(
  settingsPath: string,
  mcpJsonPath: string,
  scope: 'user' | 'project',
): McpServer[] {
  const servers: McpServer[] = [];

  // Read from settings.json mcpServers
  const settings = readJsonSafe(settingsPath);
  if (settings && typeof settings.mcpServers === 'object' && settings.mcpServers !== null) {
    const mcpServers = settings.mcpServers as Record<string, unknown>;
    for (const [name, config] of Object.entries(mcpServers)) {
      const cfg = config as Record<string, unknown>;
      const url = (cfg.url as string) || (cfg.command as string) || '';
      servers.push({ name, url, status: 'configured', scope, filePath: settingsPath });
    }
  }

  // Read from .mcp.json
  const mcpJson = readJsonSafe(mcpJsonPath);
  if (mcpJson && typeof mcpJson.mcpServers === 'object' && mcpJson.mcpServers !== null) {
    const mcpServers = mcpJson.mcpServers as Record<string, unknown>;
    const existingNames = new Set(servers.map((server) => server.name));
    for (const [name, config] of Object.entries(mcpServers)) {
      if (existingNames.has(name)) continue;
      const cfg = config as Record<string, unknown>;
      const url = (cfg.url as string) || (cfg.command as string) || '';
      servers.push({ name, url, status: 'configured', scope, filePath: mcpJsonPath });
    }
  }

  return servers;
}

/** Read agents from .md files in an agents directory */
function readAgentsFromDir(
  dirPath: string,
  scope: 'user' | 'project',
  category: 'plugin' | 'built-in',
): Agent[] {
  const agents: Agent[] = [];
  for (const file of readDirSafe(dirPath)) {
    if (!file.endsWith('.md')) continue;
    const fm = parseFrontmatter(path.join(dirPath, file));
    if (fm.name) {
      agents.push({
        name: fm.name,
        model: fm.model || '',
        category,
        scope,
        filePath: path.join(dirPath, file),
      });
    }
  }
  return agents;
}

/** Get set of enabled plugin IDs from user settings */
function getEnabledPlugins(): Set<string> {
  const settings = readJsonSafe(path.join(homedir(), '.claude', 'settings.json'));
  if (
    !settings ||
    typeof settings.enabledPlugins !== 'object' ||
    settings.enabledPlugins === null
  ) {
    return new Set();
  }
  const enabled = settings.enabledPlugins as Record<string, boolean>;
  return new Set(
    Object.entries(enabled)
      .filter(([, isEnabled]) => isEnabled)
      .map(([pluginId]) => pluginId),
  );
}

/** Read agents from installed plugins */
function readPluginAgents(): Agent[] {
  const installedPath = path.join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
  const installed = readJsonSafe(installedPath);
  if (!installed || typeof installed.plugins !== 'object' || installed.plugins === null) return [];

  const agents: Agent[] = [];
  const plugins = installed.plugins as Record<
    string,
    Array<{ installPath: string; scope?: string }>
  >;
  const enabledPlugins = getEnabledPlugins();

  for (const [pluginId, versions] of Object.entries(plugins)) {
    if (!enabledPlugins.has(pluginId)) continue;
    for (const version of versions) {
      const agentsDir = path.join(version.installPath, 'agents');
      const scope = (version.scope as 'user' | 'project') || 'user';
      agents.push(...readAgentsFromDir(agentsDir, scope, 'plugin'));
    }
  }
  return agents;
}

/** Read skills from installed plugins */
function readPluginSkills(): Skill[] {
  const installedPath = path.join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
  const installed = readJsonSafe(installedPath);
  if (!installed || typeof installed.plugins !== 'object' || installed.plugins === null) return [];

  const skills: Skill[] = [];
  const plugins = installed.plugins as Record<
    string,
    Array<{ installPath: string; scope?: string }>
  >;
  const enabledPlugins = getEnabledPlugins();

  for (const [pluginId, versions] of Object.entries(plugins)) {
    if (!enabledPlugins.has(pluginId)) continue;
    for (const version of versions) {
      const skillsDir = path.join(version.installPath, 'skills');
      const scope = (version.scope as 'user' | 'project') || 'user';
      for (const skillName of readDirSafe(skillsDir)) {
        const skillMd = path.join(skillsDir, skillName, 'SKILL.md');
        const fm = parseFrontmatter(skillMd);
        if (fm.name || skillName) {
          skills.push({
            name: fm.name || skillName,
            description: fm.description || '',
            scope,
            filePath: skillMd,
          });
        }
      }
    }
  }
  return skills;
}

/** Read commands from .md files in a commands directory */
function readCommandsFromDir(dirPath: string, scope: 'user' | 'project'): Command[] {
  const commands: Command[] = [];
  for (const file of readDirSafe(dirPath)) {
    if (!file.endsWith('.md')) continue;
    const name = file.slice(0, -3);
    const fm = parseFrontmatter(path.join(dirPath, file));
    commands.push({
      name,
      description: fm.description || '',
      scope,
      filePath: path.join(dirPath, file),
    });
  }
  return commands;
}

/** Read skills from a directory (user or project scope) */
function readSkillsFromDir(dirPath: string, scope: 'user' | 'project'): Skill[] {
  const skills: Skill[] = [];
  for (const skillName of readDirSafe(dirPath)) {
    const skillMd = path.join(dirPath, skillName, 'SKILL.md');
    const fm = parseFrontmatter(skillMd);
    if (fm.name || skillName) {
      skills.push({
        name: fm.name || skillName,
        description: fm.description || '',
        scope,
        filePath: skillMd,
      });
    }
  }
  return skills;
}

/** Read MCP servers from ~/.claude.json (where `claude mcp add` stores them) */
function readMcpFromClaudeJson(filePath: string, projectPath?: string): McpServer[] {
  const json = readJsonSafe(filePath);
  if (!json) return [];
  const servers: McpServer[] = [];

  // Top-level mcpServers -> user scope
  if (typeof json.mcpServers === 'object' && json.mcpServers !== null) {
    for (const [name, config] of Object.entries(json.mcpServers as Record<string, unknown>)) {
      const cfg = config as Record<string, unknown>;
      const url = (cfg.url as string) || (cfg.command as string) || '';
      servers.push({ name, url, status: 'configured', scope: 'user', filePath });
    }
  }

  // Project-specific (local scope) servers stored under projects key
  if (projectPath && typeof json.projects === 'object' && json.projects !== null) {
    const projects = json.projects as Record<string, Record<string, unknown>>;
    const projectEntry = projects[projectPath];
    if (
      projectEntry &&
      typeof projectEntry.mcpServers === 'object' &&
      projectEntry.mcpServers !== null
    ) {
      for (const [name, config] of Object.entries(
        projectEntry.mcpServers as Record<string, unknown>,
      )) {
        const cfg = config as Record<string, unknown>;
        const url = (cfg.url as string) || (cfg.command as string) || '';
        servers.push({ name, url, status: 'configured', scope: 'project', filePath });
      }
    }
  }

  return servers;
}

/** Read managed MCP servers from system-level config */
function readManagedMcpServers(): McpServer[] {
  const managedPath =
    process.platform === 'darwin'
      ? '/Library/Application Support/ClaudeCode/managed-mcp.json'
      : process.platform === 'win32'
        ? 'C:\\Program Files\\ClaudeCode\\managed-mcp.json'
        : '/etc/claude-code/managed-mcp.json';

  const json = readJsonSafe(managedPath);
  if (!json || typeof json.mcpServers !== 'object' || json.mcpServers === null) return [];

  const servers: McpServer[] = [];
  for (const [name, config] of Object.entries(json.mcpServers as Record<string, unknown>)) {
    const cfg = config as Record<string, unknown>;
    const url = (cfg.url as string) || (cfg.command as string) || '';
    servers.push({ name, url, status: 'configured', scope: 'user', filePath: managedPath });
  }
  return servers;
}

export async function getClaudeConfig(projectPath: string): Promise<ClaudeConfig> {
  const home = homedir();
  const claudeDir = path.join(home, '.claude');

  // MCP Servers from multiple sources (matching Claude CLI resolution order)
  // 1. ~/.claude.json (user + local scope — primary location for `claude mcp add`)
  const claudeJsonServers = readMcpFromClaudeJson(path.join(home, '.claude.json'), projectPath);
  // 2. ~/.claude/settings.json and ~/.mcp.json (legacy/additional user scope)
  const userServers = readMcpServers(
    path.join(claudeDir, 'settings.json'),
    path.join(home, '.mcp.json'),
    'user',
  );
  // 3. Project-level: .claude/settings.json and .mcp.json
  const projectServers = readMcpServers(
    path.join(projectPath, '.claude', 'settings.json'),
    path.join(projectPath, '.mcp.json'),
    'project',
  );
  // 4. System-managed servers
  const managedServers = readManagedMcpServers();

  // Deduplicate: local/project servers override user servers by name
  const serverMap = new Map<string, McpServer>();
  for (const server of managedServers) serverMap.set(server.name, server);
  for (const server of userServers) serverMap.set(server.name, server);
  for (const server of claudeJsonServers) serverMap.set(server.name, server);
  for (const server of projectServers) serverMap.set(server.name, server);
  const mcpServers = Array.from(serverMap.values());

  // Agents
  const pluginAgents = readPluginAgents();
  const userAgents = readAgentsFromDir(path.join(claudeDir, 'agents'), 'user', 'plugin');
  const projectAgents = readAgentsFromDir(
    path.join(projectPath, '.claude', 'agents'),
    'project',
    'plugin',
  );

  const agentNames = new Set<string>();
  const agents: Agent[] = [];
  for (const list of [pluginAgents, userAgents, projectAgents]) {
    for (const agent of list) {
      if (!agentNames.has(agent.name)) {
        agentNames.add(agent.name);
        agents.push(agent);
      }
    }
  }

  // Skills
  const pluginSkills = readPluginSkills();
  const userSkills = readSkillsFromDir(path.join(claudeDir, 'skills'), 'user');
  const projectSkills = readSkillsFromDir(path.join(projectPath, '.claude', 'skills'), 'project');

  const skillNames = new Set<string>();
  const skills: Skill[] = [];
  for (const list of [pluginSkills, userSkills, projectSkills]) {
    for (const skill of list) {
      if (!skillNames.has(skill.name)) {
        skillNames.add(skill.name);
        skills.push(skill);
      }
    }
  }

  // Commands
  const userCommands = readCommandsFromDir(path.join(claudeDir, 'commands'), 'user');
  const projectCommands = readCommandsFromDir(
    path.join(projectPath, '.claude', 'commands'),
    'project',
  );

  const commandNames = new Set<string>();
  const commands: Command[] = [];
  // Project commands override user commands
  for (const list of [projectCommands, userCommands]) {
    for (const command of list) {
      if (!commandNames.has(command.name)) {
        commandNames.add(command.name);
        commands.push(command);
      }
    }
  }

  return { mcpServers, agents, skills, commands };
}
