import { homedir } from 'os';
import * as path from 'path';

import type { McpServer, ProviderConfig, Skill } from '../shared/types/provider';
import { fileExists, readDirSafe, readFileSafe, readJsonSafe } from './fs-utils';

function readMcpServersFromJson(filePath: string, scope: 'user' | 'project'): McpServer[] {
  const json = readJsonSafe(filePath);
  if (!json?.mcpServers || typeof json.mcpServers !== 'object') return [];

  const servers: McpServer[] = [];
  for (const [name, config] of Object.entries(json.mcpServers as Record<string, Record<string, unknown>>)) {
    const url = (config?.url as string) || (config?.command as string) || '';
    if (url) {
      servers.push({ name, url, status: 'configured', scope, filePath });
    }
  }
  return servers;
}

function readMcpServersFromConfigFile(filePath: string, scope: 'user' | 'project'): McpServer[] {
  const json = readJsonSafe(filePath);
  if (!json || typeof json !== 'object') return [];
  const mcpServers = (json as Record<string, unknown>).mcpServers;
  if (!mcpServers || typeof mcpServers !== 'object') return [];

  const servers: McpServer[] = [];
  for (const [name, config] of Object.entries(mcpServers as Record<string, Record<string, unknown>>)) {
    const args = Array.isArray(config?.args) ? config.args.join(' ') : '';
    const url = (config?.url as string) || (config?.command as string) || args;
    if (!url) continue;
    servers.push({ name, url, status: 'configured', scope, filePath });
  }
  return servers;
}

function parseFrontmatter(filePath: string): Record<string, string> {
  const content = readFileSafe(filePath);
  if (!content) return {};
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
}

function readSkillsFromDir(dirPath: string, scope: 'user' | 'project'): Skill[] {
  const skills: Skill[] = [];
  for (const skillName of readDirSafe(dirPath)) {
    if (skillName.startsWith('.')) continue;
    const filePath = path.join(dirPath, skillName, 'SKILL.md');
    if (!fileExists(filePath)) continue;
    const fm = parseFrontmatter(filePath);
    skills.push({
      name: fm.name || skillName,
      description: fm.description || '',
      scope,
      filePath,
    });
  }
  return skills;
}

export async function getAntigravityConfig(projectPath: string): Promise<ProviderConfig> {
  const providerCompatDir = path.join(homedir(), '.gemini');
  const providerCliDir = path.join(providerCompatDir, 'antigravity-cli');
  const projectCompatDir = path.join(projectPath, '.gemini');
  const projectAgentsDir = path.join(projectPath, '.agents');

  const userMcp = [
    ...readMcpServersFromJson(path.join(providerCompatDir, 'settings.json'), 'user'),
    ...readMcpServersFromJson(path.join(providerCliDir, 'settings.json'), 'user'),
    ...readMcpServersFromConfigFile(path.join(providerCliDir, 'mcp_config.json'), 'user'),
  ];
  const projectMcp = [
    ...readMcpServersFromJson(path.join(projectCompatDir, 'settings.json'), 'project'),
    ...readMcpServersFromJson(path.join(projectAgentsDir, 'settings.json'), 'project'),
    ...readMcpServersFromConfigFile(path.join(projectAgentsDir, 'mcp_config.json'), 'project'),
  ];

  const serverMap = new Map<string, McpServer>();
  for (const server of userMcp) serverMap.set(server.name, server);
  for (const server of projectMcp) serverMap.set(server.name, server);

  const skills: Skill[] = [];
  const skillNames = new Set<string>();
  for (const group of [
    readSkillsFromDir(path.join(providerCompatDir, 'skills'), 'user'),
    readSkillsFromDir(path.join(providerCliDir, 'skills'), 'user'),
    readSkillsFromDir(path.join(projectCompatDir, 'skills'), 'project'),
    readSkillsFromDir(path.join(projectAgentsDir, 'skills'), 'project'),
  ]) {
    for (const skill of group) {
      if (skillNames.has(skill.name)) continue;
      skillNames.add(skill.name);
      skills.push(skill);
    }
  }

  return {
    mcpServers: Array.from(serverMap.values()),
    agents: [],
    skills,
    commands: [],
  };
}
