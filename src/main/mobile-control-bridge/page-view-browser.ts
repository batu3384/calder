import type { MobilePageCopy } from './copy';

export function renderBrowserView(copy: MobilePageCopy): string {
  return `<div id="browserView" class="mobile-view-pane" data-mobile-view="browser">
        <div class="control-head">
          <div class="control-title">${copy.browserControlDeckTitle}</div>
        </div>
        <div id="browserControls" class="browser-controls" aria-label="${copy.browserControlDeckTitle}">
          <div class="session-switch-row browser-session-row">
            <select id="browserSessionSelect" class="session-select" data-mobile-browser-session-select aria-label="${copy.browserSessionSelectorLabel}" disabled>
              <option value="">${copy.browserNoSessionsAvailable}</option>
            </select>
          </div>
          <div class="quick-controls-grid browser-controls-grid">
            <button type="button" class="btn secondary" data-mobile-browser-control data-browser-control="back">${copy.browserBackButton}</button>
            <button type="button" class="btn secondary" data-mobile-browser-control data-browser-control="forward">${copy.browserForwardButton}</button>
            <button type="button" class="btn secondary" data-mobile-browser-control data-browser-control="reload">${copy.browserReloadButton}</button>
            <button type="button" class="btn secondary" data-mobile-browser-control data-browser-control="toggle-inspect">${copy.browserInspectButton}</button>
            <button type="button" class="btn secondary" data-mobile-browser-viewport data-browser-viewport="Responsive">${copy.browserResponsiveButton}</button>
            <button type="button" class="btn secondary" data-mobile-browser-viewport data-browser-viewport="iPhone 14">${copy.browserPhoneButton}</button>
          </div>
          <div id="browserInspectSelection" class="browser-inspect-selection" data-mobile-inspect-selection data-mobile-inspect-selection-raw="">${copy.browserInspectSelectionNone}</div>
          <form id="browserInspectComposer" class="browser-inspect-composer" autocomplete="off">
            <input id="browserInspectInput" type="text" placeholder="${copy.browserInspectInputPlaceholder}" data-mobile-browser-inspect-input />
            <button id="browserInspectSendButton" type="submit" class="btn secondary" data-mobile-browser-inspect-send>${copy.browserInspectSendButton}</button>
          </form>
          <div id="browserControlStatus" class="session-switch-note browser-control-status" data-mobile-browser-status>${copy.browserStatusWaiting}</div>
        </div>
      </div>`;
}
