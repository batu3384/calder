import { appState } from '../../state.js';
import {
  extendModalCleanup,
  prepareModalSurface,
  runModalCleanup,
} from '../modal.js';
import type { CustomSelectInstance } from '../custom-select.js';
import {
  appendOverviewGrid as appendOverviewGridLayout,
  appendSectionCard as appendSectionCardLayout,
  appendSectionGroup as appendSectionGroupLayout,
  appendSectionIntro as appendSectionIntroLayout,
} from './preferences-layout.js';
import {
  resolveSetupBadgeHasIssue,
} from './preferences-provider-setup.js';
import {
  bindPreferencesModalActions,
  savePreferenceDraft,
} from './preferences-modal-actions.js';
import {
  renderAboutPreferencesSection,
  renderGeneralPreferencesSection,
  renderLayoutPreferencesSection,
} from './preferences-modal-sections.js';
import { createPreferencesModalShell } from './preferences-modal-shell.js';
import { formatRelativeTimestamp } from './preferences-time.js';
import {
  bindPreferencesMenuNavigation,
  renderProvidersPreferencesContent,
  renderShortcutPreferencesContent,
} from './preferences-modal-renderers.js';
import type { ProviderId, UiLanguage } from '../../../shared/types/provider.js';
import type { MobileDependencyId } from '../../../shared/types/mobile.js';


const overlay = document.getElementById('modal-overlay')!;
const modal = document.getElementById('modal')!;
const titleEl = document.getElementById('modal-title')!;
const bodyEl = document.getElementById('modal-body')!;
const btnCancel = document.getElementById('modal-cancel') as HTMLButtonElement;
const btnConfirm = document.getElementById('modal-confirm') as HTMLButtonElement;

type Section = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about';

const PREFERENCE_SECTIONS: Array<{ id: Section; label: string; caption: string }> = [
  { id: 'general', label: 'Session', caption: 'How Calder starts and remembers work' },
  { id: 'layout', label: 'Layout', caption: 'Surface and rail visibility defaults' },
  { id: 'shortcuts', label: 'Keys', caption: 'Command bindings and overrides' },
  { id: 'providers', label: 'Integrations', caption: 'Tool health, orchestration phases, and tracking' },
  { id: 'about', label: 'About', caption: 'Version, updates, and project links' },
];

type PreferenceDraft = {
  soundOnSessionWaiting: boolean;
  notificationsDesktop: boolean;
  sessionHistoryEnabled: boolean;
  insightsEnabled: boolean;
  autoTitleEnabled: boolean;
  defaultProvider: ProviderId;
  language: UiLanguage;
  debugMode: boolean;
  sidebarViews: {
    configSections: boolean;
    gitPanel: boolean;
    sessionHistory: boolean;
    costFooter: boolean;
  };
};

function createPreferenceDraft(): PreferenceDraft {
  return {
    soundOnSessionWaiting: appState.preferences.soundOnSessionWaiting,
    notificationsDesktop: appState.preferences.notificationsDesktop,
    sessionHistoryEnabled: appState.preferences.sessionHistoryEnabled,
    insightsEnabled: appState.preferences.insightsEnabled,
    autoTitleEnabled: appState.preferences.autoTitleEnabled,
    defaultProvider: appState.preferences.defaultProvider ?? 'claude',
    language: appState.preferences.language ?? 'en',
    debugMode: appState.preferences.debugMode,
    sidebarViews: {
      configSections: appState.preferences.sidebarViews?.configSections ?? true,
      gitPanel: appState.preferences.sidebarViews?.gitPanel ?? true,
      sessionHistory: appState.preferences.sidebarViews?.sessionHistory ?? true,
      costFooter: appState.preferences.sidebarViews?.costFooter ?? true,
    },
  };
}

function appendSectionIntro(container: HTMLElement, eyebrow: string, title: string, description: string): void {
  // preferences-section-intro
  appendSectionIntroLayout(container, eyebrow, title, description);
}

function appendSectionCard(container: HTMLElement, title: string, description?: string): HTMLElement {
  // preferences-section-card
  return appendSectionCardLayout(container, title, description);
}

function appendSectionGroup(
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
): HTMLElement {
  // preferences-subsection + preferences-subsection-grid
  return appendSectionGroupLayout(container, eyebrow, title, description);
}

function appendOverviewGrid(
  container: HTMLElement,
  items: Array<{ label: string; value: string; note?: string }>,
): void {
  // preferences-overview-grid
  appendOverviewGridLayout(container, items);
}

export function showPreferencesModal(): void {
  renderPreferencesModalContent();
}

