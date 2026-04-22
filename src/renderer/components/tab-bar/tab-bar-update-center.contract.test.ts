import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const cliUpdatePanelSource = readFileSync(new URL('./tab-bar-cli-update-panel.ts', import.meta.url), 'utf-8');
const updateCenterSource = `${tabBarSource}\n${cliUpdatePanelSource}`;
const tabsCss = readFileSync(new URL('../../styles/tabs.css', import.meta.url), 'utf-8');

describe('tab bar update center contract', () => {
  it('renders explicit progress and timestamp rows in the CLI update panel', () => {
    expect(updateCenterSource).toContain('cli-update-panel-progress-label');
    expect(updateCenterSource).toContain('cli-update-panel-timestamp');
    expect(updateCenterSource).toContain('Progress: 0/0 (0%)');
    expect(updateCenterSource).toContain('Last run: No updates yet');
  });

  it('auto-opens the update panel when a new update run starts', () => {
    expect(tabBarSource).toContain("snapshot.cli.phase === 'running' && lastCliPhase !== 'running'");
    expect(tabBarSource).toContain('!isCliUpdatePanelVisible()');
    expect(tabBarSource).toContain('toggleCliUpdatePanel(true)');
  });

  it('formats runtime progress and run timing labels', () => {
    expect(updateCenterSource).toContain('Progress: ${progressLabel} (${progressPercent}%)');
    expect(updateCenterSource).toContain('Started:');
    expect(updateCenterSource).toContain('Last run:');
  });

  it('styles the new update panel status rows', () => {
    expect(tabsCss).toContain('.cli-update-panel-stats');
    expect(tabsCss).toContain('.cli-update-panel-progress-label');
    expect(tabsCss).toContain('.cli-update-panel-timestamp');
    expect(tabsCss).toContain('.cli-update-provider-row.is-active');
  });

  it('renders active provider stage details while updates are running', () => {
    expect(updateCenterSource).toContain("row.classList.toggle('is-active'");
    expect(updateCenterSource).toContain("provider.status === 'running' && provider.message");
  });

  it('announces update status changes for assistive technologies', () => {
    expect(updateCenterSource).toContain("cliUpdatePanelStatusEl.setAttribute('role', 'status')");
    expect(updateCenterSource).toContain("cliUpdatePanelStatusEl.setAttribute('aria-live', 'polite')");
    expect(updateCenterSource).toContain("cliUpdatePanelMetaEl.setAttribute('aria-live', 'polite')");
    expect(updateCenterSource).toContain("cliUpdatePanelEl.setAttribute('aria-busy'");
  });
});
