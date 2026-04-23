import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const sidebarCss = readFileSync(new URL('./sidebar.css', import.meta.url), 'utf-8');
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

  it('treats sidebar actions and project rows like a refined navigation rail', () => {
    expect(sidebarCss).toContain('.sidebar-header-actions');
    expect(sidebarCss).toContain('border: 1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent);');
    expect(sidebarCss).toContain('.project-item:hover');
    expect(sidebarCss).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.04)');
    expect(sidebarCss).toContain('.project-item-main');
    expect(sidebarCss).toContain('gap: 4px;');
    expect(sidebarCss).toContain('min-height: 52px;');
    expect(
      sidebarCss.includes('font-size: 9px;')
      || sidebarCss.includes('font-size: var(--type-2xs);'),
    ).toBe(true);
  });

  it('prefers anchored emphasis over hover lift in the project rail', () => {
    expect(sidebarCss).toContain('.project-item:hover');
    expect(sidebarCss).toContain('transform: none;');
    expect(sidebarCss).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.04)');
  });

  it('treats sidebar actions and rows like one authored rail system', () => {
    expect(sidebarCss).toContain('.sidebar-header-actions');
    expect(sidebarCss).toContain('.project-item.active');
    expect(
      sidebarCss.includes('border-radius: 14px;')
      || sidebarCss.includes('border-radius: var(--radius-md);'),
    ).toBe(true);
  });

  it('keeps project switching available in collapsed mode', () => {
    expect(sidebarCss).toContain('#sidebar.collapsed #sidebar-content');
    expect(sidebarCss).toContain('#sidebar.collapsed .project-collapsed-pill');
    expect(sidebarCss).toContain('#sidebar.collapsed .project-item-main');
  });

  it('keeps the sidebar mascot visible and non-distorted in both rail modes', () => {
    expect(sidebarCss).toContain('.sidebar-brand-totem');
    expect(sidebarCss).toContain('.sidebar-mascot-shell');
    expect(sidebarCss).toContain('.sidebar-mascot');
    expect(sidebarCss).toContain('.sidebar-brand-meta');
    expect(sidebarCss).toContain('width: 72px;');
    expect(sidebarCss).toContain('height: 64px;');
    expect(sidebarCss).toContain('object-fit: contain;');
    expect(sidebarCss).toContain('image-rendering: auto;');
    expect(sidebarCss).toContain('animation: sidebar-mascot-float');
    expect(sidebarCss).toContain('@keyframes sidebar-mascot-float');
    expect(sidebarCss).toContain('@keyframes sidebar-mascot-aura');
    expect(sidebarCss).toContain('.sidebar-mascot-shell::before');
    expect(sidebarCss).toContain('#sidebar.collapsed .sidebar-mascot-shell');
    expect(sidebarCss).toContain('width: 58px;');
    expect(sidebarCss).toContain('height: 52px;');
    expect(sidebarCss).not.toContain('sidebar-stage-sheen');
  });

  it('keeps mascot presence premium and project rows height-stable', () => {
    expect(sidebarCss).toContain('Premium stability pass');
    expect(sidebarCss).toContain('grid-template-columns: 86px minmax(0, 1fr);');
    expect(sidebarCss).toContain('width: 82px;');
    expect(sidebarCss).toContain('height: 74px;');
    expect(sidebarCss).toContain('min-height: 56px;');
    expect(sidebarCss).toContain('.project-item .project-path');
    expect(sidebarCss).toContain('max-height: none;');
    expect(sidebarCss).toContain('#sidebar.collapsed');
    expect(sidebarCss).toContain('width: 88px !important;');
    expect(sidebarCss).toContain('height: 62px;');
  });

  it('styles project state badges as semantic status chips', () => {
    expect(sidebarCss).toContain('.project-status-chip.is-attention');
    expect(sidebarCss).toContain('.project-status-chip.is-unread');
    expect(sidebarCss).toContain('.project-status-chip.is-live');
    expect(sidebarCss).toContain('.project-status-chip.is-queue');
  });
});
