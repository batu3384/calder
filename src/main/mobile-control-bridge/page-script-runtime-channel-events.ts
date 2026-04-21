export const MOBILE_PAGE_SCRIPT_RUNTIME_CHANNEL_EVENTS = `      async function attachDataChannel(channel) {
        dataChannel = channel;
        channel.onopen = function () {
          setConnState('channel-open');
          setStatus(ui.channelOpenWaitingAuth);
        };
        channel.onclose = function () {
          setConnState('closed');
          setStatus(ui.connectionClosed, 'error');
          stopLiveSyncLoop();
          authenticated = false;
          switchInFlight = false;
          browserControlInFlight = false;
          browserInspectInFlight = false;
          availableBrowserSessions = [];
          activeBrowserSessionId = '';
          streamReady = false;
          controlsUnlocked = false;
          setInteractiveControlsVisible();
          syncBrowserSessionOptions();
          updateSessionSwitchUi();
          describeSessionSwitchState();
          updateShortcutHint();
        };
        channel.onmessage = async function (event) {
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }

          if (msg.type === 'auth-challenge') {
            try {
              const response = hasWebCryptoSupport()
                ? await computeChallengeResponse(msg.challenge, passphrase)
                : await requestChallengeResponse(msg.challenge, pairingToken);
              sendMessage({ type: 'auth-response', response });
            } catch (error) {
              setStatus((error && error.message) ? error.message : ui.connectionFailed, 'error');
            }
            return;
          }

          if (msg.type === 'auth-result') {
            if (msg.ok) {
              authenticated = true;
              onAuthenticated();
            } else {
              stopLiveSyncLoop();
              streamReady = false;
              controlsUnlocked = false;
              setStatus(formatCopy(ui.authFailedTemplate, { reason: msg.reason || ui.unknownReason }), 'error');
              updateStageChips();
              updateShortcutHint();
            }
            return;
          }

          if (!authenticated) return;

          switch (msg.type) {
            case 'init':
              currentMode = msg.mode === 'readwrite' ? 'readwrite' : 'readonly';
              modeBadge.textContent = ui.modePrefix + ': ' + (currentMode === 'readwrite' ? ui.modeReadwrite : ui.modeReadonly);
              replaceTerminal(msg.scrollback || '');
              setInteractiveControlsVisible();
              updateShortcutHint();
              break;
            case 'session-catalog':
              applySessionCatalog(msg);
              break;
            case 'session-switch-result':
              applySessionSwitchResult(msg);
              break;
            case 'browser-state':
              applyBrowserState(msg);
              break;
            case 'browser-control-result':
              applyBrowserControlResult(msg);
              break;
            case 'browser-inspect-result':
              applyBrowserInspectResult(msg);
              break;
            case 'data':
              appendTerminal(msg.payload || '');
              break;
            case 'ping':
              sendMessage({ type: 'pong' });
              break;
            case 'end':
              setStatus(ui.hostEndedSession, 'error');
              stopLiveSyncLoop();
              streamReady = false;
              controlsUnlocked = false;
              updateStageChips();
              updateShortcutHint();
              break;
          }
        };
      }

`;
