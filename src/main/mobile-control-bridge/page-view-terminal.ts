import type { MobilePageCopy } from './copy';

export function renderTerminalView(copy: MobilePageCopy): string {
  return `<div id="terminalView" class="mobile-view-pane active" data-mobile-view="terminal">
        <div class="terminal-toolbar">
          <button id="terminalClearButton" type="button" class="btn ghost slim" data-mobile-terminal-clear>${copy.clearButton}</button>
          <button id="terminalCopyButton" type="button" class="btn ghost slim" data-mobile-terminal-copy>${copy.copyButton}</button>
          <button id="terminalFollowButton" type="button" class="btn ghost slim active" data-mobile-terminal-follow>${copy.followOnButton}</button>
        </div>
        <pre id="terminal" class="terminal" aria-live="polite"></pre>
      </div>`;
}
