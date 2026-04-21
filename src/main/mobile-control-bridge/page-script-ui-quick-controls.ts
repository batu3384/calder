export const MOBILE_PAGE_SCRIPT_UI_QUICK_CONTROLS = `      function quickControlToPayload(control) {
        switch (control) {
          case 'ctrl-c': return '\\u0003';
          case 'ctrl-l': return '\\u000c';
          case 'ctrl-d': return '\\u0004';
          case 'tab': return '\\t';
          case 'esc': return '\\u001b';
          case 'backspace': return '\\u007f';
          case 'enter': return '\\n';
          case 'up': return '\\u001b[A';
          case 'down': return '\\u001b[B';
          case 'right': return '\\u001b[C';
          case 'left': return '\\u001b[D';
          default: return null;
        }
      }

      function triggerQuickControl(control) {
        const payload = quickControlToPayload(control);
        if (!payload) return;
        const sent = sendInputPayload(payload);
        if (sent && control === 'enter') {
          commandInput.focus();
        }
        if (sent) {
          pulseTap(8);
        }
      }

      function isRepeatableControl(control) {
        return control === 'up'
          || control === 'down'
          || control === 'left'
          || control === 'right'
          || control === 'backspace';
      }

      function stopQuickControlRepeat() {
        if (quickControlRepeatTimer) {
          clearTimeout(quickControlRepeatTimer);
          quickControlRepeatTimer = null;
        }
        if (quickControlRepeatInterval) {
          clearInterval(quickControlRepeatInterval);
          quickControlRepeatInterval = null;
        }
        quickControlRepeatControl = null;
      }

      function startQuickControlRepeat(control) {
        stopQuickControlRepeat();
        if (!isRepeatableControl(control)) return;
        quickControlRepeatControl = control;
        quickControlRepeatTimer = setTimeout(function () {
          quickControlRepeatInterval = setInterval(function () {
            if (!quickControlRepeatControl) return;
            triggerQuickControl(quickControlRepeatControl);
          }, 90);
        }, 280);
      }

      function pulseTap(strength) {
        if (typeof navigator.vibrate !== 'function') return;
        navigator.vibrate(strength);
      }

`;
