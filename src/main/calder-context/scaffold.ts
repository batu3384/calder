import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ProjectContextCreateRuleResult,
  ProjectContextDeleteRuleResult,
  ProjectContextRenameRuleResult,
  ProjectContextStarterFilesResult,
} from '../../shared/types.js';
import { discoverProjectContext } from './discovery.js';

const STARTER_FILES: Array<{ relativePath: string; contents: string }> = [
  {
    relativePath: 'CALDER.shared.md',
    contents: `# Calder shared rules

- Keep session work grounded in the current repository state.
- Prefer small, reviewable changes with explicit verification.
- Surface tradeoffs before risky edits or destructive commands.
`,
  },
  {
    relativePath: '.calder/rules/testing.hard.md',
    contents: `# Testing expectations

- Run the smallest relevant verification before claiming success.
- When tests fail, explain the failure honestly before patching around it.
- Do not remove tests to make a change pass.
`,
  },
  {
    relativePath: '.calder/rules/boundaries.soft.md',
    contents: `# Repo boundaries

- Preserve established architecture and naming unless the task requires change.
- Avoid touching unrelated files while implementing a focused fix.
- Call out follow-up cleanup separately instead of hiding it in the same patch.
`,
  },
  {
    relativePath: '.calder/rules/handoff.soft.md',
    contents: `# Handoff notes

- Leave short summaries of what changed and how it was verified.
- Mention open risks or follow-up ideas without overstating certainty.
- Keep explanations concise so the next session can resume quickly.
`,
  },
];
const RULES_DIR_PREFIX = '.calder/rules/';

async function writeStarterFile(rootPath: string, relativePath: string, contents: string): Promise<'created' | 'skipped'> {
  const fullPath = path.join(rootPath, relativePath);

  try {
    await readFile(fullPath, 'utf8');
    return 'skipped';
  } catch {
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, contents, 'utf8');
    return 'created';
  }
}

function slugifyRuleTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'shared-rule';
}

function buildSharedRuleContents(title: string, priority: 'hard' | 'soft'): string {
  const heading = title.trim();
  const toneLine = priority === 'hard'
    ? '- Treat this as a non-negotiable project rule.'
    : '- Treat this as a preferred project guideline unless the task requires otherwise.';
  return `# ${heading}

${toneLine}
- Add the concrete rule details here.
- Keep the guidance short enough to fit naturally into routed prompts.
`;
}

function normalizeRuleRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized.startsWith(RULES_DIR_PREFIX) || !normalized.endsWith('.md') || normalized.includes('..')) {
    throw new Error('Only shared rule files inside .calder/rules are supported');
  }
  return normalized;
}

function buildRuleRelativePath(title: string, priority: 'hard' | 'soft'): string {
  const fileName = `${slugifyRuleTitle(title)}.${priority}.md`;
  return path.posix.join('.calder', 'rules', fileName);
}

function replaceRuleHeading(contents: string, title: string): string {
  const heading = `# ${title.trim()}`;
  const lines = contents.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex >= 0 && lines[firstContentIndex]!.trim().startsWith('#')) {
    lines[firstContentIndex] = heading;
    return `${lines.join('\n')}${contents.endsWith('\n') ? '' : '\n'}`;
  }
  return `${heading}\n\n${contents.trim()}\n`;
}

export async function createProjectContextStarterFiles(projectPath: string): Promise<ProjectContextStarterFilesResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const starter of STARTER_FILES) {
    const outcome = await writeStarterFile(projectPath, starter.relativePath, starter.contents);
    if (outcome === 'created') {
      created.push(starter.relativePath);
    } else {
      skipped.push(starter.relativePath);
    }
  }

  const state = await discoverProjectContext(projectPath);
  return { created, skipped, state };
}

export async function createProjectContextRuleFile(
  projectPath: string,
  title: string,
  priority: 'hard' | 'soft',
): Promise<ProjectContextCreateRuleResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Rule title is required');
  }

  const relativePath = buildRuleRelativePath(trimmedTitle, priority);
  const fullPath = path.join(projectPath, relativePath);

  let created = false;
  try {
    await readFile(fullPath, 'utf8');
  } catch {
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buildSharedRuleContents(trimmedTitle, priority), 'utf8');
    created = true;
  }

  const state = await discoverProjectContext(projectPath);
  return {
    created,
    relativePath,
    state,
  };
}

export async function renameProjectContextRuleFile(
  projectPath: string,
  relativePath: string,
  title: string,
  priority: 'hard' | 'soft',
): Promise<ProjectContextRenameRuleResult> {
  const normalizedCurrent = normalizeRuleRelativePath(relativePath);
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Rule title is required');
  }

  const nextRelativePath = buildRuleRelativePath(trimmedTitle, priority);
  const currentFullPath = path.join(projectPath, normalizedCurrent);
  const nextFullPath = path.join(projectPath, nextRelativePath);
  const currentContents = await readFile(currentFullPath, 'utf8');
  const nextContents = replaceRuleHeading(currentContents, trimmedTitle);

  let renamedRule = true;
  if (normalizedCurrent === nextRelativePath) {
    await writeFile(currentFullPath, nextContents, 'utf8');
  } else {
    try {
      await readFile(nextFullPath, 'utf8');
      renamedRule = false;
    } catch {
      await mkdir(path.dirname(nextFullPath), { recursive: true });
      await writeFile(nextFullPath, nextContents, 'utf8');
      await unlink(currentFullPath);
    }
  }

  const state = await discoverProjectContext(projectPath);
  return {
    renamed: renamedRule,
    relativePath: nextRelativePath,
    state,
  };
}

export async function deleteProjectContextRuleFile(
  projectPath: string,
  relativePath: string,
): Promise<ProjectContextDeleteRuleResult> {
  const normalizedRelativePath = normalizeRuleRelativePath(relativePath);
  const fullPath = path.join(projectPath, normalizedRelativePath);

  let deleted = true;
  try {
    await unlink(fullPath);
  } catch {
    deleted = false;
  }

  const state = await discoverProjectContext(projectPath);
  return {
    deleted,
    state,
  };
}
