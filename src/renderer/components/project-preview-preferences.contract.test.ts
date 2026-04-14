import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project preview preferences contract', () => {
  it('surfaces a preview center inside the integrations section', () => {
    expect(source).toContain('Preview center');
    expect(source).toContain('window.calder.browser.listLocalTargets');
    expect(source).toContain('Open in Live View');
    expect(source).toContain('Focus CLI Surface');
    expect(source).toContain('Open workspace shell');
    expect(source).toContain('Restart preview runtime');
    expect(source).toContain('describePreviewRuntimeHealth');
    expect(source).toContain('Runtime health');
    expect(source).toContain('Last exit');
    expect(source).toContain('Last error');
    expect(source).toContain('preview-discovery-shell');
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
