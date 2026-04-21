export const MOBILE_PAGE_SCRIPT_BROWSER_UI = `      function canUseBrowserControls() {
        return canSendInteractiveInput();
      }

      function resolveActiveBrowserSession() {
        if (availableBrowserSessions.length === 0) return null;
        const selectedId = browserSessionSelect
          ? String(browserSessionSelect.value || '').trim()
          : '';
        if (selectedId) {
          const selected = availableBrowserSessions.find((entry) => entry.id === selectedId);
          if (selected) return selected;
        }
        if (activeBrowserSessionId) {
          const active = availableBrowserSessions.find((entry) => entry.id === activeBrowserSessionId);
          if (active) return active;
        }
        return availableBrowserSessions[0] || null;
      }

      function setBrowserControlStatus(message) {
        if (!browserControlStatus) return;
        browserControlStatus.textContent = message;
      }

      function renderBrowserInspectSelection() {
        if (!browserInspectSelection) return;
        const active = resolveActiveBrowserSession();
        const rawSummary = active && typeof active.selectedElementSummary === 'string'
          ? active.selectedElementSummary.trim()
          : '';
        if (rawSummary) {
          browserInspectSelection.textContent = formatCopy(ui.browserInspectSelectionTemplate, { summary: rawSummary });
          browserInspectSelection.setAttribute('data-mobile-inspect-selection-raw', rawSummary);
          return;
        }
        browserInspectSelection.textContent = ui.browserInspectSelectionNone;
        browserInspectSelection.setAttribute('data-mobile-inspect-selection-raw', '');
      }

      function updateBrowserControlsUi() {
        const interactive = canUseBrowserControls();
        if (browserControls) {
          browserControls.classList.toggle('visible', interactive);
        }
        if (!browserSessionSelect) return;

        const hasSessions = availableBrowserSessions.length > 0;
        browserSessionSelect.disabled = !interactive || !hasSessions || browserControlInFlight || browserInspectInFlight;

        const controlButtons = document.querySelectorAll('[data-mobile-browser-control], [data-mobile-browser-viewport]');
        for (const button of controlButtons) {
          button.disabled = !interactive || !hasSessions || browserControlInFlight || browserInspectInFlight;
        }

        const active = resolveActiveBrowserSession();
        const hasInspectSelection = Boolean(
          active
          && typeof active.selectedElementSummary === 'string'
          && active.selectedElementSummary.trim().length > 0,
        );
        renderBrowserInspectSelection();

        if (browserInspectInput instanceof HTMLInputElement) {
          browserInspectInput.disabled = !interactive || !hasSessions || browserControlInFlight || browserInspectInFlight;
        }
        if (browserInspectSendButton instanceof HTMLButtonElement) {
          browserInspectSendButton.disabled = !interactive
            || !hasSessions
            || !hasInspectSelection
            || browserControlInFlight
            || browserInspectInFlight;
        }

        if (browserControlInFlight || browserInspectInFlight) {
          return;
        }

        if (!interactive) {
          setBrowserControlStatus(ui.browserStatusReadonly);
        } else if (!hasSessions) {
          setBrowserControlStatus(ui.browserNoSessionsAvailable);
        } else {
          const activeName = active ? active.name : availableBrowserSessions[0].name;
          setBrowserControlStatus(formatCopy(ui.browserStatusReadyTemplate, { name: activeName }));
        }
      }

`;
