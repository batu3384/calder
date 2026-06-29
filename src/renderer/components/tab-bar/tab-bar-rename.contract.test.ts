import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const renameControllerSource = readFileSync(new URL('./tab-bar-rename-controller.ts', import.meta.url), 'utf-8');

describe('tab bar rename contract', () => {
  it('routes tab rename behavior through dedicated rename controller module', () => {
    expect(tabBarSource).toContain("from './tab-bar-rename-controller.js'");
    expect(tabBarSource).toContain('startInlineTabRename({');
  });

  it('keeps Enter/Escape/blur rename semantics in rename controller', () => {
    expect(renameControllerSource).toContain("event.key === 'Enter'");
    expect(renameControllerSource).toContain("event.key === 'Escape'");
    expect(renameControllerSource).toContain("input.addEventListener('blur', commit)");
    expect(renameControllerSource).toContain('onCommit(newName);');
    expect(renameControllerSource).toContain('onCancel();');
  });
});
