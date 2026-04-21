export const MOBILE_PAGE_SCRIPT_UI_CORE_INPUT_INTERACTIVITY = `      function canSendInteractiveInput() {
        return Boolean(
          authenticated
          && dataChannel
          && dataChannel.readyState === 'open'
          && currentMode === 'readwrite'
        );
      }

      function updateHistoryNavigationState() {
        const interactive = canSendInteractiveInput();
        if (!interactive || commandHistory.length === 0) {
          historyPrevButton.disabled = true;
          historyNextButton.disabled = true;
          return;
        }

        if (commandHistoryIndex < 0) {
          historyPrevButton.disabled = false;
          historyNextButton.disabled = true;
          return;
        }

        historyPrevButton.disabled = commandHistoryIndex >= commandHistory.length - 1;
        historyNextButton.disabled = commandHistoryIndex <= 0;
      }

      function setCommandChipInteractivity(enabled) {
        const chips = commandChipList.querySelectorAll('[data-command-chip]');
        for (const chip of chips) {
          chip.disabled = !enabled;
        }
      }

      function setInteractiveControlsVisible() {
        const visible = canSendInteractiveInput();
        controlsUnlocked = visible;
        if (visible) {
          composer.classList.add('visible');
          commandChipList.classList.add('visible');
          if (shortcutToggleRow) shortcutToggleRow.classList.add('visible');
        } else {
          composer.classList.remove('visible');
          commandChipList.classList.remove('visible');
          if (shortcutToggleRow) shortcutToggleRow.classList.remove('visible');
        }
        setShortcutsExpanded(shortcutsExpanded && visible);
        if (shortcutToggleButton) shortcutToggleButton.disabled = !visible;
        sendButton.disabled = !visible;
        setCommandChipInteractivity(visible);
        updateHistoryNavigationState();
        setInteractiveViewsEnabled(visible);
        updateBrowserControlsUi();
        updateStageChips();
      }

      function sendInputPayload(payload) {
        if (!canSendInteractiveInput()) return false;
        sendMessage({ type: 'input', payload });
        return true;
      }

`;
