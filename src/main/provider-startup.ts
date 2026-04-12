import type { PersistedState, ProviderId } from '../shared/types';
import type { CliProvider } from './providers/provider';

type ProviderPrereq = ReturnType<CliProvider['validatePrerequisites']>;

export interface ProviderStartupStatus {
  provider: CliProvider;
  prereq: ProviderPrereq;
  reasons: Array<'default-provider' | 'saved-session'>;
}

export interface ProviderStartupAnalysis {
  available: ProviderStartupStatus[];
  unavailable: ProviderStartupStatus[];
  relevantUnavailable: ProviderStartupStatus[];
  blocking: boolean;
}

function collectReferencedProviders(state: PersistedState): Map<ProviderId, Set<'default-provider' | 'saved-session'>> {
  const reasons = new Map<ProviderId, Set<'default-provider' | 'saved-session'>>();

  const addReason = (providerId: ProviderId | undefined, reason: 'default-provider' | 'saved-session'): void => {
    if (!providerId) return;
    if (!reasons.has(providerId)) {
      reasons.set(providerId, new Set());
    }
    reasons.get(providerId)!.add(reason);
  };

  addReason(state.preferences.defaultProvider, 'default-provider');
  for (const project of state.projects) {
    for (const session of project.sessions) {
      addReason(session.providerId, 'saved-session');
    }
  }

  return reasons;
}

export function analyzeProviderStartup(providers: CliProvider[], state: PersistedState): ProviderStartupAnalysis {
  const references = collectReferencedProviders(state);
  const results: ProviderStartupStatus[] = providers.map(provider => ({
    provider,
    prereq: provider.validatePrerequisites(),
    reasons: Array.from(references.get(provider.meta.id) ?? []),
  }));

  const available = results.filter(result => result.prereq.ok);
  const unavailable = results.filter(result => !result.prereq.ok);

  return {
    available,
    unavailable,
    relevantUnavailable: available.length === 0
      ? unavailable
      : unavailable.filter(result => result.reasons.length > 0),
    blocking: available.length === 0,
  };
}

function formatReason(reason: 'default-provider' | 'saved-session'): string {
  return reason === 'default-provider' ? 'your default provider' : 'a saved session';
}

export function formatProviderStartupWarning(result: ProviderStartupStatus): string {
  const reasonSummary = result.reasons.length > 0
    ? result.reasons.map(formatReason).join(' and ')
    : 'Calder startup';
  return `${result.provider.meta.displayName} is unavailable for ${reasonSummary}: ${result.prereq.message}`;
}

export function formatMissingProviderDialog(unavailable: ProviderStartupStatus[]): string {
  return unavailable
    .map(result => `- ${result.provider.meta.displayName}:\n${result.prereq.message}`)
    .join('\n\n');
}
