import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf-8');
const imports = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8');
const auroraCss = readFileSync(new URL('./theme-aurora.css', import.meta.url), 'utf-8');
const commandStudioCss = readFileSync(new URL('./theme-command-studio.css', import.meta.url), 'utf-8');
const cockpitUrl = new URL('./cockpit.css', import.meta.url);
const cockpitCss = existsSync(cockpitUrl) ? readFileSync(cockpitUrl, 'utf-8') : '';

describe('precision cockpit theme contract', () => {
  it('defines the shared cockpit design tokens', () => {
    expect(baseCss).toContain('--surface-canvas');
    expect(baseCss).toContain('--surface-panel');
    expect(baseCss).toContain('--surface-elevated');
    expect(baseCss).toContain('--surface-live');
    expect(baseCss).toContain('--surface-deck');
    expect(baseCss).toContain('--surface-ops');
    expect(baseCss).toContain('--control-height-md');
    expect(baseCss).toContain('--accent-soft');
    expect(baseCss).toContain('--accent-warm');
    expect(baseCss).toContain('--surface-shell');
    expect(baseCss).toContain('--border-hairline');
    expect(baseCss).toContain('--accent-line');
    expect(baseCss).toContain('--motion-fast');
    expect(baseCss).toContain('--motion-panel');
    expect(baseCss).toContain('--font-sans: "IBM Plex Sans", "Inter"');
    expect(baseCss).not.toContain('--accent: #ef6879;');
  });

  it('loads the command studio premium theme after feature styles', () => {
    expect(imports.trim().endsWith("@import url('./styles/theme-command-studio.css');")).toBe(true);
    expect(baseCss).toContain('--accent-aurora');
    expect(baseCss).not.toContain('--surface-canvas: #090705;');
    expect(auroraCss).toContain('--aurora-panel-gradient');
    expect(auroraCss).toContain('--executive-panel-gradient');
    expect(auroraCss).toContain('grid-auto-rows: max-content;');
    expect(auroraCss).toContain('calder-aurora-drift');
    expect(auroraCss).toContain('Premium shell audit v10');
    expect(auroraCss).toContain('--premium-panel-hairline');
    expect(auroraCss).toContain('grid-template-columns: 86px minmax(0, 1fr);');
    expect(commandStudioCss).toContain('Calder Command Studio');
    expect(commandStudioCss).toContain('Command studio coherence pass');
    expect(commandStudioCss).toContain('Calder premium restraint pass');
    expect(commandStudioCss).toContain('--studio-cyan');
    expect(commandStudioCss).toContain('--studio-focus-halo');
    expect(commandStudioCss).toContain('--studio-resonance-glow');
    expect(commandStudioCss).toContain('.context-inspector-tabs');
    expect(commandStudioCss).toContain('context-inspector-panel-enter');
    expect(commandStudioCss).toContain('grid-template-columns: 76px minmax(0, 1fr);');
    expect(commandStudioCss).toContain('contain: paint;');
    expect(commandStudioCss).toContain('animation: none;');
    expect(commandStudioCss).toContain('#sidebar-brand-stage.sidebar-brand-stage:hover .sidebar-mascot-shell');
    expect(commandStudioCss).toContain('width: 72px;');
    expect(commandStudioCss).toContain('height: 66px;');
    expect(commandStudioCss).toContain('scrollbar-gutter: stable;');
    expect(commandStudioCss).toContain('.project-item-shell + .project-item-shell::before');
    expect(commandStudioCss).toContain('width: 82px !important;');
    expect(commandStudioCss).toContain('#modal.preferences-modal.modal-wide');
    expect(commandStudioCss).toContain('height: min(760px, calc(100vh - 56px));');
    expect(commandStudioCss).toContain('#context-inspector {');
    expect(commandStudioCss).toContain('width: 304px;');
    expect(commandStudioCss).toContain('width: 312px;');
    expect(commandStudioCss).toContain('width: 308px;');
    expect(commandStudioCss).toContain('backdrop-filter: none;');
    expect(commandStudioCss).toContain('width: 88px !important;');
    expect(commandStudioCss).not.toContain('studio-mascot-premium-float 6.2s');
    expect(commandStudioCss).not.toContain('animation: studio-mascot-live-float');
    expect(commandStudioCss).not.toContain('animation: studio-mascot-shell-aura');
    expect(commandStudioCss).not.toContain('animation: studio-mascot-signal');
    expect(commandStudioCss).not.toContain('backdrop-filter: blur(10px) saturate(1.1);');
    expect(commandStudioCss).toContain('grid-template-areas:');
    expect(commandStudioCss).toContain('"nav primary"');
  });

  it('keeps terminal provider badges out of the generic aurora label tint', () => {
    expect(auroraCss).not.toContain('.terminal-pane-provider,');
  });

  it('defines shared cockpit control classes', () => {
    expect(cockpitCss).toContain('.shell-kicker');
    expect(cockpitCss).toContain('.control-chip');
    expect(cockpitCss).toContain('.surface-card');
  });
});
