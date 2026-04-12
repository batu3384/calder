import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { fileExists, readDirSafe, readFileSafe, readJsonSafe } from './fs-utils';
import type { Agent, Command, McpServer, ProviderConfig, Skill } from '../shared/types';

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

function readAgentsFromDir(dirPath: string, scope: 'user' | 'project'): Agent[] {
  const agents: Agent[] = [];
  for (const file of readDirSafe(dirPath)) {
    if (!file.endsWith('.md')) continue;
    const filePath = path.join(dirPath, file);
    const fm = parseFrontmatter(filePath);
    if (!fm.name) continue;
    agents.push({
      name: fm.name,
      model: fm.model || '',
      category: 'plugin',
      scope,
      filePath,
    });
  }
  return agents;
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

function readCommandsFromDir(dirPath: string, scope: 'user' | 'project'): Command[] {
  const commands: Command[] = [];
  for (const file of readDirSafe(dirPath)) {
    if (!file.endsWith('.md')) continue;
    const filePath = path.join(dirPath, file);
    const fm = parseFrontmatter(filePath);
    commands.push({
      name: file.slice(0, -3),
      description: fm.description || '',
      scope,
      filePath,
    });
  }
  return commands;
}

function readRuntimeBaseDir(projectPath: string): string {
  const envDir = process.env.QWEN_RUNTIME_DIR?.trim();
  if (envDir) return envDir;

  const userSettings = readJsonSafe(path.join(homedir(), '.qwen', 'settings.json'));
  const projectSettings = readJsonSafe(path.join(projectPath, '.qwen', 'settings.json'));
  const projectRuntime = projectSettings?.advanced && typeof projectSettings.advanced === 'object'
    ? (projectSettings.advanced as Record<string, unknown>).runtimeOutputDir
    : undefined;
  if (typeof projectRuntime === 'string' && projectRuntime.trim()) return projectRuntime;
  const userRuntime = userSettings?.advanced && typeof userSettings.advanced === 'object'
    ? (userSettings.advanced as Record<string, unknown>).runtimeOutputDir
    : undefined;
  if (typeof userRuntime === 'string' && userRuntime.trim()) return userRuntime;
  return path.join(homedir(), '.qwen');
}

function descSortedReaddir(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath).sort().reverse();
  } catch {
    return [];
  }
}

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function findTranscriptInProjects(projectsDir: string, cliSessionId: string): string | null {
  const candidates: Array<{ filePath: string; mtimeMs: number }> = [];

  for (const projectKey of descSortedReaddir(projectsDir)) {
    const projectDir = path.join(projectsDir, projectKey);
    if (!isDirectory(projectDir)) continue;
    const chatsDir = path.join(projectDir, 'chats');
    if (!isDirectory(chatsDir)) continue;
    const filePath = path.join(chatsDir, `${cliSessionId}.jsonl`);
    if (!fileExists(filePath)) continue;
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(filePath).mtimeMs;
    } catch {
      // Ignore unreadable candidate
    }
    candidates.push({ filePath, mtimeMs });
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.filePath ?? null;
}

export async function getQwenConfig(projectPath: string): Promise<ProviderConfig> {
  const qwenDir = path.join(homedir(), '.qwen');
  const projectQwenDir = path.join(projectPath, '.qwen');

  const userMcp = readMcpServersFromJson(path.join(qwenDir, 'settings.json'), 'user');
  const projectMcp = readMcpServersFromJson(path.join(projectQwenDir, 'settings.json'), 'project');

  const serverMap = new Map<string, McpServer>();
  for (const server of userMcp) serverMap.set(server.name, server);
  for (const server of projectMcp) serverMap.set(server.name, server);

  const agentNames = new Set<string>();
  const agents: Agent[] = [];
  for (const list of [
    readAgentsFromDir(path.join(qwenDir, 'agents'), 'user'),
    readAgentsFromDir(path.join(projectQwenDir, 'agents'), 'project'),
  ]) {
    for (const agent of list) {
      if (agentNames.has(agent.name)) continue;
      agentNames.add(agent.name);
      agents.push(agent);
    }
  }

  const skillNames = new Set<string>();
  const skills: Skill[] = [];
  for (const list of [
    readSkillsFromDir(path.join(qwenDir, 'skills'), 'user'),
    readSkillsFromDir(path.join(projectQwenDir, 'skills'), 'project'),
  ]) {
    for (const skill of list) {
      if (skillNames.has(skill.name)) continue;
      skillNames.add(skill.name);
      skills.push(skill);
    }
  }

  const commandNames = new Set<string>();
  const commands: Command[] = [];
  for (const list of [
    readCommandsFromDir(path.join(qwenDir, 'commands'), 'user'),
    readCommandsFromDir(path.join(projectQwenDir, 'commands'), 'project'),
  ]) {
    for (const command of list) {
      if (commandNames.has(command.name)) continue;
      commandNames.add(command.name);
      commands.push(command);
    }
  }

  return {
    mcpServers: Array.from(serverMap.values()),
    agents,
    skills,
    commands,
  };
}

export function findQwenTranscriptPath(cliSessionId: string, projectPath: string): string | null {
  try {
    const runtimeBaseDir = readRuntimeBaseDir(projectPath);
    return findTranscriptInProjects(path.join(runtimeBaseDir, 'projects'), cliSessionId);
  } catch {
    return null;
  }
}

