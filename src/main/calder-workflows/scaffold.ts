import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ProjectWorkflowCreateResult,
  ProjectWorkflowStarterFilesResult,
} from '../../shared/types.js';
import { discoverProjectWorkflows } from './discovery.js';

const STARTER_FILES: Array<{ relativePath: string; contents: string }> = [
  {
    relativePath: '.calder/workflows/review-pr.md',
    contents: `# Review PR

Goal: review the current diff and surface the highest-risk findings before proposing fixes.

- Read the current changes carefully.
- Prioritize bugs, regressions, and missing verification over style notes.
- End with a short risk summary and the smallest safe follow-up patch set.
`,
  },
  {
    relativePath: '.calder/workflows/fix-failing-tests.md',
    contents: `# Fix failing tests

Goal: restore the smallest failing test surface without masking the real issue.

- Reproduce the failing tests first.
- Explain the root cause briefly before patching.
- Prefer minimal fixes and rerun the targeted tests plus one broader safety check.
`,
  },
  {
    relativePath: '.calder/workflows/release-readiness.md',
    contents: `# Release readiness

Goal: verify the repo is ready to ship and call out any blocking risks clearly.

- Run the most relevant build and test commands.
- Summarize release blockers first, then non-blocking follow-ups.
- Keep the output concise and decision-oriented.
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

function slugifyWorkflowTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'workflow';
}

function buildWorkflowContents(title: string): string {
  return `# ${title.trim()}

Goal: describe the repeatable task outcome in one or two lines.

- Start by confirming the current repo state.
- Do the main workflow steps in a clear order.
- End with verification and any follow-up risks.
`;
}

export async function createProjectWorkflowStarterFiles(projectPath: string): Promise<ProjectWorkflowStarterFilesResult> {
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

  const state = await discoverProjectWorkflows(projectPath);
  return { created, skipped, state };
}

export async function createProjectWorkflowFile(
  projectPath: string,
  title: string,
): Promise<ProjectWorkflowCreateResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Workflow title is required');
  }

  const relativePath = path.posix.join('.calder', 'workflows', `${slugifyWorkflowTitle(trimmedTitle)}.md`);
  const fullPath = path.join(projectPath, relativePath);

  let created = false;
  try {
    await readFile(fullPath, 'utf8');
  } catch {
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buildWorkflowContents(trimmedTitle), 'utf8');
    created = true;
  }

  const state = await discoverProjectWorkflows(projectPath);
  return {
    created,
    relativePath,
    state,
  };
}
