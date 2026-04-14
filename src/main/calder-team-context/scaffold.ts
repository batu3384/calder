import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ProjectTeamContextCreateSpaceResult,
  ProjectTeamContextStarterFilesResult,
} from '../../shared/types.js';
import { discoverProjectTeamContext } from './discovery.js';

const STARTER_FILES: Array<{ relativePath: string; contents: string }> = [
  {
    relativePath: '.calder/team/spaces/team-charter.md',
    contents: `# Team charter

Purpose: capture the collaboration rules that should stay stable across every provider and session.

- Name the product and repo conventions clearly.
- Record ownership boundaries and review expectations.
- Keep this file short enough to stay useful in prompt context.
`,
  },
  {
    relativePath: '.calder/team/spaces/handoff-protocol.md',
    contents: `# Handoff protocol

Purpose: make agent-to-agent and human-to-agent handoffs predictable.

- Summarize current goal, changed files, tests run, and known risks.
- Link to relevant workflows and review findings when they exist.
- Say what the next session should do first.
`,
  },
  {
    relativePath: '.calder/team/spaces/release-standards.md',
    contents: `# Release standards

Purpose: keep release readiness checks shared by the whole team.

- List required build, lint, and test commands.
- Note deployment, rollback, and verification expectations.
- Track non-blocking follow-up policy separately from blockers.
`,
  },
];

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

function slugifySpaceTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'team-context';
}

function buildSpaceContents(title: string): string {
  return `# ${title.trim()}

Purpose: describe the shared team context this repo should keep visible across Calder sessions.

- What should every agent know before touching this area?
- Which rules or workflows does this space rely on?
- What should a handoff mention when this space is relevant?
`;
}

export async function createProjectTeamContextStarterFiles(projectPath: string): Promise<ProjectTeamContextStarterFilesResult> {
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

  const state = await discoverProjectTeamContext(projectPath);
  return { created, skipped, state };
}

export async function createProjectTeamContextSpaceFile(
  projectPath: string,
  title: string,
): Promise<ProjectTeamContextCreateSpaceResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Team context title is required');
  }

  const relativePath = path.posix.join('.calder', 'team', 'spaces', `${slugifySpaceTitle(trimmedTitle)}.md`);
  const fullPath = path.join(projectPath, relativePath);

  let created = false;
  try {
    await readFile(fullPath, 'utf8');
  } catch {
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buildSpaceContents(trimmedTitle), 'utf8');
    created = true;
  }

  const state = await discoverProjectTeamContext(projectPath);
  return {
    created,
    relativePath,
    state,
  };
}
