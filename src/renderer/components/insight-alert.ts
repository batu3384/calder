import type { InsightResult } from '../insights/types.js';
import { appState } from '../state.js';
import { removeAlertBanner, showAlertBanner } from './alert-banner.js';
import {
  getProviderAvailabilitySnapshot,
  resolvePreferredProviderForLaunch,
} from './surface-services/provider-availability.js';
import { dismissInsight, onAlert } from './surface-services/session-insights.js';
import { setPendingPrompt } from './terminal-pane.js';

export function initInsightAlert(): void {
  onAlert((projectId, results) => {
    const result = results[0];
    if (!result) return;
    requestAnimationFrame(() => showInsightBanner(projectId, result));
  });
}

function handleInsightAction(result: InsightResult): void {
  if (!result.action) return;

  const project = appState.activeProject;
  if (!project) return;
  const providerId = resolvePreferredProviderForLaunch(
    appState.preferences.defaultProvider,
    getProviderAvailabilitySnapshot(),
  );

  const session = appState.addPlanSession(project.id, 'Fix Pre-Context', providerId);
  if (!session) return;

  removeAlertBanner();

  setPendingPrompt(session.id, result.action.prompt);
}

function showInsightBanner(projectId: string, result: InsightResult): void {
  showAlertBanner({
    icon: '\u26A0',
    message: result.description,
    cta: result.action
      ? {
          label: result.action.label,
          onClick: () => handleInsightAction(result),
        }
      : undefined,
    onDismiss: () => dismissInsight(projectId, result.id),
  });
}
