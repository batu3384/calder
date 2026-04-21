import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const sidebarSource = readFileSync(new URL('./sidebar.ts', import.meta.url), 'utf-8');
const sidebarCss = readFileSync(new URL('../styles/sidebar.css', import.meta.url), 'utf-8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

describe('sidebar accessibility contract', () => {
  it('renders the project rail as semantic navigation with real buttons', () => {
    expect(html).toContain('<nav id="sidebar"');
    expect(html).toContain('id="project-list" role="list"');
    expect(sidebarSource).toContain("shell.setAttribute('role', 'listitem')");
    expect(sidebarSource).toContain("const selectBtn = document.createElement('button');");
    expect(sidebarSource).toContain("selectBtn.type = 'button';");
    expect(sidebarSource).toContain("selectBtn.setAttribute('aria-current', 'page')");
    expect(sidebarSource).toContain("const deleteBtn = document.createElement('button');");
    expect(sidebarSource).toContain("deleteBtn.type = 'button';");
    expect(sidebarSource).toContain("deleteBtn.setAttribute('aria-label', `Remove project ${project.name}`)");
  });

  it('keeps the delete affordance visible on hover and keyboard focus without breaking the rail look', () => {
    expect(sidebarCss).toContain('.project-item-shell');
    expect(sidebarCss).toContain('.project-item:focus-visible');
    expect(sidebarCss).toContain('.project-delete');
    expect(sidebarCss).toContain('.project-item-shell:focus-within .project-delete');
    expect(sidebarCss).toContain('.project-item.active + .project-delete');
  });
});
