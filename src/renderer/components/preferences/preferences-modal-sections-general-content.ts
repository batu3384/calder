import { createCustomSelect } from '../custom-select.js';
import { loadProviderAvailability, getProviderAvailabilitySnapshot } from '../../provider-availability.js';
import {
  appendPreferencesToggleField,
  buildProviderNote,
  buildProviderOptions,
} from './preferences-modal-general-helpers.js';
import type { ProviderId, UiLanguage } from '../../../shared/types/provider.js';
import type { RenderGeneralSectionArgs } from './preferences-modal-sections-types.js';

export interface GeneralProviderCopy {
  unavailableSuffix: string;
  defaultMissingMessage: string;
  defaultInstalledMessage: string;
  defaultUnavailableMessage: string;
}

interface RenderGeneralSectionContentArgs extends RenderGeneralSectionArgs {
  providerCopy: GeneralProviderCopy;
}

function appendGeneralSectionOverview(
  content: HTMLElement,
  preferenceDraft: RenderGeneralSectionArgs['preferenceDraft'],
  appendSectionIntro: RenderGeneralSectionArgs['appendSectionIntro'],
  appendOverviewGrid: RenderGeneralSectionArgs['appendOverviewGrid'],
): void {
  appendSectionIntro(
    content,
    'Session',
    'Launch defaults',
    'Choose how Calder opens new work, how it names sessions, and which signals stay on while you code.',
  );
  appendOverviewGrid(content, [
    {
      label: 'Language',
      value: preferenceDraft.language === 'tr' ? 'Turkish' : 'English',
      note: 'Applies to the full Calder interface.',
    },
    {
      label: 'Default tool',
      value: preferenceDraft.defaultProvider,
      note: 'Used when a new session has no explicit provider.',
    },
    {
      label: 'History',
      value: preferenceDraft.sessionHistoryEnabled ? 'On' : 'Off',
      note: 'Closed sessions can stay searchable in the run log.',
    },
    {
      label: 'Alerts',
      value: preferenceDraft.notificationsDesktop ? 'Desktop' : 'In-app only',
      note: 'Sound and notification behavior stays local to this workspace.',
    },
  ]);
}

function buildDefaultProviderNote(
  snapshot: ReturnType<typeof getProviderAvailabilitySnapshot>,
  providerId: ProviderId,
  providerCopy: GeneralProviderCopy,
): string {
  return buildProviderNote(
    snapshot,
    providerId,
    providerCopy.defaultMissingMessage,
    providerCopy.defaultInstalledMessage,
    providerCopy.defaultUnavailableMessage,
  );
}

function appendDefaultProviderField({
  content,
  preferenceDraft,
  isGeneralSectionActive,
  getDefaultProviderSelect,
  replaceDefaultProviderSelect,
  providerCopy,
}: Pick<
  RenderGeneralSectionContentArgs,
  'content'
  | 'preferenceDraft'
  | 'isGeneralSectionActive'
  | 'getDefaultProviderSelect'
  | 'replaceDefaultProviderSelect'
  | 'providerCopy'
>): void {
  const providerRow = document.createElement('div');
  providerRow.className = 'modal-toggle-field';

  const providerLabel = document.createElement('label');
  providerLabel.textContent = 'Default coding tool';

  const providerNote = document.createElement('div');
  providerNote.className = 'preferences-control-note';

  const currentDefault = preferenceDraft.defaultProvider;
  const providerSnapshot = { current: getProviderAvailabilitySnapshot() };

  const updateProviderDraftAndNote = (): void => {
    const select = getDefaultProviderSelect();
    if (!select) return;
    preferenceDraft.defaultProvider = select.getValue() as ProviderId;
    providerNote.textContent = buildDefaultProviderNote(providerSnapshot.current, preferenceDraft.defaultProvider, providerCopy);
  };

  const bindProviderSelectChange = (): void => {
    const select = getDefaultProviderSelect();
    if (!select) return;
    select.element.addEventListener('change', () => {
      updateProviderDraftAndNote();
    });
  };

  if (providerSnapshot.current) {
    const defaultSelect = createCustomSelect(
      'pref-default-provider',
      buildProviderOptions(providerSnapshot.current, providerCopy.unavailableSuffix),
      currentDefault,
    );
    replaceDefaultProviderSelect(defaultSelect);
    preferenceDraft.defaultProvider = defaultSelect.getValue() as ProviderId;
  } else {
    const loadingSelect = createCustomSelect(
      'pref-default-provider',
      [{ value: currentDefault, label: 'Loading…' }],
      currentDefault,
    );
    replaceDefaultProviderSelect(loadingSelect);
    void loadProviderAvailability().then(() => {
      if (!isGeneralSectionActive()) return;
      providerSnapshot.current = getProviderAvailabilitySnapshot();
      if (!providerSnapshot.current) return;

      const refreshedSelect = createCustomSelect(
        'pref-default-provider',
        buildProviderOptions(providerSnapshot.current, providerCopy.unavailableSuffix),
        preferenceDraft.defaultProvider,
      );
      replaceDefaultProviderSelect(refreshedSelect);
      providerRow.querySelector('.custom-select')?.remove();
      providerRow.appendChild(refreshedSelect.element);
      preferenceDraft.defaultProvider = refreshedSelect.getValue() as ProviderId;
      providerNote.textContent = buildDefaultProviderNote(providerSnapshot.current, preferenceDraft.defaultProvider, providerCopy);
      bindProviderSelectChange();
    });
  }

  const providerSelect = getDefaultProviderSelect();
  if (!providerSelect) return;

  providerNote.textContent = buildDefaultProviderNote(providerSnapshot.current, preferenceDraft.defaultProvider, providerCopy);
  bindProviderSelectChange();
  providerRow.appendChild(providerLabel);
  providerRow.appendChild(providerSelect.element);
  content.appendChild(providerRow);
  content.appendChild(providerNote);
}

