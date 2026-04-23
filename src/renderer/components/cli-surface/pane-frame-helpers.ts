import type { SurfaceSelectionRange } from '../../../shared/types/project-surface.js';
import type { CliSurfaceInstance } from './pane-instance.js';

interface CliSurfaceFrameHelperDeps {
  syncViewportLines: (instance: CliSurfaceInstance) => void;
  renderRuntimeMeta: (instance: CliSurfaceInstance) => void;
  setInspectPayloadFromSelection: (
    instance: CliSurfaceInstance,
    selection: SurfaceSelectionRange | null,
  ) => void;
  getRuntimeViewportSelection: (instance: CliSurfaceInstance) => SurfaceSelectionRange | null;
  resizeRuntime: (projectId: string, cols: number, rows: number) => void;
}

export function createCliSurfaceFrameHelpers(deps: CliSurfaceFrameHelperDeps) {
  const scheduleViewportRefresh = (instance: CliSurfaceInstance): void => {
    if (instance.refreshFramePending) return;
    instance.refreshFramePending = true;

    requestAnimationFrame(() => {
      instance.refreshFramePending = false;
      deps.syncViewportLines(instance);
      deps.renderRuntimeMeta(instance);
      if (instance.inspectState.active) {
        deps.setInspectPayloadFromSelection(instance, deps.getRuntimeViewportSelection(instance));
      }
    });
  };

  const scheduleTerminalDataFlush = (instance: CliSurfaceInstance): void => {
    if (instance.dataFramePending) return;
    instance.dataFramePending = true;

    requestAnimationFrame(() => {
      instance.dataFramePending = false;
      const data = instance.pendingDataChunks.join('');
      instance.pendingDataChunks = [];
      if (!data) return;
      instance.terminal.write(data);
      scheduleViewportRefresh(instance);
    });
  };

  const fitSurface = (instance: CliSurfaceInstance): void => {
    requestAnimationFrame(() => {
      instance.fitAddon.fit();
      deps.resizeRuntime(instance.projectId, instance.terminal.cols, instance.terminal.rows);
      scheduleViewportRefresh(instance);
    });
  };

  return {
    scheduleViewportRefresh,
    scheduleTerminalDataFlush,
    fitSurface,
  };
}
