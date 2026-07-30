import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sidebarCss = readFileSync(new URL('./sidebar.css', import.meta.url), 'utf-8');
const chromeRailCss = readFileSync(new URL('./chrome-rail.css', import.meta.url), 'utf-8');
const cockpitCss = readFileSync(new URL('./cockpit.css', import.meta.url), 'utf-8');

describe('sidebar rail stylesheet contract', () => {
  it('treats project rows as navigation entries instead of stacked cards', () => {
    expect(sidebarCss).toContain('.project-item::before');
    expect(sidebarCss).toContain('.project-item.active .project-path');
    expect(sidebarCss).toContain('.project-item.active .project-session-count');
    expect(sidebarCss).toContain('.project-item:hover::before');
  });

  it('keeps the sidebar eyebrow minimal instead of rendering it like a chip', () => {
    expect(cockpitCss).toContain('.sidebar-eyebrow');
    expect(cockpitCss).toContain('background: transparent;');
    expect(cockpitCss).toContain('border: none;');
  });

  it('uses stronger project typography instead of generic list row text', () => {
    expect(sidebarCss).toContain('.project-item .project-name');
    expect(sidebarCss).toContain('font-family: var(--font-display);');
    expect(sidebarCss).toContain('.project-item .project-path');
    expect(sidebarCss).toContain('font-family: var(--font-mono);');
  });

  it('locks Linear-dense flat chrome for project rail', () => {
    expect(chromeRailCss).toContain('--chrome-h: 46px;');
    expect(chromeRailCss).toContain('border-radius: var(--chrome-radius) !important;');
    expect(chromeRailCss).toContain('.sidebar-header-actions');
    expect(chromeRailCss).toContain('box-shadow: none !important;');
    expect(chromeRailCss).toContain('.sidebar-title');
    expect(chromeRailCss).toContain('#sidebar:not(.collapsed) .project-collapsed-pill');
  });

  it('keeps resize handle on chrome background idle', () => {
    expect(sidebarCss).toContain('background: var(--chrome-bg, #0b0b0c);');
    expect(sidebarCss).toContain('width: 4px;');
    expect(chromeRailCss).toContain('#sidebar-resize-handle');
  });

  it('owns collapsed sidebar toggle layout so the button stays centered', () => {
    expect(chromeRailCss).toContain('#sidebar.collapsed #sidebar-header .sidebar-header-primary');
    expect(chromeRailCss).toContain("grid-template-areas: 'toggle' !important;");
    expect(chromeRailCss).toContain('#sidebar.collapsed .sidebar-toggle-btn');
    expect(chromeRailCss).toContain('justify-self: center !important;');
  });

  it('keeps project paths visible in the expanded rail', () => {
    expect(chromeRailCss).toContain('/* Path always visible');
    expect(chromeRailCss).toContain('.project-item .project-path');
    expect(chromeRailCss).toContain('text-overflow: ellipsis !important;');
  });

  it('uses a single select for auto-approval', () => {
    expect(chromeRailCss).toContain('.auto-approval-panel');
    expect(chromeRailCss).toContain('.auto-approval-select');
  });

  it('uses underline tabs instead of pill tabs on the session shelf', () => {
    expect(chromeRailCss).toContain('border-bottom: 2px solid transparent !important;');
    expect(chromeRailCss).toContain('border-bottom-color: var(--accent) !important;');
    expect(chromeRailCss).toContain('#tab-bar .tab-item.active::after');
    expect(chromeRailCss).toContain('display: none !important;');
  });

  it('prefers anchored emphasis over hover lift in the project rail', () => {
    expect(chromeRailCss).toContain('.project-item:hover');
    expect(chromeRailCss).toContain('transform: none !important;');
    expect(chromeRailCss).toContain('box-shadow: none !important;');
  });

  it('keeps project switching available in collapsed mode', () => {
    expect(sidebarCss).toContain('#sidebar.collapsed #sidebar-content');
    expect(sidebarCss).toContain('#sidebar.collapsed .project-collapsed-pill');
    expect(sidebarCss).toContain('#sidebar.collapsed .project-item-main');
  });

  it('keeps the brand row flat and mascot-free in chrome', () => {
    expect(sidebarCss).not.toContain('.sidebar-brand-totem');
    expect(sidebarCss).not.toContain('.sidebar-mascot-shell');
    expect(sidebarCss).not.toContain('.sidebar-mascot');
    expect(sidebarCss).toContain('.sidebar-brand-meta');
    expect(sidebarCss).toContain('#sidebar-brand-row');
    expect(sidebarCss).toContain('width: var(--sidebar-width-collapsed) !important;');
    expect(sidebarCss).not.toContain('sidebar-stage-sheen');
    expect(chromeRailCss).toContain('.sidebar-brand-status');
    expect(chromeRailCss).toContain('display: none !important;');
  });

  it('keeps project rows height-stable with tokenized collapsed rail', () => {
    expect(sidebarCss).toContain('.project-item .project-path');
    expect(sidebarCss).toContain('max-height: none;');
    expect(sidebarCss).toContain('#sidebar.collapsed');
    expect(sidebarCss).toContain('width: var(--sidebar-width-collapsed) !important;');
    expect(sidebarCss).not.toContain('width: 88px !important;');
  });

  it('styles project state badges as semantic status chips', () => {
    expect(sidebarCss).toContain('.project-status-chip.is-attention');
    expect(sidebarCss).toContain('.project-status-chip.is-unread');
    expect(sidebarCss).toContain('.project-status-chip.is-live');
    expect(sidebarCss).toContain('.project-status-chip.is-queue');
  });
});
