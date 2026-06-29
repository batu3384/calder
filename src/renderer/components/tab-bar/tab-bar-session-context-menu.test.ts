import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const sessionContextMenuSource = readFileSync(
  new URL('./tab-bar-session-context-menu.ts', import.meta.url),
  'utf-8',
);

describe('tab bar session context menu extraction', () => {
  it('delegates session tab context menu rendering from tab bar', () => {
    expect(tabBarSource).toContain("from './tab-bar-session-context-menu.js'");
    expect(tabBarSource).toContain('showSessionTabContextMenu({');
  });

  it('keeps session actions and sharing entries in dedicated context menu helper', () => {
    expect(sessionContextMenuSource).toContain(
      "menu.className = 'tab-context-menu calder-floating-list'",
    );
    expect(sessionContextMenuSource).toContain("mobileShareItem.textContent = 'Mobile Control…'");
    expect(sessionContextMenuSource).toContain(
      "shareItem.textContent = currentlySharing ? 'Manage Sharing…' : 'Share Session…'",
    );
    expect(sessionContextMenuSource).toContain('buildResumeWithProviderItems(');
    expect(sessionContextMenuSource).toContain(
      "applyContextMenuSemantics(menu, 'Session actions')",
    );
  });
});
