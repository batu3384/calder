import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const quickSetupSource = readFileSync(new URL('./quick-setup.ts', import.meta.url), 'utf-8');
const cliSurfaceCss = readFileSync(new URL('../../styles/cli-surface.css', import.meta.url), 'utf-8');

describe('cli surface quick setup contract', () => {
  it('renders run, edit, and manual setup actions for discovered candidates', () => {
    expect(quickSetupSource).toContain('CLI Surface Suggestions');
    expect(quickSetupSource).toContain('cli-surface-quick-setup-summary');
    expect(quickSetupSource).toContain('Best match');
    expect(quickSetupSource).toContain('Node workspace');
    expect(quickSetupSource).toContain("createQuickSetupButton('Run', { primary: true, action: 'run' })");
    expect(quickSetupSource).toContain("createQuickSetupButton('Edit', { action: 'edit' })");
    expect(quickSetupSource).toContain('summaryPreview.textContent = formatCommand(candidates[0])');
    expect(quickSetupSource).toContain('cwd.textContent = candidate.cwd ?? \'\'');
    expect(quickSetupSource).toContain("createQuickSetupButton('Manual setup', { action: 'manual-setup', tone: 'neutral' })");
    expect(quickSetupSource).toContain("createQuickSetupButton('Cancel', { tone: 'ghost', action: 'cancel' })");
    expect(quickSetupSource).toContain('cli-surface-quick-setup-btn-primary');
    expect(quickSetupSource).toContain('cli-surface-quick-setup-btn-neutral');
    expect(quickSetupSource).toContain('cli-surface-quick-setup-btn-ghost');
    expect(quickSetupSource).toContain('cli-surface-quick-setup-control');
    expect(quickSetupSource).toContain('cli-surface-quick-setup-modal');
    expect(quickSetupSource).toContain('cli-surface-quick-setup-footer');
    expect(quickSetupSource).toContain('cli-surface-quick-setup-footer-group');
    expect(quickSetupSource).toContain('cli-surface-quick-setup-card-btn');
    expect(quickSetupSource).toContain('handlers.onRun(candidate)');
    expect(quickSetupSource).toContain('handlers.onEdit(candidate)');
    expect(quickSetupSource).toContain('handlers.onManual()');
  });

  it('styles quick setup candidates and empty state as lightweight suggestion cards', () => {
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-summary');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-summary-kicker');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-summary-preview');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-card');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-command');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-actions');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-btn');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-control');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-btn-neutral');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-btn-ghost');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-footer-btn');
    expect(cliSurfaceCss).toContain('#modal.cli-surface-quick-setup-modal');
    expect(cliSurfaceCss).toContain('#modal-actions.cli-surface-quick-setup-footer');
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-empty');
  });
});
