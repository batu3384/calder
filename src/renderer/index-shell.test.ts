import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf-8');
const sidebarCss = readFileSync(new URL('./styles/sidebar.css', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('./styles/tabs.css', import.meta.url), 'utf-8');

describe('index shell contract', () => {
  it('exposes cockpit wrappers for sidebar and top bar chrome', () => {
    expect(html).toContain('class="sidebar-title-group"');
    expect(html).toContain('class="sidebar-brand-block"');
    expect(html).toContain('class="tab-bar-main"');
    expect(html).toContain('class="tab-bar-meta"');
  });

  it('styles the cockpit wrappers in the sidebar and tab chrome stylesheets', () => {
    expect(sidebarCss).toContain('.sidebar-title-group');
    expect(sidebarCss).toContain('.sidebar-brand-block');
    expect(tabsCss).toContain('.tab-bar-main');
    expect(tabsCss).toContain('.tab-bar-meta');
  });
});
