import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const modalPrimarySource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const modalSectionsSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal-sections.ts'), 'utf8');
const modalSource = [modalPrimarySource, modalSectionsSource].join('\n');
const backgroundTaskSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences-background-task-discovery.ts'),
  'utf8',
);
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project background task preferences contract', () => {
  it('surfaces the local background task queue in integrations', () => {
    expect(modalSource).toContain("import { renderProjectBackgroundTaskSection } from './preferences-background-task-discovery.js';");
    expect(modalSource).toContain('renderProjectBackgroundTaskSection({');
    expect(modalSource).toContain('container: trackingGroup');
    expect(modalSource).toContain('modalBody: bodyEl');
    expect(modalSource).toContain('confirmButton: btnConfirm');
    expect(modalSource).toContain('cancelButton: btnCancel');
    expect(modalSource).toContain('registerModalCleanup: extendModalCleanup');

    expect(backgroundTaskSource).toContain('Background agents');
    expect(backgroundTaskSource).toContain('New queued task');
    expect(backgroundTaskSource).toContain('task.create');
    expect(backgroundTaskSource).toContain('task-discovery-shell');
    expect(backgroundTaskSource).toContain('Take over');
    expect(backgroundTaskSource).toContain('Resume');
    expect(backgroundTaskSource).toContain('Artifacts');
    expect(backgroundTaskSource).toContain('Queued');
    expect(backgroundTaskSource).toContain('Running');
    expect(backgroundTaskSource).toContain('Completed');
  });

  it('styles task discovery cards with dedicated rows and actions', () => {
    expect(styles).toContain('.task-discovery-shell');
    expect(styles).toContain('.task-discovery-actions');
    expect(styles).toContain('.task-discovery-summary');
    expect(styles).toContain('.task-discovery-item');
    expect(styles).toContain('.task-discovery-action-btn');
  });
});
