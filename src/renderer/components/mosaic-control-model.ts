import type { MosaicPreset, ProjectRecord, SessionRecord } from '../../shared/types.js';
import { resolveMosaicPreset, validPresetsForCount } from './mosaic-layout-model.js';

function isCliSession(session: SessionRecord): boolean {
  return !session.type || session.type === 'claude';
}

function getVisibleCliSessionCount(project: ProjectRecord): number {
  const visibleIds = new Set(project.layout.splitPanes);
  const visibleCount = project.sessions.filter((session) => visibleIds.has(session.id) && isCliSession(session)).length;
  if (visibleCount > 0) return visibleCount;
  return project.sessions.filter(isCliSession).length;
}

export function resolveCurrentMosaicPreset(project: ProjectRecord): MosaicPreset {
  return resolveMosaicPreset(getVisibleCliSessionCount(project), project.layout.mosaicPreset);
}

export function resolveNextMosaicPreset(project: ProjectRecord): MosaicPreset {
  const count = getVisibleCliSessionCount(project);
  const validPresets = validPresetsForCount(count);
  const currentPreset = resolveCurrentMosaicPreset(project);
  const currentIndex = validPresets.indexOf(currentPreset);
  return validPresets[(currentIndex + 1) % validPresets.length] ?? currentPreset;
}

export function formatMosaicPresetLabel(preset: MosaicPreset): string {
  switch (preset) {
    case 'single':
      return 'Single';
    case 'columns-2':
      return 'Columns';
    case 'rows-2':
      return 'Rows';
    case 'focus-left':
      return 'Focus Left';
    case 'focus-top':
      return 'Focus Top';
    case 'grid-2x2':
      return 'Grid';
    default:
      return 'Layout';
  }
}

export function compactMosaicPresetLabel(preset: MosaicPreset): string {
  switch (preset) {
    case 'single':
      return '1';
    case 'columns-2':
      return '2C';
    case 'rows-2':
      return '2R';
    case 'focus-left':
      return '3L';
    case 'focus-top':
      return '3T';
    case 'grid-2x2':
      return '4';
    default:
      return '';
  }
}
