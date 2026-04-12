import type { CliSurfaceAdapter } from './registry.js';

export const blessedAdapter: CliSurfaceAdapter = {
  id: 'blessed',
  displayName: 'Blessed',
  capabilityBadges: ['Widgets', 'Focus path', 'Events'],
  detect(input) {
    return input.adapterHint === 'blessed' || (input.args ?? []).some((arg) => /blessed/i.test(arg));
  },
  enrich(meta) {
    const semanticMeta = (meta.semanticMeta ?? {}) as Record<string, unknown>;
    return {
      ...meta,
      framework: 'Blessed',
      adapterDisplayName: 'Blessed',
      widgetName: meta.semanticLabel ?? semanticMeta.widgetName ?? semanticMeta.widgetType,
      widgetType: semanticMeta.widgetType,
      focusPath: semanticMeta.focusPath,
      stateSummary: semanticMeta.stateSummary,
    };
  },
};
