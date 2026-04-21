export const MOBILE_PAGE_SCRIPT_RUNTIME_BOOTSTRAP_LISTENERS_CONTROLS = `        if (shortcutToggleButton) {
          shortcutToggleButton.addEventListener('click', function () {
            setShortcutsExpanded(!shortcutsExpanded);
          });
        }

        quickControls.addEventListener('pointerdown', function (event) {
          const rawTarget = event.target;
          if (!(rawTarget instanceof Element)) return;
          const button = rawTarget.closest('[data-control]');
          if (!button) return;
          const control = button.getAttribute('data-control');
          if (!control) return;
          suppressQuickControlClickUntilMs = Date.now() + 400;
          triggerQuickControl(control);
          startQuickControlRepeat(control);
        });

        quickControls.addEventListener('pointerup', stopQuickControlRepeat);
        quickControls.addEventListener('pointercancel', stopQuickControlRepeat);
        quickControls.addEventListener('pointerleave', stopQuickControlRepeat);

        quickControls.addEventListener('click', function (event) {
          if (Date.now() < suppressQuickControlClickUntilMs) return;
          const rawTarget = event.target;
          if (!(rawTarget instanceof Element)) return;
          const button = rawTarget.closest('[data-control]');
          if (!button) return;
          const control = button.getAttribute('data-control');
          if (!control) return;
          triggerQuickControl(control);
        });

`;
