import type { AppearanceTheme, ProviderId, UiLanguage } from '../../../shared/types/provider.js';
import { applyAppearanceTheme } from '../../appearance-theme.js';
import { appState } from '../../state.js';
import { closeModal } from '../modal.js';

interface PreferencesDraft {
  soundOnSessionWaiting: boolean;
  notificationsDesktop: boolean;
  sessionHistoryEnabled: boolean;
  insightsEnabled: boolean;
  autoTitleEnabled: boolean;
  defaultProvider: ProviderId;
  language: UiLanguage;
  appearanceTheme: AppearanceTheme;
  debugMode: boolean;
  sidebarViews: {
    configSections: boolean;
    gitPanel: boolean;
    sessionHistory: boolean;
    costFooter: boolean;
  };
}

interface BindPreferencesModalActionsArgs {
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  modalElement: HTMLElement;
  cleanupRecorder: () => void;
  isRecorderActive: () => boolean;
  savePreferences: () => void;
  /** Tema gibi canlı önizlemeleri iptal/escape ile geri alır. */
  revertPreview?: () => void;
  registerModalCleanup: (cleanup: () => void) => void;
}

export function savePreferenceDraft(
  preferenceDraft: PreferencesDraft,
  shortcutOverridesDraft: Record<string, string>,
): void {
  appState.setPreference('soundOnSessionWaiting', preferenceDraft.soundOnSessionWaiting);
  appState.setPreference('notificationsDesktop', preferenceDraft.notificationsDesktop);
  appState.setPreference('sessionHistoryEnabled', preferenceDraft.sessionHistoryEnabled);
  appState.setPreference('insightsEnabled', preferenceDraft.insightsEnabled);
  appState.setPreference('autoTitleEnabled', preferenceDraft.autoTitleEnabled);
  appState.setPreference('defaultProvider', preferenceDraft.defaultProvider);
  appState.setPreference('sidebarViews', {
    configSections: preferenceDraft.sidebarViews.configSections,
    gitPanel: preferenceDraft.sidebarViews.gitPanel,
    sessionHistory: preferenceDraft.sidebarViews.sessionHistory,
    costFooter: preferenceDraft.sidebarViews.costFooter,
  });
  appState.setPreference('keybindings', { ...shortcutOverridesDraft });
  appState.setPreference('language', preferenceDraft.language);
  appState.setPreference('appearanceTheme', preferenceDraft.appearanceTheme);
  applyAppearanceTheme(preferenceDraft.appearanceTheme);
  if (preferenceDraft.debugMode !== appState.preferences.debugMode) {
    appState.setPreference('debugMode', preferenceDraft.debugMode);
    window.calder.menu.rebuild(preferenceDraft.debugMode);
  }
}

export function bindPreferencesModalActions({
  confirmButton,
  cancelButton,
  modalElement,
  cleanupRecorder,
  isRecorderActive,
  savePreferences,
  revertPreview,
  registerModalCleanup,
}: BindPreferencesModalActionsArgs): void {
  const handleConfirm = () => {
    cleanupRecorder();
    savePreferences();
    closeModal();
    modalElement.classList.remove('modal-wide');
    confirmButton.textContent = 'Create';
  };

  const handleCancel = () => {
    cleanupRecorder();
    revertPreview?.();
    closeModal();
    modalElement.classList.remove('modal-wide');
    confirmButton.textContent = 'Create';
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (isRecorderActive()) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      handleConfirm();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }
  };

  confirmButton.addEventListener('click', handleConfirm);
  cancelButton.addEventListener('click', handleCancel);
  document.addEventListener('keydown', handleKeydown);

  registerModalCleanup(() => {
    confirmButton.removeEventListener('click', handleConfirm);
    cancelButton.removeEventListener('click', handleCancel);
    document.removeEventListener('keydown', handleKeydown);
  });
}
