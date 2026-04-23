import type { ProviderId } from '../../../shared/types/provider.js';
import { createCustomSelect, type CustomSelectInstance } from '../custom-select.js';
import {
  getProviderAvailabilitySnapshot,
  resolvePreferredProviderForLaunch,
  shouldRenderInlineProviderSelector,
  type ProviderAvailabilitySnapshot,
} from '../surface-services/provider-availability.js';

interface CreateTabBarProviderSelectorControllerOptions {
  addSessionButtonEl: HTMLElement;
  sessionProviderSlotEl: HTMLElement;
  onOpenChange: (open: boolean) => void;
  onProviderSelected: (providerId: ProviderId) => void;
}

export interface TabBarProviderSelectorController {
  syncSessionProviderSelector: (preferredProvider: ProviderId | undefined) => void;
  syncQuickSessionButtonMeta: (providerId: ProviderId) => void;
  buildSessionProviderSelectorSignature: (snapshot: ProviderAvailabilitySnapshot | null) => string;
  destroySessionProviderSelector: () => void;
}

export function createTabBarProviderSelectorController(
  options: CreateTabBarProviderSelectorControllerOptions,
): TabBarProviderSelectorController {
  const { addSessionButtonEl, sessionProviderSlotEl, onOpenChange, onProviderSelected } = options;
  let sessionProviderSelect: CustomSelectInstance | null = null;
  let sessionProviderSelectorSignature = '';

  function syncQuickSessionButtonMeta(providerId: ProviderId): void {
    const snapshot = getProviderAvailabilitySnapshot();
    const providerLabel = snapshot?.providers.find(provider => provider.id === providerId)?.displayName ?? providerId;
    addSessionButtonEl.title = `New ${providerLabel} Session (Ctrl+Shift+N)`;
    addSessionButtonEl.setAttribute('aria-label', `Create new ${providerLabel} session`);
  }

  function buildSessionProviderSelectorSignature(snapshot: ProviderAvailabilitySnapshot | null): string {
    if (!snapshot) return 'hidden';
    return snapshot.providers
      .map(provider => `${provider.id}:${provider.displayName}:${snapshot.availability.get(provider.id) ? '1' : '0'}`)
      .join('|');
  }

  function destroySessionProviderSelector(): void {
    if (sessionProviderSelect) {
      sessionProviderSelect.destroy();
      sessionProviderSelect = null;
    }
    sessionProviderSelectorSignature = '';
    onOpenChange(false);
    sessionProviderSlotEl.innerHTML = '';
    sessionProviderSlotEl.hidden = true;
  }

  function syncSessionProviderSelector(preferredProvider: ProviderId | undefined): void {
    const snapshot = getProviderAvailabilitySnapshot();
    const selectedProvider = resolvePreferredProviderForLaunch(preferredProvider, snapshot);
    syncQuickSessionButtonMeta(selectedProvider);

    if (!snapshot || !shouldRenderInlineProviderSelector(snapshot)) {
      destroySessionProviderSelector();
      return;
    }

    const signature = buildSessionProviderSelectorSignature(snapshot);
    if (sessionProviderSelect && sessionProviderSelectorSignature === signature) {
      sessionProviderSelect?.setValue(selectedProvider);
      sessionProviderSlotEl.hidden = false;
      return;
    }

    destroySessionProviderSelector();

    const select = createCustomSelect(
      'command-deck-provider',
      snapshot.providers.map(provider => {
        const available = snapshot.availability.get(provider.id);
        return {
          value: provider.id,
          label: available ? provider.displayName : `${provider.displayName} (not installed)`,
          disabled: !available,
        };
      }),
      selectedProvider,
      {
        floating: {
          placement: 'bottom-end',
          offsetPx: 8,
          maxWidthPx: 280,
          maxHeightPx: 320,
          strategy: 'fixed',
        },
        align: 'end',
        onOpenChange,
      },
    );
    select.element.classList.add('command-deck-provider-select');

    const hiddenInput = select.element.querySelector('#command-deck-provider') as HTMLInputElement | null;
    hiddenInput?.addEventListener('change', () => {
      const providerId = hiddenInput.value as ProviderId;
      syncQuickSessionButtonMeta(providerId);
      onProviderSelected(providerId);
    });

    sessionProviderSlotEl.hidden = false;
    sessionProviderSlotEl.appendChild(select.element);
    sessionProviderSelect = select;
    sessionProviderSelectorSignature = signature;
  }

  return {
    syncSessionProviderSelector,
    syncQuickSessionButtonMeta,
    buildSessionProviderSelectorSignature,
    destroySessionProviderSelector,
  };
}
