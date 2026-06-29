import { getBlockingChecks, getInspectInteractionHint } from './dependency-scoping.js';
import { appendInspectActionControls, appendInspectSendControls, renderInspectWorkbenchHeader } from './inspect-workbench-controls.js';
import { renderInspectPreviewPanel } from './inspect-workbench-preview.js';
import type { RenderMobileInspectWorkbenchOptions } from './inspect-workbench-types.js';
import {
  buildMobileDependencyCheckRow,
  buildMobileInspectBlockingPanel,
  renderInspectCapabilityPanel,
} from './workbench-sections.js';

export function renderMobileInspectWorkbench(options: RenderMobileInspectWorkbenchOptions): HTMLElement {
  const { instance, report, platformLabels, handlers } = options;
  const inspect = instance.inspectState;
  const blockingChecks = getBlockingChecks(report, inspect.platform);
  const section = document.createElement('section');
  section.className = 'mobile-surface-group mobile-surface-inspect-group';
  section.appendChild(renderInspectWorkbenchHeader(options));
  appendInspectActionControls(options, section);

  const status = document.createElement('div');
  status.className = 'mobile-surface-inspect-status';
  status.dataset.tone = inspect.tone;
  status.textContent = inspect.message;
  section.appendChild(status);

  const interactionHint = document.createElement('div');
  interactionHint.className = 'mobile-surface-inspect-hint';
  interactionHint.textContent = getInspectInteractionHint();
  section.appendChild(interactionHint);

  section.appendChild(renderInspectCapabilityPanel(inspect.platform, platformLabels));
  const blockerPanel = buildMobileInspectBlockingPanel({
    checks: blockingChecks,
    renderCheckRow: (check) => buildMobileDependencyCheckRow({
      instance,
      check,
      isInspectBusy: handlers.isInspectBusy,
      setPaneStatus: handlers.setPaneStatus,
      setActionAvailability: handlers.setActionAvailability,
      refreshMobileSurfacePane: handlers.refreshMobileSurfacePane,
    }),
  });
  if (blockerPanel) section.appendChild(blockerPanel);

  section.appendChild(renderInspectPreviewPanel(options));
  appendInspectSendControls(options, section);
  return section;
}
