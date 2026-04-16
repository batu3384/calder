import * as path from 'path';
import { homedir } from 'os';
import { fileExists, readDirSafe, readFileSafe, readJsonSafe } from './fs-utils';
import type { ProviderConfig, Skill } from '../shared/types';

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

export async function getMiniMaxConfig(projectPath: string): Promise<ProviderConfig> {
  const mmxDir = path.join(homedir(), '.mmx');
  const projectMmxDir = path.join(projectPath, '.mmx');

  // Keep reading known runtime files so we stay in sync when users re-authenticate
  // or switch regions/models via mmx config.
  readJsonSafe(path.join(mmxDir, 'config.json'));
  readJsonSafe(path.join(mmxDir, 'credentials.json'));

  // MiniMax does not currently expose a formal plugin/agent manifest like Claude.
  // We surface markdown skills from the conventional ~/.mmx/skills and project
  // .mmx/skills directories so users can keep one UX skill set visible in Calder.
  const skills: Skill[] = [];
  const skillNames = new Set<string>();
  for (const group of [
    readSkillsFromDir(path.join(mmxDir, 'skills'), 'user'),
    readSkillsFromDir(path.join(projectMmxDir, 'skills'), 'project'),
  ]) {
    for (const skill of group) {
      if (skillNames.has(skill.name)) continue;
      skillNames.add(skill.name);
      skills.push(skill);
    }
  }

  return {
    mcpServers: [],
    agents: [],
    skills,
    commands: [],
  };
}