function appendLanguageField({
  content,
  preferenceDraft,
  replaceLanguageSelect,
}: Pick<RenderGeneralSectionArgs, 'content' | 'preferenceDraft' | 'replaceLanguageSelect'>): void {
  const languageRow = document.createElement('div');
  languageRow.className = 'modal-toggle-field';

  const languageLabel = document.createElement('label');
  languageLabel.textContent = 'Interface language';

  const languageSelect = createCustomSelect(
    'pref-language',
    [
      { value: 'en', label: 'English' },
      { value: 'tr', label: 'Turkish' },
    ],
    preferenceDraft.language,
  );
  replaceLanguageSelect(languageSelect);

  const languageNote = document.createElement('div');
  languageNote.className = 'preferences-control-note';
  languageNote.textContent = 'Language changes apply after the interface refreshes.';

  languageRow.appendChild(languageLabel);
  languageRow.appendChild(languageSelect.element);
  content.appendChild(languageRow);
  content.appendChild(languageNote);
  languageSelect.element.addEventListener('change', () => {
    preferenceDraft.language = languageSelect.getValue() as UiLanguage;
  });
}

function appendGeneralSessionToggles(
  content: HTMLElement,
  preferenceDraft: RenderGeneralSectionArgs['preferenceDraft'],
): void {
  appendPreferencesToggleField(
    content,
    'pref-sound-on-waiting',
    'Play sound when session finishes work',
    preferenceDraft.soundOnSessionWaiting,
    (checked) => {
      preferenceDraft.soundOnSessionWaiting = checked;
    },
  );
  appendPreferencesToggleField(
    content,
    'pref-notifications-desktop',
    'Desktop notifications when sessions need attention',
    preferenceDraft.notificationsDesktop,
    (checked) => {
      preferenceDraft.notificationsDesktop = checked;
    },
  );
  appendPreferencesToggleField(
    content,
    'pref-session-history',
    'Record session history when sessions close',
    preferenceDraft.sessionHistoryEnabled,
    (checked) => {
      preferenceDraft.sessionHistoryEnabled = checked;
    },
  );
  appendPreferencesToggleField(
    content,
    'pref-insights-enabled',
    'Show insight alerts',
    preferenceDraft.insightsEnabled,
    (checked) => {
      preferenceDraft.insightsEnabled = checked;
    },
  );
  appendPreferencesToggleField(
    content,
    'pref-auto-title',
    'Auto-name sessions from conversation title',
    preferenceDraft.autoTitleEnabled,
    (checked) => {
      preferenceDraft.autoTitleEnabled = checked;
    },
  );
}

export function renderGeneralPreferencesSectionContent({
  content,
  preferenceDraft,
  appendSectionIntro,
  appendOverviewGrid,
  isGeneralSectionActive,
  getDefaultProviderSelect,
  replaceDefaultProviderSelect,
  replaceLanguageSelect,
  providerCopy,
}: RenderGeneralSectionContentArgs): void {
  appendGeneralSectionOverview(content, preferenceDraft, appendSectionIntro, appendOverviewGrid);
  appendDefaultProviderField({
    content,
    preferenceDraft,
    isGeneralSectionActive,
    getDefaultProviderSelect,
    replaceDefaultProviderSelect,
    providerCopy,
  });
  appendLanguageField({
    content,
    preferenceDraft,
    replaceLanguageSelect,
  });
  appendGeneralSessionToggles(content, preferenceDraft);
}
