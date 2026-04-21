export const MOBILE_PAGE_SCRIPT_RUNTIME_CHANNEL_CORE = `      function sendMessage(payload) {
        if (dataChannel && dataChannel.readyState === 'open') {
          dataChannel.send(JSON.stringify(payload));
        }
      }

      function onAuthenticated() {
        streamReady = true;
        setStatus(ui.connectedLiveStream, 'ok');
        setConnState('connected');
        setInteractiveControlsVisible();
        updateSessionSwitchUi();
        describeSessionSwitchState();
        requestLiveSync();
        startLiveSyncLoop();
        updateShortcutHint();
      }

`;
