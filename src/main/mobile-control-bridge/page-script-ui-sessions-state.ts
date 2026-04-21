export const MOBILE_PAGE_SCRIPT_UI_SESSIONS_STATE = `      function canSwitchSessions() {
        return Boolean(authenticated && dataChannel && dataChannel.readyState === 'open');
      }

      function updateSessionSwitchUi() {
        const canUse = canSwitchSessions();
        const hasSessions = availableSessions.length > 0;
        const selectedId = String(sessionSelect.value || '');
        sessionSelect.disabled = !canUse || !hasSessions || switchInFlight;
        sessionSwitchButton.disabled = !canUse
          || !hasSessions
          || switchInFlight
          || !selectedId
          || selectedId === activeSessionId;
      }

      function describeSessionSwitchState() {
        if (switchInFlight) {
          sessionSwitchNote.textContent = ui.switchingSession;
          return;
        }
        if (!authenticated) {
          sessionSwitchNote.textContent = ui.sessionRoutingUnavailable;
          return;
        }
        if (availableSessions.length === 0) {
          sessionSwitchNote.textContent = ui.noShareableSessions;
          return;
        }
        const active = availableSessions.find((session) => session.id === activeSessionId);
        if (active) {
          sessionSwitchNote.textContent = formatCopy(ui.activeSessionTemplate, { name: active.name });
        } else {
          sessionSwitchNote.textContent = ui.chooseSessionAndSwitch;
        }
      }

`;
