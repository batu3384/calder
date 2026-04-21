export const MOBILE_PAGE_SCRIPT_RUNTIME_BOOTSTRAP_LISTENERS_TERMINAL = `        composer.addEventListener('submit', function (event) {
          event.preventDefault();
          const value = String(commandInput.value || '');
          if (!sendCommandValue(value)) return;
          commandInput.value = '';
          pulseTap(10);
        });

        commandInput.addEventListener('keydown', function (event) {
          if (!canSendInteractiveInput()) return;
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            triggerQuickControl('up');
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            triggerQuickControl('down');
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            triggerQuickControl('left');
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            triggerQuickControl('right');
          } else if (event.key === 'Tab') {
            event.preventDefault();
            triggerQuickControl('tab');
          } else if (event.key === 'Escape') {
            event.preventDefault();
            triggerQuickControl('esc');
          }
        });

        historyPrevButton.addEventListener('click', function () {
          recallCommand(1);
        });

        historyNextButton.addEventListener('click', function () {
          recallCommand(-1);
        });

        commandChipList.addEventListener('click', function (event) {
          const rawTarget = event.target;
          if (!(rawTarget instanceof Element)) return;
          const button = rawTarget.closest('[data-command-chip]');
          if (!button) return;
          const value = String(button.getAttribute('data-command-chip') || '').trim();
          if (!value) return;
          const sent = sendCommandValue(value);
          if (sent) {
            commandInput.value = '';
            pulseTap(8);
          }
        });

        terminalClearButton.addEventListener('click', function () {
          clearTerminalView();
        });

        terminalCopyButton.addEventListener('click', function () {
          void copyTerminalView();
        });

        terminalFollowButton.addEventListener('click', function () {
          setFollowTerminal(!followTerminal);
        });

        terminalEl.addEventListener('scroll', function () {
          if (!followTerminal) return;
          const distanceFromBottom = terminalEl.scrollHeight - terminalEl.scrollTop - terminalEl.clientHeight;
          if (distanceFromBottom > 24) {
            setFollowTerminal(false);
          }
        });

`;
