import type { MobileDependencyReport } from '../../../shared/types/mobile.js';
import {
  getProfileScopedChecks,
  getProjectProfileLabel,
  getScopedSummary,
  hasBlockingChecks,
} from './dependency-scoping.js';
import {
  appendMobileDependencyChecklistSection,
  buildMobileDependencyCheckRow,
  renderMobileScopedSummaryPanel,
} from './workbench-sections.js';
import type { MobileSurfacePaneInstance } from './types.js';

type StatusTone = 'default' | 'success' | 'error';

interface RenderMobileSurfaceReportOptions {
  instance: MobileSurfacePaneInstance;
  report: MobileDependencyReport;
  renderInspectWorkbench(instance: MobileSurfacePaneInstance, report: MobileDependencyReport): HTMLElement;
  stopInspectLiveMode(instance: MobileSurfacePaneInstance, statusMessage?: string, tone?: StatusTone): void;
  isInspectBusy(instance: MobileSurfacePaneInstance): boolean;
  setPaneStatus(instance: MobileSurfacePaneInstance, text: string, tone?: StatusTone): void;
  setActionAvailability(instance: MobileSurfacePaneInstance): void;
  refreshMobileSurfacePane(projectId: string, force?: boolean): Promise<void>;
}

export function renderMobileSurfaceReport(options: RenderMobileSurfaceReportOptions): void {
  const {
    instance,
    report,
    renderInspectWorkbench,
    stopInspectLiveMode,
    isInspectBusy,
    setPaneStatus,
    setActionAvailability,
    refreshMobileSurfacePane,
  } = options;

  instance.lastReport = report;
  if (instance.inspectState.liveMode && hasBlockingChecks(report, instance.inspectState.platform)) {
    stopInspectLiveMode(instance, 'Live view paused until required dependencies are ready.', 'error');
  }
  instance.summaryEl.innerHTML = '';
  instance.bodyEl.innerHTML = '';
  const scopedSummary = getScopedSummary(report, instance.projectProfile);
  instance.summaryEl.appendChild(renderMobileScopedSummaryPanel({
    scopeLabel: getProjectProfileLabel(instance.projectProfile).replace('Project profile: ', ''),
    summary: scopedSummary,
  }));

  instance.bodyEl.appendChild(renderInspectWorkbench(instance, report));
  appendMobileDependencyChecklistSection({
    container: instance.bodyEl,
    checks: getProfileScopedChecks(report, instance.projectProfile),
    renderCheckRow: (check) => buildMobileDependencyCheckRow({
      instance,
      check,
      isInspectBusy,
      setPaneStatus,
      setActionAvailability,
      refreshMobileSurfacePane,
    }),
  });
  setActionAvailability(instance);
}
