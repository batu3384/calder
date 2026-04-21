export const MOBILE_PAGE_SCRIPT_BROWSER_ACTIONS = `      function sendBrowserControl(action, extra) {
        if (!canUseBrowserControls()) {
          updateBrowserControlsUi();
          return;
        }
        if (!browserSessionSelect) return;
        const selectedSessionId = String(browserSessionSelect.value || '').trim();
        if (!selectedSessionId) {
          setBrowserControlStatus(ui.browserNoSessionsAvailable);
          return;
        }
        browserControlInFlight = true;
        updateBrowserControlsUi();
        setBrowserControlStatus(ui.browserControlApplying);
        const payload = Object.assign(
          {
            type: 'browser-control',
            action,
            sessionId: selectedSessionId,
          },
          extra || {},
        );
        sendMessage(payload);
      }

      function sendBrowserInspectInstruction() {
        if (!canUseBrowserControls()) {
          updateBrowserControlsUi();
          return;
        }
        if (!(browserSessionSelect instanceof HTMLSelectElement) || !(browserInspectInput instanceof HTMLInputElement)) {
          return;
        }
        const selectedSessionId = String(browserSessionSelect.value || '').trim();
        if (!selectedSessionId) {
          setBrowserControlStatus(ui.browserNoSessionsAvailable);
          return;
        }
        const instruction = browserInspectInput.value.trim();
        if (!instruction) {
          setBrowserControlStatus(ui.browserInspectInstructionRequired);
          return;
        }
        const selected = availableBrowserSessions.find((entry) => entry.id === selectedSessionId);
        const hasSelection = Boolean(
          selected
          && typeof selected.selectedElementSummary === 'string'
          && selected.selectedElementSummary.trim().length > 0,
        );
        if (!hasSelection) {
          setBrowserControlStatus(ui.browserInspectNeedSelection);
          return;
        }
        browserInspectInFlight = true;
        updateBrowserControlsUi();
        setBrowserControlStatus(ui.browserInspectSubmitting);
        sendMessage({
          type: 'browser-inspect-submit',
          sessionId: selectedSessionId,
          instruction,
        });
      }

      function applyBrowserControlResult(msg) {
        browserControlInFlight = false;
        updateBrowserControlsUi();
        if (!msg || !msg.ok) {
          setBrowserControlStatus(formatCopy(ui.browserControlFailedTemplate, { reason: (msg && msg.reason) || ui.unknownReason }));
          return;
        }
        const actionLabel = typeof msg.action === 'string' ? msg.action : 'ok';
        setBrowserControlStatus(formatCopy(ui.browserControlSucceededTemplate, { action: actionLabel }));
        requestBrowserState();
      }

      function applyBrowserInspectResult(msg) {
        browserInspectInFlight = false;
        updateBrowserControlsUi();
        if (!msg || !msg.ok) {
          setBrowserControlStatus(formatCopy(ui.browserInspectFailedTemplate, { reason: (msg && msg.reason) || ui.unknownReason }));
          return;
        }
        if (browserInspectInput instanceof HTMLInputElement) {
          browserInspectInput.value = '';
        }
        setBrowserControlStatus(ui.browserInspectSucceeded);
        requestBrowserState();
      }

`;
