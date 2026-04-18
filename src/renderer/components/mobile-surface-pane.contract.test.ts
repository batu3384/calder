import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const paneSource = readFileSync(new URL('./mobile-surface/pane.ts', import.meta.url), 'utf8');

describe('mobile surface inspect workbench contract', () => {
  it('wires simulator launch and screenshot capture through mobileInspect bridge', () => {
    expect(paneSource).toContain('window.calder?.mobileInspect');
    expect(paneSource).toContain('api.launch(inspect.platform)');
    expect(paneSource).toContain('api.captureScreenshot(inspect.platform)');
    expect(paneSource).toContain('api.inspectPoint(inspect.platform');
  });

  it('supports point selection and prompt routing actions', () => {
    expect(paneSource).toContain('Selected point:');
    expect(paneSource).toContain('Send to selected');
    expect(paneSource).toContain('Tap selected');
    expect(paneSource).toContain('api.interact(inspect.platform');
    expect(paneSource).toContain('deliverSurfacePrompt(');
  });

  it('includes embedded live stream controls inside the mobile workbench', () => {
    expect(paneSource).toContain('Start live');
    expect(paneSource).toContain('Stop live');
    expect(paneSource).toContain('scheduleInspectLiveLoop(');
    expect(paneSource).toContain('Embedded live view started.');
  });

  it('launches simulator into a stable single-frame state instead of forcing live mode', () => {
    expect(paneSource).toContain("await captureInspectFrame(instance, 'manual');");
    expect(paneSource).toContain('stopInspectLiveMode(instance, \'Live paused for precise point inspection.\'');
  });

  it('renders compact inspect flow with blockers and dependency checklist', () => {
    expect(paneSource).toContain('Blocking requirements');
    expect(paneSource).toContain('Dependency checklist');
    expect(paneSource).toContain('Install and verify prerequisites relevant to the current project profile.');
  });

  it('auto-detects project profile and scopes mobile readiness messaging', () => {
    expect(paneSource).toContain('detectProjectProfile(');
    expect(paneSource).toContain('Project profile: iOS app');
    expect(paneSource).toContain('Platform auto-selected from project profile');
  });

  it('reuses shared mobile handoff presence copy for summary status', () => {
    expect(paneSource).not.toContain('buildShareDialogMobilePresence');
    expect(paneSource).not.toContain('mobile-surface-summary-pill-mobile-control');
    expect(paneSource).not.toContain('buildMobileControlPresenceSummary');
  });

  it('keeps mobile pane stable on repeated show calls', () => {
    expect(paneSource).not.toContain('hideAllMobileSurfacePanes();');
    expect(paneSource).toContain('!instance.lastReport');
  });

  it('clarifies snapshot-based inspect behavior to avoid control confusion', () => {
    expect(paneSource).toContain('snapshot-based');
    expect(paneSource).toContain('anlık görüntü tabanlıdır');
  });
});
