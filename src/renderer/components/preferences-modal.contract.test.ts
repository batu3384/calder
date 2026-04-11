import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./preferences-modal.ts', import.meta.url), 'utf-8');
const modalSource = readFileSync(new URL('./modal.ts', import.meta.url), 'utf-8');
const styles = readFileSync(new URL('../styles/preferences.css', import.meta.url), 'utf-8');
const modalStyles = readFileSync(new URL('../styles/modals.css', import.meta.url), 'utf-8');

describe('preferences modal contract', () => {
  it('builds a branded menu header and section intros', () => {
    expect(source).toContain('preferences-menu-header');
    expect(source).toContain('preferences-section-intro');
  });

  it('uses shell language for layout controls', () => {
    expect(source).toContain('Control Center');
    expect(source).toContain('Layout');
    expect(source).toContain('Providers');
    expect(source).not.toContain('Control Surface');
    expect(source).not.toContain('Shell Layout');
  });

  it('uses control-center sections and layout groups', () => {
    expect(source).toContain("type Section = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about'");
    expect(source).toContain("{ id: 'layout', label: 'Layout' }");
    expect(source).toContain("{ id: 'providers', label: 'Providers' }");
    expect(source).toContain('Ops Rail modules');
    expect(source).toContain('Live View behavior');
    expect(source).toContain('Session Deck defaults');
  });

  it('uses native modal and preferences shell hooks', () => {
    expect(source).toContain('Preferences');
    expect(source).toContain('Provider');
    expect(source).toContain('Tracking');
    expect(styles).toContain('.preferences-shell');
    expect(styles).toContain('.preferences-section');
    expect(modalStyles).toContain('.modal-surface');
    expect(modalSource).toContain('restoreFocusAfterClose');
  });
});
