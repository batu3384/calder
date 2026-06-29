import { describe, expect, it } from 'vitest';

import {
  extractAppiumErrorMessage,
  extractAppiumSessionId,
  parseJson,
} from './mobile-inspector-helpers';

describe('mobile-inspector helper parsing utilities', () => {
  it('returns parsed json object and null for invalid payloads', () => {
    expect(parseJson('{"ok":true}')).toEqual({ ok: true });
    expect(parseJson('not-json')).toBeNull();
  });

  it('extracts appium error message from preferred fields', () => {
    expect(extractAppiumErrorMessage({
      value: { message: '  Session failed  ' },
      message: 'fallback',
    })).toBe('Session failed');

    expect(extractAppiumErrorMessage({
      value: { error: 'secondary error' },
    })).toBe('secondary error');

    expect(extractAppiumErrorMessage({})).toBeNull();
    expect(extractAppiumErrorMessage(null)).toBeNull();
  });

  it('extracts appium session id from root or nested value payload', () => {
    expect(extractAppiumSessionId({ sessionId: 'root-session' })).toBe('root-session');
    expect(extractAppiumSessionId({ value: { sessionId: 'nested-session' } })).toBe('nested-session');
    expect(extractAppiumSessionId({ value: {} })).toBeNull();
    expect(extractAppiumSessionId(undefined)).toBeNull();
  });
});
