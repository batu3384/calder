import { showAlertBanner, removeAlertBanner } from './alert-banner.js';
import { showStatusLineConflictModal } from './statusline-conflict-modal.js';
import type { SettingsWarningData } from '../../shared/types';

let initialized = false;

export function initSettingsGuard(): void {
  if (initialized) return;
  initialized = true;

  window.calder.settings.onConflictDialog((data) => {
    showStatusLineConflictModal(data.foreignCommand).then((choice) => {
      window.calder.settings.respondConflictDialog(choice);
    });
  });

  window.calder.settings.onWarning((data: SettingsWarningData) => {
    const hasStatusLineIssue = data.statusLine !== 'calder';
    const hasHooksIssue = data.hooks !== 'complete';

    if (!hasStatusLineIssue && !hasHooksIssue) return;

    let message: string;
    if (hasStatusLineIssue && hasHooksIssue) {
      message = 'Calder integration is incomplete for the active coding tool. Cost tracking and session activity may not work.';
    } else if (hasStatusLineIssue) {
      message = data.statusLine === 'foreign'
        ? 'Another tool has overwritten Calder\'s status line integration. Cost tracking is unavailable.'
        : 'Cost tracking is unavailable \u2014 Calder\'s status line integration is not configured for the active coding tool.';
    } else {
      message = 'Some session tracking hooks are missing from the active coding tool settings. Activity tracking may not work.';
    }

    showAlertBanner({
      icon: '\u26A0',
      message,
      cta: {
        label: 'Fix Settings',
        onClick: async (btn) => {
          btn.disabled = true;
          btn.textContent = 'Fixing\u2026';
          const result = await window.calder.settings.reinstall();
          if (result.success) {
            removeAlertBanner();
          } else {
            btn.disabled = false;
            btn.textContent = 'Fix Settings';
          }
        },
      },
    });
  });
}
