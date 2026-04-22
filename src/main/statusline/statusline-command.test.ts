import * as path from 'path';
import { homedir } from 'os';
import { describe, expect, it } from 'vitest';

import { isManagedStatusLineCommand } from './statusline-command';

describe('isManagedStatusLineCommand', () => {
  const managedPath = path.join(homedir(), '.calder', 'runtime', 'statusline.sh');

  it('accepts the exact managed command path', () => {
    expect(isManagedStatusLineCommand(managedPath, managedPath)).toBe(true);
  });

  it('accepts the managed command path when quoted', () => {
    expect(isManagedStatusLineCommand(`"${managedPath}"`, managedPath)).toBe(true);
  });

  it('accepts a tilde path when it expands to the managed command path', () => {
    expect(isManagedStatusLineCommand('~/.calder/runtime/statusline.sh', managedPath)).toBe(true);
  });

  it('accepts wrapper-style commands that execute the managed script', () => {
    expect(isManagedStatusLineCommand(`sh -lc '${managedPath}'`, managedPath)).toBe(true);
  });

  it('rejects the managed helper path directly', () => {
    expect(isManagedStatusLineCommand(path.join(homedir(), '.calder', 'runtime', 'statusline.py'), managedPath)).toBe(false);
  });

  it('rejects a foreign command path', () => {
    expect(isManagedStatusLineCommand('/tmp/other/statusline.sh', managedPath)).toBe(false);
  });
});
