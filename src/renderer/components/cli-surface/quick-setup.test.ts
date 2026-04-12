import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const quickSetupSource = readFileSync(new URL('./quick-setup.ts', import.meta.url), 'utf-8');
const cliSurfaceCss = readFileSync(new URL('../../styles/cli-surface.css', import.meta.url), 'utf-8');

describe('cli surface quick setup contract', () => {
  it('renders run, edit, and manual setup actions for discovered candidates', () => {
    expect(quickSetupSource).toContain('CLI Surface Suggestions');
    expect(quickSetupSource).toContain('data-action="run"');
    expect(quickSetupSource).toContain('data-action="edit"');
    expect(quickSetupSource).toContain("manualButton.dataset.action = 'manual-setup'");
    expect(quickSetupSource).toContain('handlers.onRun(candidate)');
    expect(quickSetupSource).toContain('handlers.onEdit(candidate)');
    expect(quickSetupSource).toContain('handlers.onManual()');
  });

  it('styles quick setup candidates as lightweight suggestion cards', () => {
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-card');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-command');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-actions');
  });
});
