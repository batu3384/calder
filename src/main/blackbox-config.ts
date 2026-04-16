import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { fileExists, readDirSafe, readFileSafe, readJsonSafe } from './fs-utils';
import type { McpServer, ProviderConfig, Skill } from '../shared/types';

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

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export async function getBlackboxConfig(projectPath: string): Promise<ProviderConfig> {
  const blackboxDir = path.join(homedir(), '.blackboxcli');
  const projectBlackboxDir = path.join(projectPath, '.blackboxcli');

  const userMcp = readMcpServersFromJson(path.join(blackboxDir, 'settings.json'), 'user');
  const projectMcp = readMcpServersFromJson(path.join(projectBlackboxDir, 'settings.json'), 'project');

  const serverMap = new Map<string, McpServer>();
  for (const server of userMcp) serverMap.set(server.name, server);
  for (const server of projectMcp) serverMap.set(server.name, server);

  const skills: Skill[] = [];
  const skillNames = new Set<string>();
  for (const group of [
    readSkillsFromDir(path.join(blackboxDir, 'skills'), 'user'),
    readSkillsFromDir(path.join(projectBlackboxDir, 'skills'), 'project'),
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

export function findBlackboxTranscriptPath(cliSessionId: string, _projectPath: string): string | null {
  try {
    const root = path.join(homedir(), '.blackboxcli');
    const candidates: Array<{ filePath: string; mtimeMs: number }> = [];

    const tmpRoot = path.join(root, 'tmp');
    for (const projectDirName of descSortedReaddir(tmpRoot)) {
      const projectDir = path.join(tmpRoot, projectDirName);
      if (!isDirectory(projectDir)) continue;
      const checkpointPath = path.join(projectDir, `checkpoint-session-${cliSessionId}.json`);
      if (!isFile(checkpointPath)) continue;
      let mtimeMs = 0;
      try { mtimeMs = fs.statSync(checkpointPath).mtimeMs; } catch {}
      candidates.push({ filePath: checkpointPath, mtimeMs });
    }

    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (candidates[0]) return candidates[0].filePath;

    const secureSessionPath = path.join(root, 'sessions', `blackbox_secure_session_${cliSessionId}.json`);
    return isFile(secureSessionPath) ? secureSessionPath : null;
  } catch {
    return null;
  }
}
