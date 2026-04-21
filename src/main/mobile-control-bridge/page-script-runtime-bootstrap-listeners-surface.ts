export const MOBILE_PAGE_SCRIPT_RUNTIME_BOOTSTRAP_LISTENERS_SURFACE = `        sessionSelect.addEventListener('change', function () {
          updateSessionSwitchUi();
        });

        sessionSwitchButton.addEventListener('click', function () {
          requestSessionSwitch();
        });

        if (browserSessionSelect) {
          browserSessionSelect.addEventListener('change', function () {
            activeBrowserSessionId = String(browserSessionSelect.value || '');
            updateBrowserControlsUi();
          });
        }

        if (browserControls) {
          browserControls.addEventListener('click', function (event) {
            const rawTarget = event.target;
            if (!(rawTarget instanceof Element)) return;
            const controlBtn = rawTarget.closest('[data-mobile-browser-control]');
            if (controlBtn) {
              const action = controlBtn.getAttribute('data-browser-control');
              if (!action) return;
              sendBrowserControl(action);
              return;
            }
            const viewportBtn = rawTarget.closest('[data-mobile-browser-viewport]');
            if (!viewportBtn) return;
            const viewportLabel = viewportBtn.getAttribute('data-browser-viewport');
            if (!viewportLabel) return;
            sendBrowserControl('set-viewport', { viewportLabel });
          });
        }

        if (browserInspectComposer) {
          browserInspectComposer.addEventListener('submit', function (event) {
            event.preventDefault();
            sendBrowserInspectInstruction();
          });
        }

        for (const tab of viewTabs) {
          tab.addEventListener('click', function () {
            const view = tab.getAttribute('data-mobile-view-tab');
            if (!view) return;
            if (tab.disabled) return;
            setActiveView(view);
          });
        }

`;