function renderPreferencesModalContent(): void {
  prepareModalSurface();
  titleEl.textContent = 'Workspace Center';
  bodyEl.innerHTML = '';
  modal.classList.add('modal-wide');
  bodyEl.classList.add('preferences-body');

  const {
    menu,
    menuItems,
    content,
  } = createPreferencesModalShell({
    body: bodyEl,
    sections: PREFERENCE_SECTIONS,
  });

  // Build section content
  let currentSection: Section = 'general';
  let defaultProviderSelect: CustomSelectInstance | null = null;
  let languageSelect: CustomSelectInstance | null = null;
  let activeRecorder: { cleanup: () => void } | null = null;
  let aboutUpdateCleanup: (() => void) | null = null;
  const preferenceDraft: PreferenceDraft = createPreferenceDraft();
  const shortcutOverridesDraft: Record<string, string> = { ...(appState.preferences.keybindings ?? {}) };

  function cleanupRecorder() {
    if (activeRecorder) {
      activeRecorder.cleanup();
      activeRecorder = null;
    }
  }

  function cleanupAboutUpdateListeners() {
    if (aboutUpdateCleanup) {
      aboutUpdateCleanup();
      aboutUpdateCleanup = null;
    }
  }

  function replaceDefaultProviderSelect(select: CustomSelectInstance): void {
    if (defaultProviderSelect && defaultProviderSelect !== select) {
      defaultProviderSelect.destroy();
    }
    defaultProviderSelect = select;
  }

  function replaceLanguageSelect(select: CustomSelectInstance): void {
    if (languageSelect && languageSelect !== select) {
      languageSelect.destroy();
    }
    languageSelect = select;
  }

  function renderSection(section: Section) {
    cleanupRecorder();
    cleanupAboutUpdateListeners();
    currentSection = section;
    content.innerHTML = '';
    content.scrollTop = 0;

    // Update active menu item
    for (const [id, item] of menuItems) {
      item.classList.toggle('active', id === section);
    }

    if (section === 'general') {
      renderGeneralPreferencesSection({
        content,
        preferenceDraft,
        appendSectionIntro,
        appendOverviewGrid,
        isGeneralSectionActive: () => currentSection === 'general',
        getDefaultProviderSelect: () => defaultProviderSelect,
        replaceDefaultProviderSelect,
        replaceLanguageSelect,
      });

    } else if (section === 'layout') {
      renderLayoutPreferencesSection({
        content,
        preferenceDraft,
        appendSectionIntro,
        appendOverviewGrid,
        appendSectionCard,
      });

    } else if (section === 'shortcuts') {
      renderShortcutPreferencesContent({
        content,
        shortcutOverridesDraft,
        cleanupRecorder,
        setActiveRecorder: (cleanup) => {
          activeRecorder = { cleanup };
        },
        clearActiveRecorder: () => {
          activeRecorder = null;
        },
        rerenderShortcuts: () => renderSection('shortcuts'),
        appendSectionIntro,
        appendOverviewGrid,
      });

    } else if (section === 'providers') {
      renderProvidersPreferencesContent({
        content,
        modalBody: bodyEl,
        confirmButton: btnConfirm,
        cancelButton: btnCancel,
        registerModalCleanup: extendModalCleanup,
        currentSection: () => currentSection,
        rerenderProviders: () => renderSection('providers'),
        applySetupBadge,
        onFixProvider: fixAndRerender,
        onInstallMobileDependency: installMobileDependencyAndRerender,
        appendSectionIntro,
        appendOverviewGrid,
        appendSectionGroup,
        appendSectionCard,
        modalElement: modal,
      });

    } else if (section === 'about') {
      aboutUpdateCleanup = renderAboutPreferencesSection({
        content,
        preferenceDraft,
        appendSectionIntro,
        appendOverviewGrid,
        formatRelativeTimestamp,
      });
    }
  }

  async function fixAndRerender(providerId?: ProviderId) {
    await window.calder.settings.reinstall(providerId);
    renderSection('providers');
  }

  async function installMobileDependencyAndRerender(dependencyId: MobileDependencyId): Promise<void> {
    const result = await window.calder.mobileSetup.installDependency(dependencyId);
    if (!result.success) {
      throw new Error(result.message || 'Install command failed.');
    }
    renderSection('providers');
  }

  function applySetupBadge(hasIssue: boolean) {
    const setupItem = menuItems.get('providers');
    if (setupItem) {
      setupItem.classList.toggle('has-badge', hasIssue);
    }
  }

  async function updateSetupBadge() {
    applySetupBadge(await resolveSetupBadgeHasIssue());
  }
  updateSetupBadge();

  bindPreferencesMenuNavigation(menu, renderSection);

  // Show initial section
  renderSection('general');

  btnConfirm.textContent = 'Done';
  overlay.classList.remove('hidden');

  // Clean up previous listeners
  runModalCleanup();
  extendModalCleanup(() => {
    bodyEl.classList.remove('preferences-body');
    modal.classList.remove('modal-wide');
    btnConfirm.textContent = 'Create';
  });
  bindPreferencesModalActions({
    confirmButton: btnConfirm,
    cancelButton: btnCancel,
    modalElement: modal,
    cleanupRecorder,
    isRecorderActive: () => Boolean(activeRecorder),
    savePreferences: () => savePreferenceDraft(preferenceDraft, shortcutOverridesDraft),
    registerModalCleanup: extendModalCleanup,
  });

  extendModalCleanup(() => {
    cleanupRecorder();
    cleanupAboutUpdateListeners();
    if (defaultProviderSelect) defaultProviderSelect.destroy();
    if (languageSelect) languageSelect.destroy();
  });
}
