import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const modalPrimarySource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences/preferences-modal.ts'), 'utf8');
const modalSectionsSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences/preferences-modal-sections.ts'), 'utf8');
const checkpointConfirmSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences/preferences-checkpoint-confirm.ts'),
  'utf8',
);
const modalSource = [modalPrimarySource, modalSectionsSource, checkpointConfirmSource].join('\n');
const checkpointSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences/preferences-checkpoint-discovery.ts'),
  'utf8',
);
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project checkpoint preferences contract', () => {
  it('surfaces saved checkpoints inside the integrations section', () => {
    expect(modalSource).toContain("import { renderProjectCheckpointSection } from './preferences-checkpoint-discovery.js';");
    expect(modalSource).toContain('renderProjectCheckpointSection({');
    expect(modalSource).toContain('container: trackingGroup');
    expect(modalSource).toContain('buildCheckpointRestoreConfirm');
    expect(modalSource).toContain('checkpointDocument.git.changedFiles');
    expect(modalSource).toContain('checkpointDocument.projectTeamContext');
    expect(modalSource).toContain("'Team context'");
    expect(modalSource).toContain('checkpoint-restore-confirm-file-list');
    expect(modalSource).toContain('checkpoint-restore-confirm');

    expect(checkpointSource).toContain('Recovery checkpoints');
    expect(checkpointSource).toContain('Create checkpoint');
    expect(checkpointSource).toContain('checkpoint.create');
    expect(checkpointSource).toContain("showModal('New Checkpoint'");
    expect(checkpointSource).toContain('checkpoint-discovery-shell');
    expect(checkpointSource).toContain('Preview');
    expect(checkpointSource).toContain('Open');
    expect(checkpointSource).toContain('Restore');
    expect(checkpointSource).toContain("showModal('Restore Checkpoint'");
    expect(checkpointSource).toContain('checkpoint.read');
    expect(checkpointSource).toContain('restoreProjectCheckpoint');
    expect(checkpointSource).toContain('checkpoint-restore-mode');
    expect(checkpointSource).toContain('Replace current layout');
    expect(checkpointSource).toContain('checkpoint.restoreSummary');
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
