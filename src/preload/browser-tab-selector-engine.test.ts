import { describe, expect, it } from 'vitest';

import {
  isStableClassName,
} from './browser-tab-selector-engine';

describe('browser tab selector engine', () => {
  it('filters hashed css-module class names', () => {
    expect(isStableClassName('primary-button')).toBe(true);
    expect(isStableClassName('Button_root__x7f3a2')).toBe(false);
    expect(isStableClassName('a1b2c3d4e5f6')).toBe(false);
    expect(isStableClassName('sc-abc')).toBe(false);
    expect(isStableClassName('css-abcdef1')).toBe(false);
  });
});
