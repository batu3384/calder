import fs from 'node:fs';
import path from 'node:path';

import type {
  ProjectContextSource,
  ProjectContextState,
} from '../../shared/types/project-context.js';
import type { ProviderId } from '../../shared/types/provider.js';

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function listMarkdownFiles(dirPath: string): string[] {
  try {
    return fs
      .readdirSync(dirPath)
      .filter((entry) => entry.endsWith('.md'))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function listFilesRecursive(dirPath: string, predicate: (entryName: string) => boolean): string[] {
  try {
    const entries = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    const results: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...listFilesRecursive(fullPath, predicate));
      } else if (entry.isFile() && predicate(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
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

function sourceBase(
  filePath: string,
  overrides: Pick<ProjectContextSource, 'provider' | 'scope' | 'kind'>,
): Omit<ProjectContextSource, 'id' | 'displayName' | 'summary' | 'lastUpdated'> & {
  displayName: string;
  summary: string;
  lastUpdated: string;
} {
  const stat = fs.statSync(filePath);
  return {
    ...overrides,
    path: filePath,
    displayName: path.basename(filePath),
    summary: readSummary(filePath),
    lastUpdated: new Date(stat.mtimeMs).toISOString(),
  };
}

function buildSource(
  filePath: string,
  overrides: Pick<ProjectContextSource, 'provider' | 'scope' | 'kind'>,
  extra: Partial<Pick<ProjectContextSource, 'priority'>> = {},
): ProjectContextSource {
  const base = sourceBase(filePath, overrides);
  return {
    id: `${base.provider}:${base.kind}:${base.path}`,
    ...base,
    ...extra,
  };
}

function inferRulePriority(filePath: string): 'hard' | 'soft' {
  return path.basename(filePath).includes('.hard.') ? 'hard' : 'soft';
}

const PROJECT_PROVIDER_CONTEXT_FILES: Array<{
  relativePath: string;
  provider: ProviderId;
  kind: 'memory' | 'instructions';
}> = [
  { relativePath: 'CLAUDE.md', provider: 'claude', kind: 'memory' },
  { relativePath: 'CLAUDE.local.md', provider: 'claude', kind: 'memory' },
  { relativePath: path.join('.claude', 'CLAUDE.md'), provider: 'claude', kind: 'memory' },
  { relativePath: 'AGENTS.md', provider: 'codex', kind: 'instructions' },
  { relativePath: 'GEMINI.md', provider: 'antigravity', kind: 'instructions' },
  { relativePath: 'QWEN.md', provider: 'qwen', kind: 'instructions' },
  {
    relativePath: path.join('.github', 'copilot-instructions.md'),
    provider: 'copilot',
    kind: 'instructions',
  },
];

export async function discoverProjectContext(projectPath: string): Promise<ProjectContextState> {
  const sources: ProjectContextSource[] = [];

  for (const descriptor of PROJECT_PROVIDER_CONTEXT_FILES) {
    const filePath = path.join(projectPath, descriptor.relativePath);
    try {
      if (!isFile(filePath)) continue;
    } catch (err) {
      console.warn(`[discovery] isFile(${filePath}) failed:`, err);
      continue;
    }
    try {
      sources.push(
        buildSource(filePath, {
          provider: descriptor.provider,
          scope: 'project',
          kind: descriptor.kind,
        }),
      );
    } catch (err) {
      console.warn(`[discovery] buildSource(${filePath}) failed:`, err);
    }
  }

  try {
    const copilotInstructionDir = path.join(projectPath, '.github', 'instructions');
    for (const filePath of listFilesRecursive(copilotInstructionDir, (entryName) =>
      entryName.endsWith('.instructions.md'),
    )) {
      try {
        sources.push(
          buildSource(filePath, {
            provider: 'copilot',
            scope: 'project',
            kind: 'instructions',
          }),
        );
      } catch (err) {
        console.warn(`[discovery] buildSource(${filePath}) failed:`, err);
      }
    }
  } catch (err) {
    console.warn(`[discovery] listFilesRecursive(.github/instructions) failed:`, err);
  }

  const sharedPath = path.join(projectPath, 'CALDER.shared.md');
  try {
    if (isFile(sharedPath)) {
      sources.push(
        buildSource(
          sharedPath,
          { provider: 'shared', scope: 'project', kind: 'rules' },
          { priority: 'soft' },
        ),
      );
    }
  } catch (err) {
    console.warn(`[discovery] sharedPath check/buildSource failed:`, err);
  }

  const rulesDir = path.join(projectPath, '.calder', 'rules');
  try {
    for (const ruleFile of listMarkdownFiles(rulesDir)) {
      const fullPath = path.join(rulesDir, ruleFile);
      try {
        sources.push(
          buildSource(
            fullPath,
            { provider: 'shared', scope: 'project', kind: 'rules' },
            { priority: inferRulePriority(fullPath) },
          ),
        );
      } catch (err) {
        console.warn(`[discovery] buildSource(${fullPath}) failed:`, err);
      }
    }
  } catch (err) {
    console.warn(`[discovery] listMarkdownFiles(${rulesDir}) failed:`, err);
  }

  const mcpPath = path.join(projectPath, '.mcp.json');
  try {
    if (isFile(mcpPath)) {
      sources.push(buildSource(mcpPath, { provider: 'shared', scope: 'project', kind: 'mcp' }));
    }
  } catch (err) {
    console.warn(`[discovery] mcpPath check/buildSource failed:`, err);
  }

  const lastUpdated = sources
    .map((source) => source.lastUpdated)
    .sort()
    .at(-1);

  return {
    sources,
    sharedRuleCount: sources.filter(
      (source) => source.provider === 'shared' && source.kind === 'rules',
    ).length,
    providerSourceCount: sources.filter((source) => source.provider !== 'shared').length,
    lastUpdated,
  };
}
