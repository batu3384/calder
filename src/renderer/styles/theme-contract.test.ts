import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf-8');
const imports = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8');
const auroraCss = readFileSync(new URL('./theme-aurora.css', import.meta.url), 'utf-8');
const commandStudioCss = readFileSync(
  new URL('./theme-command-studio.css', import.meta.url),
  'utf-8',
);
const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');
const cockpitUrl = new URL('./cockpit.css', import.meta.url);
const cockpitCss = existsSync(cockpitUrl) ? readFileSync(cockpitUrl, 'utf-8') : '';

function extractAppAmbientBlock(css: string): string {
  const match = css.match(/#app\s*\{[\s\S]*?\n\}/);
  return match?.[0] ?? '';
}

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
    expect(baseCss).not.toContain('--accent-warm');
    expect(baseCss).toMatch(/--accent:\s*#6f9aa6/);
    expect(baseCss).toContain('--surface-shell');
    expect(baseCss).toContain('--border-hairline');
    expect(baseCss).toContain('--accent-line');
    expect(baseCss).toContain('--motion-fast');
    expect(baseCss).toContain('--motion-panel');
    expect(baseCss).toContain('--font-sans:');
    expect(baseCss).toContain("'SF Pro Text'");
    expect(baseCss).toContain("'SF Pro Display'");
    expect(baseCss).not.toContain("'IBM Plex Sans'");
    expect(baseCss).not.toContain("'Inter'");
    expect(baseCss).not.toContain("'Manrope'");
    expect(baseCss).not.toContain('--accent: #ef6879;');
  });

  it('keeps command studio free of teal chrome literals and restores CLI brand accents', () => {
    expect(commandStudioCss).not.toContain('#66e7df');
    expect(commandStudioCss).not.toContain('102, 231, 223');
    expect(commandStudioCss).toContain('--accent: #6f9aa6');
    expect(commandStudioCss).not.toContain('#5e6ad2');
    expect(commandStudioCss).not.toContain('--provider-accent: var(--accent)');
    expect(baseCss).toContain("[data-provider='claude']");
    expect(baseCss).toContain('--provider-accent: #ff9b4a');
    expect(baseCss).toContain('--provider-accent: #32d3a2');
    expect(tabsCss).toContain('#7c8cff');
    expect(tabsCss).toContain('#ff9b4a');
  });

  it('loads the command studio premium theme after feature styles', () => {
    expect(imports.trim().endsWith("@import url('./styles/responsive-layout.css');")).toBe(true);
    expect(imports).toContain("@import url('./styles/theme-command-studio.css');");
    expect(baseCss).toContain('--accent-aurora');
    expect(baseCss).not.toContain('--surface-canvas: #090705;');
    expect(auroraCss).toContain('--aurora-panel-gradient');
    expect(auroraCss).toContain('--executive-panel-gradient');
    expect(auroraCss).toContain('grid-auto-rows: max-content;');
    expect(auroraCss).toContain('calder-aurora-drift');
    expect(auroraCss).toContain('Aurora Lite restraint pass');
    expect(auroraCss).toContain('Premium shell audit v10');
    expect(auroraCss).toContain('--premium-panel-hairline');
    expect(auroraCss).not.toContain('#sidebar-brand-stage');
    expect(commandStudioCss).toContain('Calder Command Studio');
    expect(commandStudioCss).toContain('Command studio coherence pass');
    expect(commandStudioCss).toContain('Aurora Lite restraint pass');
    expect(commandStudioCss).toContain('Calder premium restraint pass');
    expect(commandStudioCss).toContain('--studio-cyan');
    expect(commandStudioCss).toContain('--studio-focus-halo');
    expect(commandStudioCss).toContain('--studio-resonance-glow');
    expect(commandStudioCss).toContain('.context-inspector-tabs');
    expect(commandStudioCss).toContain('context-inspector-panel-enter');
    expect(commandStudioCss).toContain('scrollbar-gutter: stable;');
    expect(commandStudioCss).toContain('.project-item-shell + .project-item-shell::before');
    expect(commandStudioCss).toContain('width: var(--sidebar-width-collapsed) !important;');
    expect(commandStudioCss).toContain('IDE chrome contract');
    expect(commandStudioCss).toContain('#modal.preferences-modal.modal-wide');
    expect(commandStudioCss).toContain('height: min(760px, calc(100vh - 56px));');
    expect(commandStudioCss).toContain('#context-inspector {');
    expect(commandStudioCss).toContain('width: 304px;');
    expect(commandStudioCss).toContain('width: 312px;');
    expect(commandStudioCss).toContain('width: 308px;');
    expect(commandStudioCss).toContain('backdrop-filter: none;');
    expect(commandStudioCss).not.toContain('width: 88px !important;');
    expect(commandStudioCss).not.toContain('#sidebar-brand-stage');
    expect(commandStudioCss).not.toContain('.sidebar-mascot-shell');
    expect(commandStudioCss).not.toContain('radial-gradient(');
    expect(commandStudioCss).not.toContain('studio-mascot-premium-float 6.2s');
    expect(commandStudioCss).not.toContain('animation: studio-mascot-live-float');
    expect(commandStudioCss).not.toContain('animation: studio-mascot-shell-aura');
    expect(commandStudioCss).not.toContain('animation: studio-mascot-signal');
    expect(commandStudioCss).not.toContain('backdrop-filter: blur(10px) saturate(1.1);');
    expect(commandStudioCss).toContain('grid-template-areas:');
    expect(commandStudioCss).toContain("'nav primary'");
  });

  it('keeps shell ambient free of warm brass decorative washes', () => {
    const auroraAppAmbient = extractAppAmbientBlock(auroraCss);
    const studioAppAmbient = extractAppAmbientBlock(commandStudioCss);

    expect(auroraAppAmbient).not.toContain('213, 169, 79');
    expect(auroraAppAmbient).not.toContain('213, 175, 105');
    expect(auroraAppAmbient).not.toContain('200, 168, 102');
    expect(studioAppAmbient).not.toContain('213, 169, 79');
    expect(studioAppAmbient).not.toContain('213, 175, 105');
    expect(studioAppAmbient).not.toContain('216, 177, 106');
  });

  it('keeps terminal provider badges out of the generic aurora label tint', () => {
    expect(auroraCss).not.toContain('.terminal-pane-provider,');
  });

  it('keeps chrome surfaces on Linear neutrals with accessible dim text', () => {
    expect(baseCss).toMatch(/--text-dim:\s*#7a7f87/);
    expect(baseCss).toContain('--git-added: var(--success)');
    expect(baseCss).toContain('--git-modified: var(--warning)');
    expect(auroraCss).toContain('--aurora-border: color-mix(in srgb, var(--border-subtle)');
    expect(auroraCss).toContain('--executive-graphite: #0f1011');
    expect(auroraCss).toContain('--executive-panel: #0f1011');
    expect(commandStudioCss).toContain('background: var(--studio-panel)');
    expect(commandStudioCss).not.toContain('rgba(7, 12, 18');
    expect(commandStudioCss).not.toContain('rgba(11, 18, 26');
    expect(tabsCss).toContain('.surface-live-view-btn');
    expect(tabsCss).not.toContain('.surface-mode-switcher');
  });

  it('defines shared cockpit control classes', () => {
    expect(cockpitCss).toContain('.shell-kicker');
    expect(cockpitCss).toContain('.control-chip');
    expect(cockpitCss).toContain('.surface-card');
  });
});
