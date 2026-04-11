import { describe, expect, it } from 'vitest';

import { clampRatio, defaultPresetForCount, resolveMosaicPreset, validPresetsForCount } from './mosaic-layout-model.js';

describe('mosaic-layout-model', () => {
  it('returns the default preset for each supported session count', () => {
    expect(defaultPresetForCount(1)).toBe('single');
    expect(defaultPresetForCount(2)).toBe('columns-2');
    expect(defaultPresetForCount(3)).toBe('focus-left');
    expect(defaultPresetForCount(4)).toBe('grid-2x2');
    expect(defaultPresetForCount(7)).toBe('grid-2x2');
  });

  it('lists the valid presets for each supported session count', () => {
    expect(validPresetsForCount(1)).toEqual(['single']);
    expect(validPresetsForCount(2)).toEqual(['columns-2', 'rows-2']);
    expect(validPresetsForCount(3)).toEqual(['focus-left', 'focus-top']);
    expect(validPresetsForCount(4)).toEqual(['grid-2x2']);
  });

  it('clamps invalid preset requests back to the current count default', () => {
    expect(resolveMosaicPreset(2, 'focus-left')).toBe('columns-2');
    expect(resolveMosaicPreset(3, 'rows-2')).toBe('focus-left');
    expect(resolveMosaicPreset(4, 'columns-2')).toBe('grid-2x2');
  });

  it('keeps a valid requested preset', () => {
    expect(resolveMosaicPreset(2, 'rows-2')).toBe('rows-2');
    expect(resolveMosaicPreset(3, 'focus-top')).toBe('focus-top');
  });

  it('clamps ratios into a safe range', () => {
    expect(clampRatio(undefined, 0.2, 0.8, 0.5)).toBe(0.5);
    expect(clampRatio(0.05, 0.2, 0.8, 0.5)).toBe(0.2);
    expect(clampRatio(0.95, 0.2, 0.8, 0.5)).toBe(0.8);
    expect(clampRatio(0.44, 0.2, 0.8, 0.5)).toBe(0.44);
  });
});
