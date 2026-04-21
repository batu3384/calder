export const MOBILE_PAGE_SCRIPT_RUNTIME_BOOTSTRAP_FINALIZE = `        window.addEventListener('beforeunload', stopLiveSyncLoop);

        setActiveView('terminal');
        setFollowTerminal(true);
        setInteractiveViewsEnabled(false);
        updateStageChips();
        updateShortcutHint();
        syncSessionSelectOptions();
        syncBrowserSessionOptions();
      }

      void begin();
    })();`;
