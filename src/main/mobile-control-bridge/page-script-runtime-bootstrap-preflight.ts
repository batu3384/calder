export const MOBILE_PAGE_SCRIPT_RUNTIME_BOOTSTRAP_PREFLIGHT = `      async function begin() {
        const token = resolvePairingTokenFromUrl();
        if (!token) {
          setStatus(ui.missingPairingToken, 'error');
          connectButton.disabled = true;
          return;
        }
        pairingToken = token;

        syncOtpUi();
        otpInput.addEventListener('input', function () {
          syncOtpUi();
        });
        otpInput.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (connectButton.disabled) return;
          connectButton.click();
        });

        const nativeBootstrap = resolveNativeBootstrapHint(token);
        if (nativeBootstrap) {
          otpVerified = true;
          streamReady = false;
          controlsUnlocked = false;
          updateStageChips();
          otpInput.value = '';
          otpInput.disabled = true;
          connectButton.disabled = true;
          setStatus(ui.establishingConnection);
          setConnState('authorizing');
          try {
            await connectToHost(nativeBootstrap.payload, nativeBootstrap.token);
            return;
          } catch (error) {
            otpVerified = false;
            otpInput.disabled = false;
            setStatus((error && error.message) ? error.message : ui.connectionFailed, 'error');
            syncOtpUi();
            setConnState('error');
            updateStageChips();
          }
        }

`;
