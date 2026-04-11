import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import type { MosaicPreset, ProjectRecord } from '../../shared/types.js';
import { resolveCurrentMosaicPreset, resolveNextMosaicPreset } from './mosaic-control-model.js';

const source = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');

function createProject(count: number, mode: ProjectRecord['layout']['mode'] = 'mosaic', preset?: MosaicPreset): ProjectRecord {
  const sessions = Array.from({ length: count }, (_, index) => ({
    id: `session-${index + 1}`,
    name: `Session ${index + 1}`,
    cliSessionId: null,
    createdAt: '2026-04-11T00:00:00.000Z',
  }));

  return {
    id: 'project-1',
    name: 'Project',
    path: '/project',
    sessions,
    activeSessionId: sessions[0]?.id ?? null,
    layout: {
      mode,
      splitPanes: sessions.map((session) => session.id),
      splitDirection: 'horizontal',
      mosaicPreset: preset,
      mosaicRatios: {},
      browserWidthRatio: 0.38,
    },
  };
}

describe('tab bar mosaic control', () => {
  it('cycles between the valid two-session presets', () => {
    const project = createProject(2, 'mosaic', 'columns-2');
    expect(resolveCurrentMosaicPreset(project)).toBe('columns-2');
    expect(resolveNextMosaicPreset(project)).toBe('rows-2');

    project.layout.mosaicPreset = 'rows-2';
    expect(resolveNextMosaicPreset(project)).toBe('columns-2');
  });

  it('cycles between the valid three-session presets', () => {
    const project = createProject(3, 'mosaic', 'focus-left');
    expect(resolveCurrentMosaicPreset(project)).toBe('focus-left');
    expect(resolveNextMosaicPreset(project)).toBe('focus-top');

    project.layout.mosaicPreset = 'focus-top';
    expect(resolveNextMosaicPreset(project)).toBe('focus-left');
  });

  it('keeps preset-aware metadata on the layout button instead of a binary swarm toggle', () => {
    expect(source).toContain('btnToggleSwarm.dataset.preset');
    expect(source).toContain('Choose session layout');
    expect(source).toContain('resolveNextMosaicPreset');
    expect(source).toContain('setMosaicPreset');
    expect(source).not.toContain("btnToggleSwarm.addEventListener('click', () => appState.toggleSwarm())");
  });
});
