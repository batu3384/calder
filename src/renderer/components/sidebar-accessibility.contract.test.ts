import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sidebarSource = readFileSync(new URL('./sidebar.ts', import.meta.url), 'utf-8');
const sidebarProjectListSource = readFileSync(
  new URL('./sidebar-project-list.ts', import.meta.url),
  'utf-8',
);
const sidebarCss = readFileSync(new URL('../styles/sidebar.css', import.meta.url), 'utf-8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

describe('sidebar accessibility contract', () => {
  it('renders the project rail as semantic navigation with real buttons', () => {
    expect(html).toContain('<nav id="sidebar"');
    expect(html).toContain('id="project-list" role="list"');
    expect(sidebarProjectListSource).toContain("shell.setAttribute('role', 'listitem')");
    expect(sidebarProjectListSource).toContain(
      "const selectBtn = document.createElement('button');",
    );
    expect(sidebarProjectListSource).toContain("selectBtn.type = 'button';");
    expect(sidebarProjectListSource).toContain("selectBtn.setAttribute('aria-current', 'page')");
    expect(sidebarProjectListSource).toContain(
      "const deleteBtn = document.createElement('button');",
    );
    expect(sidebarProjectListSource).toContain("deleteBtn.type = 'button';");
    expect(sidebarProjectListSource).toContain(
      "deleteBtn.setAttribute('aria-label', `Remove project ${project.name}`)",
    );
    expect(sidebarSource).toContain('renderSidebarProjectList');
  });

  it('keeps the delete affordance visible on hover and keyboard focus without breaking the rail look', () => {
    expect(sidebarCss).toContain('.project-item-shell');
    expect(sidebarCss).toContain('.project-item:focus-visible');
    expect(sidebarCss).toContain('.project-delete');
    expect(sidebarCss).toContain('.project-item-shell:focus-within .project-delete');
    expect(sidebarCss).toContain('.project-item.active + .project-delete');
  });
});
