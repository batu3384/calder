export const MOBILE_PAGE_SCRIPT_UI_CORE_VIEWS = `      function updateShortcutHint() {
        if (!shortcutHint) return;
        if (!authenticated) {
          shortcutHint.textContent = ui.shortcutsHiddenUntilReady;
          return;
        }
        if (currentMode !== 'readwrite') {
          shortcutHint.textContent = ui.readonlyHint;
          return;
        }
        shortcutHint.textContent = shortcutsExpanded
          ? ui.repeatInputHint
          : ui.shortcutsHiddenUntilNeeded;
      }

      function setShortcutsExpanded(expanded) {
        const canExpand = canSendInteractiveInput();
        shortcutsExpanded = Boolean(expanded) && canExpand;
        quickControls.classList.toggle('visible', shortcutsExpanded);
        if (shortcutToggleButton) {
          shortcutToggleButton.textContent = shortcutsExpanded ? ui.hideShortcutsButton : ui.showShortcutsButton;
          shortcutToggleButton.setAttribute('aria-expanded', shortcutsExpanded ? 'true' : 'false');
          shortcutToggleButton.classList.toggle('active', shortcutsExpanded);
        }
        updateShortcutHint();
      }

      function updateFollowButton() {
        terminalFollowButton.textContent = followTerminal ? ui.followOnButton : ui.followOffButton;
        terminalFollowButton.classList.toggle('active', followTerminal);
      }

      function setFollowTerminal(enabled) {
        followTerminal = Boolean(enabled);
        updateFollowButton();
        if (followTerminal) {
          terminalEl.scrollTop = terminalEl.scrollHeight;
        }
      }

      function setActiveView(view) {
        activeView = view === 'controls' || view === 'browser' ? view : 'terminal';
        if (activeView === 'terminal') {
          stopQuickControlRepeat();
        }
        terminalView.classList.toggle('active', activeView === 'terminal');
        if (browserView) {
          browserView.classList.toggle('active', activeView === 'browser');
        }
        controlsView.classList.toggle('active', activeView === 'controls');
        for (const tab of viewTabs) {
          const viewName = tab.getAttribute('data-mobile-view-tab');
          const isActive = viewName === activeView;
          tab.classList.toggle('active', isActive);
          tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
      }

      function setInteractiveViewsEnabled(enabled) {
        controlsViewTab.disabled = !enabled;
        controlsViewTab.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        if (browserViewTab) {
          browserViewTab.disabled = !enabled;
          browserViewTab.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        }
        if (!enabled && activeView !== 'terminal') {
          setActiveView('terminal');
        }
      }

`;
