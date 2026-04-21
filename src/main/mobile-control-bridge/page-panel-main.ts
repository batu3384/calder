import type { MobilePageCopy } from './copy';
import { renderBrowserView } from './page-view-browser';
import { renderControlsView } from './page-view-controls';
import { renderTerminalView } from './page-view-terminal';

export function renderMainPanel(copy: MobilePageCopy): string {
  return `<section class="panel">
      <div class="status-grid">
        <div class="row">
          <span id="modeBadge" class="badge">${copy.modePending}</span>
          <span id="connBadge" class="badge">${copy.stateIdle}</span>
        </div>
        <div class="stage-rail" aria-label="${copy.connectionFlowLabel}">
          <span class="stage-chip active" data-mobile-stage-chip data-stage="verify">${copy.stageVerify}</span>
          <span class="stage-chip" data-mobile-stage-chip data-stage="stream">${copy.stageStream}</span>
          <span class="stage-chip" data-mobile-stage-chip data-stage="controls">${copy.stageControl}</span>
        </div>
        <div class="session-switch-row">
          <select id="sessionSelect" class="session-select" data-mobile-session-select aria-label="${copy.sessionSelectorLabel}" disabled>
            <option value="">${copy.waitingForSessions}</option>
          </select>
          <button id="sessionSwitchButton" type="button" class="btn secondary" data-mobile-session-switch disabled>${copy.switchButton}</button>
        </div>
        <div id="sessionSwitchNote" class="session-switch-note">${copy.sessionRoutingUnavailable}</div>
      </div>
      <div class="mobile-view-tabs" role="tablist" aria-label="${copy.mobileViewsLabel}">
        <button type="button" class="mobile-view-tab active" data-mobile-view-tab="terminal" aria-selected="true">${copy.terminalTab}</button>
        <button type="button" class="mobile-view-tab" data-mobile-view-tab="browser" aria-selected="false" disabled>${copy.browserTab}</button>
        <button type="button" class="mobile-view-tab" data-mobile-view-tab="controls" aria-selected="false" disabled>${copy.controlsTab}</button>
      </div>
      ${renderTerminalView(copy)}
      ${renderBrowserView(copy)}
      ${renderControlsView(copy)}
    </section>`;
}
