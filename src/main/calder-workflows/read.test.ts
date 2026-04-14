import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readProjectWorkflowFile } from './read.js';

const tempRoots: string[] = [];

function makeProject(name: string): string {
  const root = mkdtempSync(path.join(tmpdir(), `${name}-`));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('project workflow read', () => {
  it('reads a workflow file from .calder/workflows and returns title plus contents', async () => {
    const root = makeProject('workflow-read');
    const workflowDir = path.join(root, '.calder', 'workflows');
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(
      path.join(workflowDir, 'review-pr.md'),
      '# Review PR\n\nRead the current diff first.\n',
      'utf8',
    );

    const result = await readProjectWorkflowFile(root, '.calder/workflows/review-pr.md');

    expect(result).toMatchObject({
      relativePath: '.calder/workflows/review-pr.md',
      title: 'Review PR',
    });
    expect(result.contents).toContain('Read the current diff first.');
  });

  it('rejects workflow reads outside .calder/workflows', async () => {
    const root = makeProject('workflow-read-unsafe');
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, 'README.md'), '# nope\n', 'utf8');

    await expect(readProjectWorkflowFile(root, 'README.md')).rejects.toThrow(
      'Only workflow files inside .calder/workflows are supported',
    );
  });
});
