import type { MosaicPreset } from '../../shared/types.js';

export function validPresetsForCount(count: number): MosaicPreset[] {
  if (count <= 1) return ['single'];
  if (count === 2) return ['columns-2', 'rows-2'];
  if (count === 3) return ['focus-left', 'focus-top'];
  return ['grid-2x2'];
}

export function defaultPresetForCount(count: number): MosaicPreset {
  return validPresetsForCount(count)[0];
}

export function resolveMosaicPreset(count: number, requested?: MosaicPreset): MosaicPreset {
  const valid = validPresetsForCount(count);
  return requested && valid.includes(requested) ? requested : defaultPresetForCount(count);
}

export function clampRatio(value: number | undefined, min = 0.2, max = 0.8, fallback = 0.5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
