import type { MobilePageCopy } from './copy';

export function renderControlsView(copy: MobilePageCopy): string {
  return `<div id="controlsView" class="mobile-view-pane" data-mobile-view="controls">
        <div class="control-head">
          <div class="control-title">${copy.commandDeck}</div>
          <div id="shortcutToggleRow" class="shortcut-toggle-row">
            <button id="shortcutToggleButton" type="button" class="btn ghost slim" data-mobile-shortcut-toggle disabled aria-expanded="false">${copy.showShortcutsButton}</button>
          </div>
          <div id="shortcutHint" class="shortcut-hint">${copy.shortcutsHiddenUntilNeeded}</div>
        </div>
        <form id="composer" class="composer" autocomplete="off">
          <button id="historyPrevButton" class="btn secondary slim" type="button" data-mobile-history-prev>${copy.prevButton}</button>
          <input id="commandInput" placeholder="${copy.commandInputPlaceholder}" />
          <button id="historyNextButton" class="btn secondary slim" type="button" data-mobile-history-next>${copy.nextButton}</button>
          <button id="send" class="btn secondary" type="submit">${copy.sendButton}</button>
        </form>
        <div id="commandChipList" class="command-chip-list" aria-label="${copy.suggestedCommandsLabel}">
          <button type="button" class="btn ghost slim command-chip" data-command-chip="pwd" data-mobile-command-chip>pwd</button>
          <button type="button" class="btn ghost slim command-chip" data-command-chip="ls -la" data-mobile-command-chip>ls -la</button>
          <button type="button" class="btn ghost slim command-chip" data-command-chip="git status" data-mobile-command-chip>git status</button>
          <button type="button" class="btn ghost slim command-chip" data-command-chip="npm test" data-mobile-command-chip>npm test</button>
        </div>
        <div id="quickControls" class="quick-controls" aria-label="${copy.quickControlsLabel}">
          <div class="quick-controls-title">${copy.quickControlsTitle}</div>
          <div class="quick-controls-grid">
            <button type="button" class="btn secondary" data-control="ctrl-c">Ctrl+C</button>
            <button type="button" class="btn secondary" data-control="ctrl-l">Ctrl+L</button>
            <button type="button" class="btn secondary" data-control="ctrl-d">Ctrl+D</button>
            <button type="button" class="btn secondary" data-control="tab">Tab</button>
            <button type="button" class="btn secondary" data-control="esc">Esc</button>
            <button type="button" class="btn secondary" data-control="backspace" data-repeatable="true">⌫</button>
            <button type="button" class="btn secondary" data-control="enter">Enter</button>
            <button type="button" class="btn secondary" data-control="up" data-repeatable="true">↑</button>
            <button type="button" class="btn secondary" data-control="left" data-repeatable="true">←</button>
            <button type="button" class="btn secondary" data-control="down" data-repeatable="true">↓</button>
            <button type="button" class="btn secondary" data-control="right" data-repeatable="true">→</button>
          </div>
        </div>
      </div>`;
}
