export const MOBILE_PAGE_SCRIPT_UI_CORE_STATUS = `      function normalizeOtpValue(raw) {
        return String(raw || '').replace(/\\D/g, '').slice(0, 6);
      }

      function syncOtpUi() {
        const digits = normalizeOtpValue(otpInput.value);
        if (otpInput.value !== digits) {
          otpInput.value = digits;
        }
        connectButton.disabled = digits.length !== 6;
        return digits;
      }

      function formatCopy(template, replacements) {
        if (typeof template !== 'string') return '';
        return template.replace(/\{(\w+)\}/g, function (_match, key) {
          return Object.prototype.hasOwnProperty.call(replacements, key)
            ? String(replacements[key])
            : '';
        });
      }

      function setStatus(message, kind) {
        statusEl.textContent = message;
        statusEl.classList.remove('error', 'ok');
        if (kind === 'error') statusEl.classList.add('error');
        if (kind === 'ok') statusEl.classList.add('ok');
      }

      function setConnState(label) {
        connBadge.textContent = ui.statePrefix + ': ' + label;
      }

      function updateStageChips() {
        for (const chip of stageChips) {
          const stage = chip.getAttribute('data-stage');
          const done = (stage === 'verify' && otpVerified)
            || (stage === 'stream' && streamReady)
            || (stage === 'controls' && controlsUnlocked);
          const active = !done && (
            (stage === 'verify' && !otpVerified)
            || (stage === 'stream' && otpVerified && !streamReady)
            || (stage === 'controls' && streamReady && !controlsUnlocked)
          );
          chip.classList.toggle('done', done);
          chip.classList.toggle('active', active);
          chip.setAttribute('aria-current', active ? 'step' : 'false');
        }
      }

`;
