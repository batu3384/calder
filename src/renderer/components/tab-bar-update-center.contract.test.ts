import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('../styles/tabs.css', import.meta.url), 'utf-8');

describe('tab bar update center contract', () => {
  it('renders explicit progress and timestamp rows in the CLI update panel', () => {
    expect(tabBarSource).toContain('cli-update-panel-progress-label');
    expect(tabBarSource).toContain('cli-update-panel-timestamp');
    expect(tabBarSource).toContain('Progress: 0/0 (0%)');
    expect(tabBarSource).toContain('Last run: No updates yet');
  });

  it('auto-opens the update panel when a new update run starts', () => {
    expect(tabBarSource).toContain("snapshot.cli.phase === 'running' && lastCliPhase !== 'running' && !cliUpdatePanelVisible");
    expect(tabBarSource).toContain('toggleCliUpdatePanel(true)');
  });

  it('formats runtime progress and run timing labels', () => {
    expect(tabBarSource).toContain('Progress: ${progressLabel} (${progressPercent}%)');
    expect(tabBarSource).toContain('Started:');
    expect(tabBarSource).toContain('Last run:');
  });

  it('styles the new update panel status rows', () => {
    expect(tabsCss).toContain('.cli-update-panel-stats');
    expect(tabsCss).toContain('.cli-update-panel-progress-label');
    expect(tabsCss).toContain('.cli-update-panel-timestamp');
  });

  it('announces update status changes for assistive technologies', () => {
    expect(tabBarSource).toContain("cliUpdatePanelStatusEl.setAttribute('role', 'status')");
    expect(tabBarSource).toContain("cliUpdatePanelStatusEl.setAttribute('aria-live', 'polite')");
    expect(tabBarSource).toContain("cliUpdatePanelMetaEl.setAttribute('aria-live', 'polite')");
    expect(tabBarSource).toContain("cliUpdatePanelEl.setAttribute('aria-busy'");
  });
});
