export const MOBILE_PAGE_SCRIPT_UI_CORE_INPUT_HISTORY = `      function rememberCommand(value) {
        const trimmed = String(value || '').trim();
        if (!trimmed) return;
        const existingIndex = commandHistory.indexOf(trimmed);
        if (existingIndex >= 0) {
          commandHistory.splice(existingIndex, 1);
        }
        commandHistory.unshift(trimmed);
        if (commandHistory.length > MAX_COMMAND_HISTORY) {
          commandHistory = commandHistory.slice(0, MAX_COMMAND_HISTORY);
        }
        commandHistoryIndex = -1;
        updateHistoryNavigationState();
      }

      function sendCommandValue(rawValue) {
        const value = String(rawValue || '').trim();
        if (!value) return false;
        if (!sendInputPayload(value + '\\n')) return false;
        rememberCommand(value);
        return true;
      }

      function recallCommand(direction) {
        if (commandHistory.length === 0) return;

        if (commandHistoryIndex < 0) {
          if (direction <= 0) return;
          commandHistoryIndex = 0;
        } else {
          commandHistoryIndex += direction;
          if (commandHistoryIndex < 0) {
            commandHistoryIndex = -1;
            commandInput.value = '';
            updateHistoryNavigationState();
            return;
          }
          if (commandHistoryIndex >= commandHistory.length) {
            commandHistoryIndex = commandHistory.length - 1;
          }
        }

        if (commandHistoryIndex >= 0 && commandHistoryIndex < commandHistory.length) {
          commandInput.value = commandHistory[commandHistoryIndex];
          commandInput.focus();
        }
        updateHistoryNavigationState();
      }

`;
