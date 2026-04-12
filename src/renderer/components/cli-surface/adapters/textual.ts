import type { CliSurfaceAdapter } from './registry.js';

export const textualAdapter: CliSurfaceAdapter = {
  id: 'textual',
  displayName: 'Textual',
  capabilityBadges: ['Widgets', 'Focus path', 'State'],
  detect(input) {
    return input.command === 'python' && (input.args ?? []).includes('textual');
  },
  enrich(meta) {
    const semanticMeta = (meta.semanticMeta ?? {}) as Record<string, unknown>;
    return {
      ...meta,
      framework: 'Textual',
      adapterDisplayName: 'Textual',
      widgetName: meta.semanticLabel ?? semanticMeta.widgetName ?? semanticMeta.widgetType,
      widgetType: semanticMeta.widgetType,
      focusPath: semanticMeta.focusPath,
      stateSummary: semanticMeta.stateSummary,
    };
  },
};
