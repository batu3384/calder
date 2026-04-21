export const MOBILE_PAGE_SCRIPT_RUNTIME_CHANNEL_SESSION = `      function requestSessionSwitch() {
        if (!canSwitchSessions()) return;
        const targetSessionId = String(sessionSelect.value || '');
        if (!targetSessionId || targetSessionId === activeSessionId) {
          updateSessionSwitchUi();
          return;
        }
        switchInFlight = true;
        updateSessionSwitchUi();
        describeSessionSwitchState();
        sendMessage({ type: 'session-switch', sessionId: targetSessionId });
      }

`;
