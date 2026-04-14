import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createProjectContextStarterFiles,
  createProjectContextRuleFile,
  deleteProjectContextRuleFile,
  renameProjectContextRuleFile,
} from './scaffold.js';

const roots: string[] = [];

function makeProject(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('createProjectContextStarterFiles', () => {
  it('creates shared starter files for a project and returns fresh discovery state', async () => {
    const root = makeProject('context-scaffold');

    const result = await createProjectContextStarterFiles(root);

    expect(result.created).toEqual([
      'CALDER.shared.md',
      '.calder/rules/testing.hard.md',
      '.calder/rules/boundaries.soft.md',
      '.calder/rules/handoff.soft.md',
    ]);
    expect(result.skipped).toEqual([]);
    expect(existsSync(join(root, 'CALDER.shared.md'))).toBe(true);
    expect(existsSync(join(root, '.calder/rules/testing.hard.md'))).toBe(true);
    expect(result.state.sharedRuleCount).toBe(4);
  });

  it('does not overwrite files that already exist', async () => {
    const root = makeProject('context-scaffold-existing');
    await mkdir(dirname(join(root, '.calder/rules/testing.hard.md')), { recursive: true });
    await writeFile(join(root, 'CALDER.shared.md'), '# Existing shared rules\nKeep this file.\n', 'utf8');
    await writeFile(join(root, '.calder/rules/testing.hard.md'), '# Existing testing\nDo not overwrite.\n', 'utf8');

    const result = await createProjectContextStarterFiles(root);

    expect(result.created).toEqual([
      '.calder/rules/boundaries.soft.md',
      '.calder/rules/handoff.soft.md',
    ]);
    expect(result.skipped).toEqual([
      'CALDER.shared.md',
      '.calder/rules/testing.hard.md',
    ]);
    expect(readFileSync(join(root, 'CALDER.shared.md'), 'utf8')).toContain('Existing shared rules');
    expect(readFileSync(join(root, '.calder/rules/testing.hard.md'), 'utf8')).toContain('Do not overwrite');
  });
});

describe('createProjectContextRuleFile', () => {
  it('creates a named shared rule file and returns fresh discovery state', async () => {
    const root = makeProject('context-create-rule');

    const result = await createProjectContextRuleFile(root, 'Review Checklist', 'hard');

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe('.calder/rules/review-checklist.hard.md');
    expect(existsSync(join(root, '.calder/rules/review-checklist.hard.md'))).toBe(true);
    expect(readFileSync(join(root, '.calder/rules/review-checklist.hard.md'), 'utf8')).toContain('# Review Checklist');
    expect(result.state.sharedRuleCount).toBe(1);
  });

  it('does not overwrite an existing shared rule file', async () => {
    const root = makeProject('context-create-rule-existing');
    await mkdir(dirname(join(root, '.calder/rules/review-checklist.hard.md')), { recursive: true });
    await writeFile(join(root, '.calder/rules/review-checklist.hard.md'), '# Existing Review Checklist\nKeep me.\n', 'utf8');

    const result = await createProjectContextRuleFile(root, 'Review Checklist', 'hard');

    expect(result.created).toBe(false);
    expect(result.relativePath).toBe('.calder/rules/review-checklist.hard.md');
    expect(readFileSync(join(root, '.calder/rules/review-checklist.hard.md'), 'utf8')).toContain('Keep me.');
  });
});

describe('renameProjectContextRuleFile', () => {
  it('renames a shared rule file, updates the heading, and returns refreshed state', async () => {
    const root = makeProject('context-rename-rule');
    await mkdir(dirname(join(root, '.calder/rules/testing.hard.md')), { recursive: true });
    await writeFile(
      join(root, '.calder/rules/testing.hard.md'),
      '# Testing\n\n- Keep the rest of this file.\n',
      'utf8',
    );

    const result = await renameProjectContextRuleFile(
      root,
      '.calder/rules/testing.hard.md',
      'Verification Rules',
      'soft',
    );

    expect(result.renamed).toBe(true);
    expect(result.relativePath).toBe('.calder/rules/verification-rules.soft.md');
    expect(existsSync(join(root, '.calder/rules/testing.hard.md'))).toBe(false);
    expect(readFileSync(join(root, '.calder/rules/verification-rules.soft.md'), 'utf8')).toContain('# Verification Rules');
    expect(readFileSync(join(root, '.calder/rules/verification-rules.soft.md'), 'utf8')).toContain('Keep the rest of this file.');
    expect(result.state.sharedRuleCount).toBe(1);
  });

  it('does not overwrite an existing destination rule file', async () => {
    const root = makeProject('context-rename-rule-existing');
    await mkdir(dirname(join(root, '.calder/rules/testing.hard.md')), { recursive: true });
    await writeFile(join(root, '.calder/rules/testing.hard.md'), '# Testing\nOriginal.\n', 'utf8');
    await writeFile(join(root, '.calder/rules/verification-rules.soft.md'), '# Verification Rules\nKeep me.\n', 'utf8');

    const result = await renameProjectContextRuleFile(
      root,
      '.calder/rules/testing.hard.md',
      'Verification Rules',
      'soft',
    );

    expect(result.renamed).toBe(false);
    expect(result.relativePath).toBe('.calder/rules/verification-rules.soft.md');
    expect(readFileSync(join(root, '.calder/rules/testing.hard.md'), 'utf8')).toContain('Original.');
    expect(readFileSync(join(root, '.calder/rules/verification-rules.soft.md'), 'utf8')).toContain('Keep me.');
  });
});

describe('deleteProjectContextRuleFile', () => {
  it('deletes a shared rule file and returns refreshed state', async () => {
    const root = makeProject('context-delete-rule');
    await mkdir(dirname(join(root, '.calder/rules/testing.hard.md')), { recursive: true });
    await writeFile(join(root, '.calder/rules/testing.hard.md'), '# Testing\nDelete me.\n', 'utf8');

    const result = await deleteProjectContextRuleFile(root, '.calder/rules/testing.hard.md');

    expect(result.deleted).toBe(true);
    expect(existsSync(join(root, '.calder/rules/testing.hard.md'))).toBe(false);
    expect(result.state.sharedRuleCount).toBe(0);
  });
});
