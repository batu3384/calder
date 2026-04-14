import fs from 'node:fs';
import path from 'node:path';
import type { ProjectTeamContextSpaceSource, ProjectTeamContextState } from '../../shared/types.js';

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function listMarkdownFiles(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath)
      .filter((entry) => entry.endsWith('.md'))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function readSummary(filePath: string): string {
  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    const lines = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const candidate = lines[0] ?? '';
    return candidate.startsWith('#') ? candidate.replace(/^#+\s*/, '').trim() : candidate;
  } catch {
    return '';
  }
}

function countMarkdownFiles(dirPath: string): number {
  return listMarkdownFiles(dirPath)
    .map((entry) => path.join(dirPath, entry))
    .filter(isFile)
    .length;
}

function buildSpace(filePath: string, linkedRuleCount: number, linkedWorkflowCount: number): ProjectTeamContextSpaceSource {
  const stat = fs.statSync(filePath);
  return {
    id: `team-context:${filePath}`,
    path: filePath,
    displayName: path.basename(filePath),
    summary: readSummary(filePath),
    lastUpdated: new Date(stat.mtimeMs).toISOString(),
    linkedRuleCount,
    linkedWorkflowCount,
  };
}

export async function discoverProjectTeamContext(projectPath: string): Promise<ProjectTeamContextState> {
  const spaceDir = path.join(projectPath, '.calder', 'team', 'spaces');
  const ruleDir = path.join(projectPath, '.calder', 'rules');
  const workflowDir = path.join(projectPath, '.calder', 'workflows');
  const sharedRuleCount = countMarkdownFiles(ruleDir);
  const workflowCount = countMarkdownFiles(workflowDir);

  const spaces = listMarkdownFiles(spaceDir)
    .map((entry) => path.join(spaceDir, entry))
    .filter(isFile)
    .map((filePath) => buildSpace(filePath, sharedRuleCount, workflowCount));

  const lastUpdated = spaces
    .map((space) => space.lastUpdated)
    .sort()
    .at(-1);

  return {
    spaces,
    sharedRuleCount,
    workflowCount,
    lastUpdated,
  };
}
