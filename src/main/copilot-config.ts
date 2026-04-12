import * as path from 'path';
import { homedir } from 'os';
import { fileExists, readDirSafe, readFileSafe, readJsonSafe } from './fs-utils';
import type { McpServer, ProviderConfig, Skill } from '../shared/types';

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

function readMcpServersFromJson(filePath: string, scope: 'user' | 'project'): McpServer[] {
  const json = readJsonSafe(filePath);
  if (!json || typeof json !== 'object') return [];

  const rawServers = (
    ('mcpServers' in json && typeof json.mcpServers === 'object' && json.mcpServers)
    || ('servers' in json && typeof json.servers === 'object' && json.servers)
  ) as Record<string, Record<string, unknown>> | undefined;

  if (!rawServers) return [];

  const servers: McpServer[] = [];
  for (const [name, config] of Object.entries(rawServers)) {
    const url = (config?.url as string) || (config?.command as string) || '';
    if (!url) continue;
    servers.push({ name, url, status: 'configured', scope, filePath });
  }
  return servers;
}

function readSkillsFromRoot(dirPath: string, scope: 'user' | 'project'): Skill[] {
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

function readConfiguredSkillRoots(copilotDir: string): string[] {
  const config = readJsonSafe(path.join(copilotDir, 'config.json'));
  const configured = Array.isArray(config?.skillDirectories)
    ? config.skillDirectories.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  const envConfigured = (process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS || '')
    .split(path.delimiter)
    .map(value => value.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const roots: string[] = [];
  for (const candidate of [...configured, ...envConfigured]) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    roots.push(candidate);
  }
  return roots;
}

export async function getCopilotConfig(projectPath: string): Promise<ProviderConfig> {
  const copilotDir = path.join(homedir(), '.copilot');

  const userMcp = readMcpServersFromJson(path.join(copilotDir, 'mcp-config.json'), 'user');
  const projectMcp = readMcpServersFromJson(path.join(projectPath, '.mcp.json'), 'project');

  const serverMap = new Map<string, McpServer>();
  for (const server of userMcp) serverMap.set(server.name, server);
  for (const server of projectMcp) serverMap.set(server.name, server);

  const skills: Skill[] = [];
  const skillNames = new Set<string>();
  const skillGroups = [
    readSkillsFromRoot(path.join(copilotDir, 'skills'), 'user'),
    readSkillsFromRoot(path.join(projectPath, '.github', 'skills'), 'project'),
    ...readConfiguredSkillRoots(copilotDir).map(dirPath => readSkillsFromRoot(dirPath, 'user')),
  ];

  for (const group of skillGroups) {
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
