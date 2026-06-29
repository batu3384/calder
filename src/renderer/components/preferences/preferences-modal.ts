import type { MobileDependencyId } from '../../../shared/types/mobile.js';
import type { AppearanceTheme, ProviderId, UiLanguage } from '../../../shared/types/provider.js';
import { applyAppearanceTheme } from '../../appearance-theme.js';
import { localizeSubtree } from '../../i18n.js';
import { appState } from '../../state.js';
import type { CustomSelectInstance } from '../custom-select.js';
import { extendModalCleanup, prepareModalSurface, runModalCleanup } from '../modal.js';
import {
  appendOverviewGrid as appendOverviewGridLayout,
  appendSectionCard as appendSectionCardLayout,
  appendSectionGroup as appendSectionGroupLayout,
  appendSectionIntro as appendSectionIntroLayout,
} from './preferences-layout.js';
import { bindPreferencesModalActions, savePreferenceDraft } from './preferences-modal-actions.js';
import {
  bindPreferencesMenuNavigation,
  renderAutomationPreferencesContent,
  renderSafetyPreferencesContent,
  renderShortcutPreferencesContent,
  renderToolsPreferencesContent,
} from './preferences-modal-renderers.js';
import {
  renderAboutPreferencesSection,
  renderGeneralPreferencesSection,
  renderLayoutPreferencesSection,
} from './preferences-modal-sections.js';
import { createPreferencesModalShell } from './preferences-modal-shell.js';
import { resolveSetupBadgeHasIssue } from './preferences-provider-setup.js';
import { formatRelativeTimestamp } from './preferences-time.js';

const overlay = document.getElementById('modal-overlay')!;
const modal = document.getElementById('modal')!;
const titleEl = document.getElementById('modal-title')!;
const bodyEl = document.getElementById('modal-body')!;
const btnCancel = document.getElementById('modal-cancel') as HTMLButtonElement;
const btnConfirm = document.getElementById('modal-confirm') as HTMLButtonElement;

type Section = 'general' | 'interface' | 'tools' | 'automation' | 'safety' | 'shortcuts' | 'about';

const PREFERENCE_SECTIONS: Array<{ id: Section; label: string; caption: string }> = [
  { id: 'general', label: 'Session', caption: 'Startup, language, and session memory' },
  { id: 'interface', label: 'Interface', caption: 'Shell layout, rails, and live view behavior' },
  { id: 'tools', label: 'Tools', caption: 'CLI providers and mobile dependency health' },
  {
    id: 'automation',
    label: 'Automation',
    caption: 'Project workflows, previews, and background tasks',
  },
  { id: 'safety', label: 'Safety', caption: 'Context, governance, reviews, and checkpoints' },
  { id: 'shortcuts', label: 'Keys', caption: 'Command bindings and overrides' },
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
  appearanceTheme: AppearanceTheme;
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
    appearanceTheme: appState.preferences.appearanceTheme ?? 'system',
    debugMode: appState.preferences.debugMode,
    sidebarViews: {
      configSections: appState.preferences.sidebarViews?.configSections ?? true,
      gitPanel: appState.preferences.sidebarViews?.gitPanel ?? true,
      sessionHistory: appState.preferences.sidebarViews?.sessionHistory ?? true,
      costFooter: appState.preferences.sidebarViews?.costFooter ?? true,
    },
  };
}

function appendSectionIntro(
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
): void {
  // preferences-section-intro
  appendSectionIntroLayout(container, eyebrow, title, description);
}

