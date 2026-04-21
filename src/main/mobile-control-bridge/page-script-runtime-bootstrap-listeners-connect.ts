export const MOBILE_PAGE_SCRIPT_RUNTIME_BOOTSTRAP_LISTENERS_CONNECT = `        connectButton.addEventListener('click', async function () {
          const otp = syncOtpUi();
          if (otp.length !== 6) {
            setStatus(ui.enterOtpPrompt, 'error');
            return;
          }

          otpVerified = false;
          streamReady = false;
          controlsUnlocked = false;
          updateStageChips();
          connectButton.disabled = true;
          setStatus(ui.verifyingOtp);
          setConnState('authorizing');

          try {
            const payload = await bootstrapPairing(otp, token);
            otpVerified = true;
            updateStageChips();
            await connectToHost(payload, token);
          } catch (error) {
            setStatus((error && error.message) ? error.message : ui.connectionFailed, 'error');
            syncOtpUi();
            setConnState('error');
            if (!otpVerified) {
              updateStageChips();
            }
          }
        });

`;
