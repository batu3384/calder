import type { ProviderId } from '../../../shared/types/provider.js';
import type { ProviderAvailabilitySnapshot } from './preferences-modal-sections-types.js';

export function buildProviderOptions(
  snapshot: ProviderAvailabilitySnapshot,
  unavailableSuffix: string,
): Array<{ value: ProviderId; label: string; disabled: boolean }> {
  return snapshot.providers.map(provider => {
    const available = snapshot.availability.get(provider.id) ?? true;
    return {
      value: provider.id,
      label: available ? provider.displayName : `${provider.displayName}${unavailableSuffix}`,
      disabled: !available,
    };
  });
}

export function buildProviderNote(
  snapshot: ProviderAvailabilitySnapshot | null,
  providerId: ProviderId,
  defaultMissingMessage: string,
  installedMessage: string,
  unavailableMessage: string,
): string {
  if (!snapshot) return defaultMissingMessage;
  if (snapshot.availability.get(providerId)) {
    return installedMessage;
  }
  return unavailableMessage;
}

export function appendPreferencesToggleField(
  container: HTMLElement,
  id: string,
  labelText: string,
  checked: boolean,
  onChange: (checkedState: boolean) => void,
): void {
  const row = document.createElement('div');
  row.className = 'modal-toggle-field';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  checkbox.checked = checked;
  checkbox.addEventListener('change', () => onChange(checkbox.checked));

  row.appendChild(label);
  row.appendChild(checkbox);
  container.appendChild(row);
}
