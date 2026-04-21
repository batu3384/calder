export const MOBILE_PAGE_SCRIPT_UI_SESSIONS_OPTIONS = `      function syncSessionSelectOptions() {
        const priorSelection = String(sessionSelect.value || '');
        sessionSelect.innerHTML = '';
        if (availableSessions.length === 0) {
          const emptyOption = document.createElement('option');
          emptyOption.value = '';
          emptyOption.textContent = ui.noSessionsAvailable;
          sessionSelect.appendChild(emptyOption);
          sessionSelect.value = '';
          updateSessionSwitchUi();
          describeSessionSwitchState();
          return;
        }

        for (const session of availableSessions) {
          const option = document.createElement('option');
          option.value = session.id;
          option.textContent = session.name;
          sessionSelect.appendChild(option);
        }

        const hasPriorSelection = availableSessions.some((session) => session.id === priorSelection);
        if (hasPriorSelection) {
          sessionSelect.value = priorSelection;
        } else if (availableSessions.some((session) => session.id === activeSessionId)) {
          sessionSelect.value = activeSessionId;
        } else {
          sessionSelect.value = availableSessions[0].id;
        }

        updateSessionSwitchUi();
        describeSessionSwitchState();
      }

      function applySessionCatalog(msg) {
        if (!msg || !Array.isArray(msg.sessions)) return;
        availableSessions = msg.sessions
          .filter((session) => session && typeof session.id === 'string' && typeof session.name === 'string')
          .map((session) => ({ id: session.id, name: session.name }));
        if (typeof msg.activeSessionId === 'string') {
          activeSessionId = msg.activeSessionId;
        }
        syncSessionSelectOptions();
      }

`;
