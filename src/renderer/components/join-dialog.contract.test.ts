import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./join-dialog.ts', import.meta.url), 'utf-8');

describe('join dialog contract', () => {
  it('prompts for a passphrase and keeps legacy PIN compatibility messaging explicit', () => {
    expect(source).toContain('Enter the passphrase from the host');
    expect(source).toContain('Legacy 8-digit PINs are still supported');
    expect(source).toContain('validateJoinPassphrase(');
    expect(source).not.toContain('Enter the PIN from the host');
  });
});