function appendSectionCard(
  container: HTMLElement,
  title: string,
  description?: string,
): HTMLElement {
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

type PreferencesModalState = {
  currentSection: Section;
  defaultProviderSelect: CustomSelectInstance | null;
  languageSelect: CustomSelectInstance | null;
  activeRecorder: { cleanup: () => void } | null;
  aboutUpdateCleanup: (() => void) | null;
};

function createPreferencesModalState(): PreferencesModalState {
  return {
    currentSection: 'general',
    defaultProviderSelect: null,
    languageSelect: null,
    activeRecorder: null,
    aboutUpdateCleanup: null,
  };
}

function cleanupRecorder(state: PreferencesModalState): void {
  if (!state.activeRecorder) return;
  state.activeRecorder.cleanup();
  state.activeRecorder = null;
}

function cleanupAboutUpdateListeners(state: PreferencesModalState): void {
  if (!state.aboutUpdateCleanup) return;
  state.aboutUpdateCleanup();
  state.aboutUpdateCleanup = null;
}

function replaceCustomSelect(
  current: CustomSelectInstance | null,
  next: CustomSelectInstance,
): CustomSelectInstance {
  if (current && current !== next) {
    current.destroy();
  }
  return next;
}

function setActivePreferencesMenuItem(
  menuItems: Map<Section, HTMLButtonElement>,
  section: Section,
): void {
  for (const [id, item] of menuItems) {
    item.classList.toggle('active', id === section);
  }
}

function renderPreferencesSectionById(args: {
  section: Section;
  state: PreferencesModalState;
  menuItems: Map<Section, HTMLButtonElement>;
  content: HTMLElement;
  preferenceDraft: PreferenceDraft;
  shortcutOverridesDraft: Record<string, string>;
  rerenderSection: (section: Section) => void;
  onFixProvider: (providerId?: ProviderId) => Promise<void>;
  onInstallMobileDependency: (dependencyId: MobileDependencyId) => Promise<void>;
  applySetupBadge: (hasIssue: boolean) => void;
}): void {
  cleanupRecorder(args.state);
  cleanupAboutUpdateListeners(args.state);
  args.state.currentSection = args.section;
  args.content.innerHTML = '';
  args.content.scrollTop = 0;
  setActivePreferencesMenuItem(args.menuItems, args.section);

  if (args.section === 'general') {
    renderGeneralPreferencesSection({
      content: args.content,
      preferenceDraft: args.preferenceDraft,
      appendSectionIntro,
      appendOverviewGrid,
      isGeneralSectionActive: () => args.state.currentSection === 'general',
      getDefaultProviderSelect: () => args.state.defaultProviderSelect,
      replaceDefaultProviderSelect: (select) => {
        args.state.defaultProviderSelect = replaceCustomSelect(
          args.state.defaultProviderSelect,
          select,
        );
      },
      replaceLanguageSelect: (select) => {
        args.state.languageSelect = replaceCustomSelect(args.state.languageSelect, select);
      },
    });
    return;
  }

  if (args.section === 'interface') {
    renderLayoutPreferencesSection({
      content: args.content,
      preferenceDraft: args.preferenceDraft,
      appendSectionIntro,
      appendOverviewGrid,
      appendSectionCard,
    });
    return;
  }

  if (args.section === 'tools') {
    renderToolsPreferencesContent({
      content: args.content,
      currentSection: () => args.state.currentSection,
      applySetupBadge: args.applySetupBadge,
      onFixProvider: args.onFixProvider,
      onInstallMobileDependency: args.onInstallMobileDependency,
      appendSectionIntro,
      appendOverviewGrid,
      appendSectionCard,
    });
    return;
  }

  if (args.section === 'automation') {
    renderAutomationPreferencesContent({
      content: args.content,
      modalBody: bodyEl,
      confirmButton: btnConfirm,
      cancelButton: btnCancel,
      registerModalCleanup: extendModalCleanup,
      rerenderAutomation: () => args.rerenderSection('automation'),
      appendSectionIntro,
      appendOverviewGrid,
      appendSectionGroup,
      appendSectionCard,
      modalElement: modal,
    });
    return;
  }

  if (args.section === 'safety') {
    renderSafetyPreferencesContent({
      content: args.content,
      modalBody: bodyEl,
      confirmButton: btnConfirm,
      cancelButton: btnCancel,
      registerModalCleanup: extendModalCleanup,
      rerenderSafety: () => args.rerenderSection('safety'),
      appendSectionIntro,
      appendOverviewGrid,
      appendSectionGroup,
      appendSectionCard,
      modalElement: modal,
    });
    return;
  }

  if (args.section === 'shortcuts') {
    renderShortcutPreferencesContent({
      content: args.content,
      shortcutOverridesDraft: args.shortcutOverridesDraft,
      cleanupRecorder: () => cleanupRecorder(args.state),
      setActiveRecorder: (cleanup) => {
        args.state.activeRecorder = { cleanup };
      },
      clearActiveRecorder: () => {
        args.state.activeRecorder = null;
      },
      rerenderShortcuts: () => args.rerenderSection('shortcuts'),
      appendSectionIntro,
      appendOverviewGrid,
    });
    return;
  }

  if (args.section === 'about') {
    args.state.aboutUpdateCleanup = renderAboutPreferencesSection({
      content: args.content,
      preferenceDraft: args.preferenceDraft,
      appendSectionIntro,
      appendOverviewGrid,
      formatRelativeTimestamp,
    });
  }
}

export function showPreferencesModal(): void {
  renderPreferencesModalContent();
}

function renderPreferencesModalContent(): void {
  prepareModalSurface();
  titleEl.textContent = 'Workspace Center';
  bodyEl.innerHTML = '';
  modal.classList.add('modal-wide');
  modal.classList.add('preferences-modal');
  bodyEl.classList.add('preferences-body');

  const { menu, menuItems, content } = createPreferencesModalShell({
    body: bodyEl,
    sections: PREFERENCE_SECTIONS,
  });

  const state = createPreferencesModalState();
  const preferenceDraft: PreferenceDraft = createPreferenceDraft();
  const savedAppearanceTheme = appState.preferences.appearanceTheme ?? 'system';
  const shortcutOverridesDraft: Record<string, string> = {
    ...(appState.preferences.keybindings ?? {}),
  };

  async function fixAndRerender(providerId?: ProviderId) {
    await window.calder.settings.reinstall(providerId);
    renderSection('tools');
  }

  async function installMobileDependencyAndRerender(
    dependencyId: MobileDependencyId,
  ): Promise<void> {
    const result = await window.calder.mobileSetup.installDependency(dependencyId);
    if (!result.success) {
      throw new Error(result.message || 'Install command failed.');
    }
    renderSection('tools');
  }

  function applySetupBadge(hasIssue: boolean) {
    const setupItem = menuItems.get('tools');
    if (setupItem) {
      setupItem.classList.toggle('has-badge', hasIssue);
    }
  }

  function renderSection(section: Section): void {
    renderPreferencesSectionById({
      section,
      state,
      menuItems,
      content,
      preferenceDraft,
      shortcutOverridesDraft,
      rerenderSection: renderSection,
      onFixProvider: fixAndRerender,
      onInstallMobileDependency: installMobileDependencyAndRerender,
      applySetupBadge,
    });
    localizeSubtree(content);
  }

  async function updateSetupBadge() {
    applySetupBadge(await resolveSetupBadgeHasIssue());
  }
  void updateSetupBadge();

  bindPreferencesMenuNavigation(menu, renderSection);

  // Show initial section
  renderSection('general');

  btnConfirm.textContent = 'Done';
  overlay.classList.remove('hidden');
  localizeSubtree(bodyEl);

  // Clean up previous listeners
  runModalCleanup();
  extendModalCleanup(() => {
    bodyEl.classList.remove('preferences-body');
    modal.classList.remove('preferences-modal');
    modal.classList.remove('modal-wide');
    btnConfirm.textContent = 'Create';
  });
  bindPreferencesModalActions({
    confirmButton: btnConfirm,
    cancelButton: btnCancel,
    modalElement: modal,
    cleanupRecorder: () => cleanupRecorder(state),
    isRecorderActive: () => Boolean(state.activeRecorder),
    savePreferences: () => savePreferenceDraft(preferenceDraft, shortcutOverridesDraft),
    revertPreview: () => applyAppearanceTheme(savedAppearanceTheme),
    registerModalCleanup: extendModalCleanup,
  });

  extendModalCleanup(() => {
    cleanupRecorder(state);
    cleanupAboutUpdateListeners(state);
    if (state.defaultProviderSelect) state.defaultProviderSelect.destroy();
    if (state.languageSelect) state.languageSelect.destroy();
  });
}
