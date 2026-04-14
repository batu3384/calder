import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project checkpoint preferences contract', () => {
  it('surfaces saved checkpoints inside the integrations section', () => {
    expect(source).toContain('Recovery checkpoints');
    expect(source).toContain('Create checkpoint');
    expect(source).toContain('checkpoint.create');
    expect(source).toContain("showModal('New Checkpoint'");
    expect(source).toContain('checkpoint-discovery-shell');
    expect(source).toContain('Preview');
    expect(source).toContain('Open');
    expect(source).toContain('Restore');
    expect(source).toContain("showModal('Restore Checkpoint'");
    expect(source).toContain('checkpoint.read');
    expect(source).toContain('restoreProjectCheckpoint');
    expect(source).toContain('checkpoint-restore-mode');
    expect(source).toContain('Replace current layout');
    expect(source).toContain('checkpointDocument.git.changedFiles');
    expect(source).toContain('checkpointDocument.projectTeamContext');
    expect(source).toContain("'Team context'");
    expect(source).toContain('checkpoint-restore-confirm-file-list');
    expect(source).toContain('checkpoint.restoreSummary');
    expect(source).toContain('checkpoint-restore-confirm');
  });

  it('styles checkpoint discovery rows and actions', () => {
    expect(styles).toContain('.checkpoint-discovery-shell');
    expect(styles).toContain('.checkpoint-discovery-actions');
    expect(styles).toContain('.checkpoint-discovery-item');
    expect(styles).toContain('.checkpoint-discovery-item-actions');
    expect(styles).toContain('.checkpoint-discovery-action-btn');
    expect(styles).toContain('.checkpoint-discovery-item-restore-summary');
    expect(styles).toContain('.checkpoint-restore-confirm');
    expect(styles).toContain('.checkpoint-restore-confirm-file-list');
  });
});
