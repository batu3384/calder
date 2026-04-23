import type { ProjectRecord } from '../state.js';

const INSPECTOR_WIDTH_FALLBACK = 350;

const lastSwarmBrowserSessionIds = new Map<string, string>();
let mosaicResizeCleanups: Array<() => void> = [];

export function getSwarmBrowserSession(project: ProjectRecord) {
  const activeSession = project.activeSessionId
    ? project.sessions.find((session) => session.id === project.activeSessionId)
    : undefined;
  if (activeSession?.type === 'browser-tab') {
    lastSwarmBrowserSessionIds.set(project.id, activeSession.id);
    return activeSession;
  }

  const rememberedId = lastSwarmBrowserSessionIds.get(project.id);
  if (rememberedId) {
    const remembered = project.sessions.find((session) => session.id === rememberedId && session.type === 'browser-tab');
    if (remembered) return remembered;
  }

  const latest = [...project.sessions].reverse().find((session) => session.type === 'browser-tab');
  if (latest) {
    lastSwarmBrowserSessionIds.set(project.id, latest.id);
  } else {
    lastSwarmBrowserSessionIds.delete(project.id);
  }
  return latest;
}

export function clearMosaicResizeBindings(): void {
  for (const cleanup of mosaicResizeCleanups) {
    cleanup();
  }
  mosaicResizeCleanups = [];
}

export function registerMosaicResizeCleanup(cleanup: () => void): void {
  mosaicResizeCleanups.push(cleanup);
}

function readInspectorWidth(target: HTMLElement): number {
  const inlineStyle = target.style as CSSStyleDeclaration & Record<string, string | undefined>;
  const inlineWidthValue = typeof inlineStyle.getPropertyValue === 'function'
    ? target.style.getPropertyValue('--inspector-width')
    : inlineStyle.getPropertyValue?.('--inspector-width') ?? inlineStyle['--inspector-width'];
  const inlineWidth = Number.parseFloat(inlineWidthValue ?? '');
  if (Number.isFinite(inlineWidth) && inlineWidth > 0) return inlineWidth;

  const inspector = target.querySelector('#session-inspector') as HTMLElement | null;
  const inspectorWidth = inspector?.getBoundingClientRect().width ?? 0;
  if (inspectorWidth > 0) return inspectorWidth;

  return INSPECTOR_WIDTH_FALLBACK;
}

export function getSurfaceResizeBounds(target: HTMLElement, hasInspector: boolean): DOMRect {
  const bounds = target.getBoundingClientRect();
  if (!hasInspector) return bounds;

  const inspectorWidth = Math.min(readInspectorWidth(target), bounds.width);
  const width = Math.max(0, bounds.width - inspectorWidth);
  return {
    ...bounds,
    width,
    right: bounds.left + width,
    x: bounds.left,
    y: bounds.top,
  } as DOMRect;
}
