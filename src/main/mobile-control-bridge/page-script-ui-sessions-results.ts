export const MOBILE_PAGE_SCRIPT_UI_SESSIONS_RESULTS = `      function applySessionSwitchResult(msg) {
        switchInFlight = false;
        if (!msg || !msg.ok) {
          setStatus(formatCopy(ui.switchFailedTemplate, { reason: (msg && msg.reason) || ui.unknownReason }), 'error');
          updateSessionSwitchUi();
          describeSessionSwitchState();
          return;
        }

        if (typeof msg.sessionId === 'string' && msg.sessionId.length > 0) {
          activeSessionId = msg.sessionId;
        }
        if (typeof msg.scrollback === 'string') {
          replaceTerminal(msg.scrollback);
        }
        if (activeSessionId) {
          sessionSelect.value = activeSessionId;
        }

        const switchedName = typeof msg.sessionName === 'string' && msg.sessionName.length > 0
          ? msg.sessionName
          : activeSessionId;
        setStatus(formatCopy(ui.switchedToTemplate, { name: switchedName }), 'ok');
        updateSessionSwitchUi();
        describeSessionSwitchState();
      }

`;
