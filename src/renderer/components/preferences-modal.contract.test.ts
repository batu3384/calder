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
    expect(source).toContain('Workspace Center');
    expect(source).toContain('Calder workspace');
    expect(source).toContain('Layout');
    expect(source).toContain('Integrations');
    expect(source).not.toContain('Control Center');
    expect(source).not.toContain('System controls');
  });

  it('uses control-center sections and layout groups', () => {
    expect(source).toContain("type Section = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about'");
    expect(source).toContain("id: 'layout', label: 'Layout'");
    expect(source).toContain("id: 'providers', label: 'Integrations'");
    expect(source).toContain('Ops Rail modules');
    expect(source).toContain('Live View behavior');
    expect(source).toContain('Session Deck defaults');
  });

  it('uses native modal and preferences shell hooks', () => {
    expect(source).toContain("titleEl.textContent = 'Workspace Center'");
    expect(source).toContain("bodyEl.classList.add('preferences-body');");
    expect(source).toContain('content.scrollTop = 0;');
    expect(source).toContain('Provider');
    expect(source).toContain('Tracking');
    expect(source).toContain('preferences-overview-grid');
    expect(source).toContain('(not installed)');
    expect(source).toContain('Calder will fall back to the next installed tool');
    expect(source).not.toContain("titleEl.textContent = 'Control Center'");
    expect(styles).toContain('.preferences-shell');
    expect(styles).toContain('.preferences-section');
    expect(styles).toContain('.preferences-control-note');
    expect(modalStyles).toContain('.modal-surface');
    expect(modalSource).toContain('restoreFocusAfterClose');
  });

  it('styles the control center like a control sheet instead of a pill-heavy settings page', () => {
    expect(styles).toContain('.preferences-menu-item');
    expect(styles).toContain('.preferences-menu-item::before');
    expect(styles).toContain('.preferences-menu-item.active::before');
    expect(styles).toContain('grid-template-columns: 228px minmax(0, 1fr);');
    expect(styles).toContain('.preferences-menu-item-label');
    expect(styles).toContain('.preferences-overview-grid');
    expect(styles).toContain('.preferences-section-card');
    expect(source).toContain('preferences-content-shell');
    expect(source).toContain('setup-provider-shell');
    expect(source).toContain('shortcut-group-shell');
    expect(source).toContain('about-hero');
    expect(source).toContain('about-link-grid');
    expect(styles).toContain('#modal-body.preferences-body');
    expect(styles).toContain('.preferences-content-shell');
    expect(styles).toContain('display: flex;');
    expect(styles).toContain('.modal-toggle-field');
    expect(styles).toContain('.modal-toggle-field .custom-select');
    expect(styles).toContain('.setup-provider-shell');
    expect(styles).toContain('.setup-provider-status');
    expect(styles).toContain('.shortcut-group-shell');
    expect(styles).toContain('.shortcut-row-actions');
    expect(styles).toContain('.shortcut-key-btn');
    expect(styles).toContain('.shortcut-reset-btn');
    expect(styles).toContain('.about-hero');
    expect(styles).toContain('.about-link-grid');
    expect(styles).toContain('.about-update-btn');
    expect(styles).toContain('.setup-fix-btn');
    expect(styles).toContain('box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);');
    expect(modalStyles).toContain('#modal-actions, .modal-actions');
    expect(modalStyles).toContain('justify-content: flex-end;');
    expect(modalStyles).toContain('.modal-btn.primary');
    expect(modalStyles).toContain('min-width: 112px;');
    expect(styles).not.toContain('border-left: 1px solid var(--border-subtle);');
    expect(modalStyles).toContain('#modal, .modal-box');
    expect(modalStyles).toContain('border-radius: 16px;');
  });

  it('keeps the settings rail scrollable and anchored on short viewports', () => {
    expect(styles).toContain('.preferences-menu {');
    expect(styles).toContain('overflow-y: auto;');
    expect(styles).toContain('overscroll-behavior: contain;');
    expect(styles).not.toContain('transform: translateX(1px);');
  });
});
