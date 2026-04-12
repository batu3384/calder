import { showAlertBanner, removeAlertBanner } from './alert-banner.js';
import { showStatusLineConflictModal } from './statusline-conflict-modal.js';
import type { SettingsWarningData } from '../../shared/types';
import { isTrackingHealthy } from '../../shared/tracking-health.js';

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
      message = 'Tracking is off for this coding tool. Calder cannot show cost, context usage, or session activity yet.';
    } else if (hasStatusLineIssue) {
      message = data.statusLine === 'foreign'
        ? 'Tracking is off for this coding tool because another status line command is installed. Calder cannot show cost or context usage.'
        : 'Tracking is off for this coding tool. Calder cannot show cost or context usage until its status line is enabled.';
    } else {
      message = 'Activity tracking is off for this coding tool because Calder\'s hooks are missing.';
    }

    showAlertBanner({
      icon: '\u26A0',
      message,
      sessionId: data.sessionId,
      cta: {
        label: 'Enable tracking',
        onClick: async (btn) => {
          btn.disabled = true;
          btn.textContent = 'Enabling\u2026';
          try {
            const providerId = data.providerId;
            const metaPromise = window.calder.provider.getMeta(providerId);
            const result = await window.calder.settings.reinstall(providerId);
            const [meta, validation] = await Promise.all([
              metaPromise,
              window.calder.settings.validate(providerId),
            ]);
            if (result.success && isTrackingHealthy(meta, validation)) {
              removeAlertBanner();
              return;
            }
          } catch {
            // Keep the banner visible and restore the CTA below.
          }
          btn.disabled = false;
          btn.textContent = 'Enable tracking';
        },
      },
    });
  });
}
