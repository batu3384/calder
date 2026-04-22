import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const modalPrimarySource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const modalSectionsSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal-sections.ts'), 'utf8');
const modalSource = [modalPrimarySource, modalSectionsSource].join('\n');
const previewSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences-preview-discovery.ts'),
  'utf8',
);
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project preview preferences contract', () => {
  it('surfaces a preview center inside the integrations section', () => {
    expect(modalSource).toContain("import { renderProjectPreviewCenterSection } from './preferences-preview-discovery.js';");
    expect(modalSource).toContain('renderProjectPreviewCenterSection({');
    expect(modalSource).toContain('container: orchestrationGroup');
    expect(modalSource).toContain('onCloseModalWide: closeWideModal');

    expect(previewSource).toContain('Preview center');
    expect(previewSource).toContain('window.calder.browser');
    expect(previewSource).toContain('.listLocalTargets()');
    expect(previewSource).toContain('Open in Live View');
    expect(previewSource).toContain('Focus CLI Surface');
    expect(previewSource).toContain('Open workspace shell');
    expect(previewSource).toContain('Restart preview runtime');
    expect(previewSource).toContain('describePreviewRuntimeHealth');
    expect(previewSource).toContain('Runtime health');
    expect(previewSource).toContain('Last exit');
    expect(previewSource).toContain('Last error');
    expect(previewSource).toContain('preview-discovery-shell');
  });

  it('styles preview center cards with dedicated rows and actions', () => {
    expect(styles).toContain('.preview-discovery-shell');
    expect(styles).toContain('.preview-discovery-actions');
    expect(styles).toContain('.preview-discovery-item');
    expect(styles).toContain('.preview-discovery-item-actions');
    expect(styles).toContain('.preview-discovery-action-btn');
    expect(styles).toContain('.preview-discovery-health');
    expect(styles).toContain('.preview-discovery-health-status');
    expect(styles).toContain('.preview-discovery-health-detail');
  });
});
