export const MOBILE_PAGE_SCRIPT_UI_TERMINAL = `      function appendTerminal(chunk) {
        if (typeof chunk !== 'string' || chunk.length === 0) return;
        terminalEl.textContent += chunk;
        if (terminalEl.textContent.length > 150000) {
          terminalEl.textContent = terminalEl.textContent.slice(-90000);
        }
        if (followTerminal) {
          terminalEl.scrollTop = terminalEl.scrollHeight;
        }
      }

      function replaceTerminal(content) {
        terminalEl.textContent = '';
        if (typeof content === 'string' && content.length > 0) {
          appendTerminal(content);
        }
      }

      function clearTerminalView() {
        replaceTerminal('');
        setStatus(ui.mobileTerminalCleared, 'ok');
      }

      async function copyTerminalView() {
        const text = terminalEl.textContent || '';
        if (!text.trim()) {
          setStatus(ui.nothingToCopyYet, 'error');
          return;
        }
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
          setStatus(ui.clipboardApiUnavailable, 'error');
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          setStatus(ui.terminalCopied, 'ok');
        } catch {
          setStatus(ui.terminalCopyFailed, 'error');
        }
      }

`;
