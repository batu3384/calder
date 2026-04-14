import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project background task preferences contract', () => {
  it('surfaces the local background task queue in integrations', () => {
    expect(source).toContain('Background agents');
    expect(source).toContain('New queued task');
    expect(source).toContain('task.create');
    expect(source).toContain('task-discovery-shell');
    expect(source).toContain('Take over');
    expect(source).toContain('Resume');
    expect(source).toContain('Artifacts');
    expect(source).toContain('Queued');
    expect(source).toContain('Running');
    expect(source).toContain('Completed');
  });

  it('styles task discovery cards with dedicated rows and actions', () => {
    expect(styles).toContain('.task-discovery-shell');
    expect(styles).toContain('.task-discovery-actions');
    expect(styles).toContain('.task-discovery-summary');
    expect(styles).toContain('.task-discovery-item');
    expect(styles).toContain('.task-discovery-action-btn');
  });
});
