import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const quickSetupSource = readFileSync(new URL('./quick-setup.ts', import.meta.url), 'utf-8');
const cliSurfaceCss = readFileSync(new URL('../../styles/cli-surface.css', import.meta.url), 'utf-8');

describe('cli surface quick setup contract', () => {
  it('renders run, edit, demo, and manual setup actions for discovered candidates', () => {
    expect(quickSetupSource).toContain('CLI Surface Suggestions');
    expect(quickSetupSource).toContain('cli-surface-quick-setup-summary');
    expect(quickSetupSource).toContain('Best match');
    expect(quickSetupSource).toContain('Node workspace');
    expect(quickSetupSource).toContain("createQuickSetupButton('Run', { primary: true, action: 'run' })");
    expect(quickSetupSource).toContain("createQuickSetupButton('Edit', { action: 'edit' })");
    expect(quickSetupSource).toContain('summaryPreview.textContent = formatCommand(candidates[0])');
    expect(quickSetupSource).toContain('cwd.textContent = candidate.cwd ?? \'\'');
    expect(quickSetupSource).toContain("createQuickSetupButton('Try demo', { primary: true, action: 'demo-setup' })");
    expect(quickSetupSource).toContain("createQuickSetupButton('Manual setup', { action: 'manual-setup' })");
    expect(quickSetupSource).toContain("'modal-btn primary cli-surface-quick-setup-btn'");
    expect(quickSetupSource).toContain("'modal-btn cli-surface-quick-setup-btn'");
    expect(quickSetupSource).toContain('handlers.onRun(candidate)');
    expect(quickSetupSource).toContain('handlers.onEdit(candidate)');
    expect(quickSetupSource).toContain('handlers.onDemo()');
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
    expect(cliSurfaceCss).toContain('.cli-surface-quick-setup-empty');
  });
});
