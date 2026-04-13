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
    expect(sidebarCss).toContain('transform: translateY(-1px);');
    expect(sidebarCss).toContain('.project-item-main');
    expect(sidebarCss).toContain('gap: 4px;');
    expect(sidebarCss).toContain('min-height: 52px;');
    expect(sidebarCss).toContain('font-size: 9px;');
  });
});
