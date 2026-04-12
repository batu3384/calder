import type { CliSurfaceAdapter } from './registry.js';

export const inkAdapter: CliSurfaceAdapter = {
  id: 'ink',
  displayName: 'Ink',
  capabilityBadges: ['Components', 'Focus path', 'Props'],
  detect(input) {
    return /ink/i.test(input.title ?? '') || (input.args ?? []).some((arg) => /ink/i.test(arg));
  },
  enrich(meta) {
    const semanticMeta = (meta.semanticMeta ?? {}) as Record<string, unknown>;
    return {
      ...meta,
      framework: 'Ink',
      adapterDisplayName: 'Ink',
      widgetName: semanticMeta.componentName ?? meta.semanticLabel,
      widgetType: semanticMeta.componentType ?? 'component',
      focusPath: semanticMeta.focusPath,
      stateSummary: semanticMeta.stateSummary ?? semanticMeta.propsSummary,
    };
  },
};
