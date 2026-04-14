import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');
const tabBarSource = readFileSync(new URL('../components/tab-bar.ts', import.meta.url), 'utf-8');

describe('command deck stylesheet contract', () => {
  it('renders status and launcher controls as lighter inline instrument pills', () => {
    expect(tabsCss).toContain('.command-deck-status');
    expect(tabsCss).not.toContain('#workspace-spend');
    expect(tabsCss).toContain('#git-status');
    expect(tabsCss).toContain('.session-launcher-group');
    expect(tabsCss).toContain('border-radius: 999px;');
    expect(tabsCss).toContain('background: color-mix(in srgb, var(--surface-panel) 52%, transparent);');
  });

  it('keeps launcher and provider selection in the same compact rhythm', () => {
    expect(tabsCss).toContain('.command-deck-provider-select .custom-select-trigger');
    expect(tabsCss).toContain('min-height: 30px;');
    expect(tabsCss).toContain('padding: 3px 4px;');
    expect(tabsCss).toContain('.tab-action-primary');
  });

  it('treats the launcher cluster like a polished shell instead of a loose icon row', () => {
    expect(tabsCss).toContain('.session-launcher-group');
    expect(tabsCss).toContain('box-shadow:');
    expect(tabsCss).toContain('0 8px 22px rgba(0, 0, 0, 0.08);');
    expect(tabsCss).toContain('.session-launcher-group:hover');
    expect(tabsCss).toContain('background: color-mix(in srgb, var(--surface-panel) 60%, transparent);');
  });

  it('keeps the launcher controls on the top row until the workspace is genuinely narrow', () => {
    expect(tabsCss).toMatch(/@container workspace-stack \(max-width: 980px\)\s*\{\s*#tab-bar\s*\{[\s\S]*grid-template-areas:\s*"main actions"\s*"meta actions";/m);
    expect(tabsCss).toMatch(/@container workspace-stack \(max-width: 820px\)\s*\{\s*#tab-bar\s*\{[\s\S]*grid-template-areas:\s*"main"\s*"meta"\s*"actions";/m);
    expect(tabsCss).toContain(".session-launcher-group[data-select-open='true']");
  });

  it('uses operational project metadata instead of live archived jargon', () => {
    expect(tabBarSource).not.toContain('renderWorkspaceIdentity');
    expect(tabBarSource).not.toContain('Cost');
    expect(tabBarSource).not.toContain('logged');
    expect(tabBarSource).not.toContain('archived');
    expect(tabsCss).not.toContain('.workspace-project-name');
  });
});
