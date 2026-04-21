export const MOBILE_PAGE_SCRIPT_BROWSER_SYNC = `      function syncBrowserSessionOptions() {
        if (!browserSessionSelect) return;
        const priorSelection = String(browserSessionSelect.value || '');
        browserSessionSelect.innerHTML = '';
        if (availableBrowserSessions.length === 0) {
          const emptyOption = document.createElement('option');
          emptyOption.value = '';
          emptyOption.textContent = ui.browserNoSessionsAvailable;
          browserSessionSelect.appendChild(emptyOption);
          browserSessionSelect.value = '';
          updateBrowserControlsUi();
          return;
        }

        for (const session of availableBrowserSessions) {
          const option = document.createElement('option');
          option.value = session.id;
          option.textContent = session.name;
          browserSessionSelect.appendChild(option);
        }

        const hasPriorSelection = availableBrowserSessions.some((entry) => entry.id === priorSelection);
        if (hasPriorSelection) {
          browserSessionSelect.value = priorSelection;
        } else if (availableBrowserSessions.some((entry) => entry.id === activeBrowserSessionId)) {
          browserSessionSelect.value = activeBrowserSessionId;
        } else {
          browserSessionSelect.value = availableBrowserSessions[0].id;
        }
        updateBrowserControlsUi();
      }

      function applyBrowserState(msg) {
        if (!msg || !Array.isArray(msg.sessions)) return;
        availableBrowserSessions = msg.sessions
          .filter((session) =>
            session
            && typeof session.id === 'string'
            && typeof session.name === 'string')
          .map((session) => ({
            id: session.id,
            name: session.name,
            selectedElementSummary: typeof session.selectedElementSummary === 'string'
              ? session.selectedElementSummary
              : '',
          }));
        if (typeof msg.activeBrowserSessionId === 'string') {
          activeBrowserSessionId = msg.activeBrowserSessionId;
        }
        syncBrowserSessionOptions();
      }

      function requestBrowserState() {
        if (!authenticated || !dataChannel || dataChannel.readyState !== 'open') return;
        sendMessage({ type: 'browser-state-request' });
      }

      function requestSessionCatalog() {
        if (!authenticated || !dataChannel || dataChannel.readyState !== 'open') return;
        sendMessage({ type: 'session-catalog-request' });
      }

      function requestLiveSync() {
        requestSessionCatalog();
        requestBrowserState();
      }

      function stopLiveSyncLoop() {
        if (liveSyncTimer) {
          clearInterval(liveSyncTimer);
          liveSyncTimer = null;
        }
      }

      function startLiveSyncLoop() {
        if (liveSyncTimer || !authenticated || !dataChannel || dataChannel.readyState !== 'open') return;
        liveSyncTimer = setInterval(function () {
          requestLiveSync();
        }, 1200);
      }

`;
