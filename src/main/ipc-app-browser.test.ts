import { describe, expect, it } from 'vitest';

import { isAllowedGuestMessagePayload } from './ipc-app-browser';

describe('ipc app/browser guest payload guard', () => {
  it('accepts no-arg channels only when arguments are empty', () => {
    expect(isAllowedGuestMessagePayload('enter-inspect-mode', [])).toBe(true);
    expect(isAllowedGuestMessagePayload('draw-clear', [])).toBe(true);
    expect(isAllowedGuestMessagePayload('enter-inspect-mode', [{ bad: true }])).toBe(false);
  });

  it('validates bounded auth-fill payloads', () => {
    expect(
      isAllowedGuestMessagePayload('auth-fill-credentials', [
        {
          username: 'demo@example.com',
          password: 'secret',
        },
      ]),
    ).toBe(true);
    expect(
      isAllowedGuestMessagePayload('auth-fill-credentials', [
        {
          username: 123,
          password: 'secret',
        },
      ]),
    ).toBe(false);
  });

  it('rejects oversized flow click payloads', () => {
    const hugePayload = { selector: `#${'a'.repeat(1_500_000)}` };
    expect(isAllowedGuestMessagePayload('flow-do-click', [hugePayload])).toBe(false);
  });

  it('accepts valid flow click payload shapes and rejects invalid shapes', () => {
    expect(isAllowedGuestMessagePayload('flow-do-click', [{ selector: '#cta' }])).toBe(true);
    expect(isAllowedGuestMessagePayload('flow-do-click', ['#cta'])).toBe(true);
    expect(isAllowedGuestMessagePayload('flow-do-click', [['#cta', '#submit']])).toBe(true);
    expect(isAllowedGuestMessagePayload('flow-do-click', [123])).toBe(false);
    expect(
      isAllowedGuestMessagePayload('flow-do-click', [{ selector: '#cta' }, { extra: true }]),
    ).toBe(false);
  });

  it('rejects unknown channels and non-serializable payloads', () => {
    expect(isAllowedGuestMessagePayload('unknown-channel', [])).toBe(false);
    expect(isAllowedGuestMessagePayload('flow-do-click', [1n as unknown as never])).toBe(false);
  });
});
