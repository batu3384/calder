import { appState } from '../state.js';
import {
  closeModal,
  extendModalCleanup,
  prepareModalSurface,
  runModalCleanup,
  showModal,
} from './modal.js';
import { createCustomSelect, type CustomSelectInstance } from './custom-select.js';
import { shortcutManager } from '../shortcuts.js';
import { loadProviderAvailability, getProviderAvailabilitySnapshot } from '../provider-availability.js';
import { toProjectRelativeContextPath } from '../project-context-utils.js';
import {
  appendOverviewGrid as appendOverviewGridLayout,
  appendSectionCard as appendSectionCardLayout,
  appendSectionGroup as appendSectionGroupLayout,
  appendSectionIntro as appendSectionIntroLayout,
} from './preferences-layout.js';
import {
  resolveSetupBadgeHasIssue,
} from './preferences-provider-setup.js';
import { renderShortcutsSection } from './preferences-shortcuts-section.js';
import {
  renderAboutPreferencesSection,
  renderLayoutPreferencesSection,
  renderProvidersPreferencesSection,
} from './preferences-modal-sections.js';
import type { CliProviderMeta, ProviderId, UiLanguage } from '../../shared/types/provider.js';
import type { MobileDependencyId } from '../../shared/types/mobile.js';
import type { ProjectCheckpointDocument } from '../../shared/types/project.js';


const overlay = document.getElementById('modal-overlay')!;
const modal = document.getElementById('modal')!;
const titleEl = document.getElementById('modal-title')!;
const bodyEl = document.getElementById('modal-body')!;
const btnCancel = document.getElementById('modal-cancel') as HTMLButtonElement;
const btnConfirm = document.getElementById('modal-confirm') as HTMLButtonElement;

type Section = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about';
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

  // Build two-pane layout
  const layout = document.createElement('div');
  layout.className = 'preferences-layout preferences-shell';

  // Side menu
  const menu = document.createElement('div');
  menu.className = 'preferences-menu';

  const menuHeader = document.createElement('div');
  menuHeader.className = 'preferences-menu-header';
  menuHeader.innerHTML = `
    <div class="preferences-menu-kicker shell-kicker">Calder</div>
    <div class="preferences-menu-title">Calder workspace</div>
    <div class="preferences-menu-caption">Defaults, layout, integrations, and the rules that shape every session.</div>
  `;
  menu.appendChild(menuHeader);

  const sections: { id: Section; label: string; caption: string }[] = [
    { id: 'general', label: 'Session', caption: 'How Calder starts and remembers work' },
    { id: 'layout', label: 'Layout', caption: 'Surface and rail visibility defaults' },
    { id: 'shortcuts', label: 'Keys', caption: 'Command bindings and overrides' },
    { id: 'providers', label: 'Integrations', caption: 'Tool health, orchestration phases, and tracking' },
    { id: 'about', label: 'About', caption: 'Version, updates, and project links' },
  ];

  const menuItems: Map<Section, HTMLButtonElement> = new Map();
  for (const section of sections) {
    const item = document.createElement('button');
    item.className = 'preferences-menu-item';
    item.type = 'button';
    item.dataset.section = section.id;
    item.innerHTML = `
      <span class="preferences-menu-item-label">${section.label}</span>
      <span class="preferences-menu-item-caption">${section.caption}</span>
    `;
    menu.appendChild(item);
    menuItems.set(section.id, item);
  }

  // Content area
  const contentShell = document.createElement('div');
  contentShell.className = 'preferences-content-shell';

  const content = document.createElement('div');
  content.className = 'preferences-content preferences-section';

  layout.appendChild(menu);
  contentShell.appendChild(content);
  layout.appendChild(contentShell);
  bodyEl.appendChild(layout);

  // Build section content
  let currentSection: Section = 'general';
  let soundCheckbox: HTMLInputElement | null = null;
  let notificationsCheckbox: HTMLInputElement | null = null;
  let historyCheckbox: HTMLInputElement | null = null;
  let insightsCheckbox: HTMLInputElement | null = null;
  let autoTitleCheckbox: HTMLInputElement | null = null;
  let defaultProviderSelect: CustomSelectInstance | null = null;
  let languageSelect: CustomSelectInstance | null = null;
  let activeRecorder: { cleanup: () => void } | null = null;
  let aboutUpdateCleanup: (() => void) | null = null;
  const preferenceDraft: {
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
  } = {
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
  const shortcutOverridesDraft: Record<string, string> = { ...(appState.preferences.keybindings ?? {}) };

  function formatCountLabel(count: number, singular: string, plural: string): string {
    return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
  }

  function resolveProjectFilePath(projectPath: string, filePath: string): string {
    if (!filePath) return projectPath;
    if (/^(?:[A-Za-z]:[\\/]|\/)/.test(filePath)) {
      return filePath.replace(/\\/g, '/');
    }
    const normalizedProject = projectPath.replace(/[\\/]+$/, '');
    const normalizedFile = filePath.replace(/^[\\/]+/, '').replace(/\\/g, '/');
    return `${normalizedProject}/${normalizedFile}`;
  }

  function formatRelativeTimestamp(timestamp?: string): string {
    if (!timestamp) return 'No sync yet';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'No sync yet';
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) {
      return `Updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffMs < 60_000) return 'Updated just now';
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Updated ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Updated ${diffDays}d ago`;
    return `Updated ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }

  function appendCheckpointRestoreFact(container: HTMLElement, label: string, value: string) {
    const row = document.createElement('div');
    row.className = 'checkpoint-restore-confirm-fact';

    const labelEl = document.createElement('div');
    labelEl.className = 'checkpoint-restore-confirm-fact-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'checkpoint-restore-confirm-fact-value';
    valueEl.textContent = value;

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    container.appendChild(row);
  }

  function buildCheckpointRestoreConfirm(
    projectId: string,
    projectPath: string,
    checkpointDocument: ProjectCheckpointDocument,
    restoreSummaryText: string,
  ): HTMLElement {
    const sessionKinds = checkpointDocument.sessions.reduce((counts, session) => {
      const type = session.type ?? 'claude';
      counts.set(type, (counts.get(type) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());

    const sessionParts = [
      sessionKinds.get('claude') ? formatCountLabel(sessionKinds.get('claude')!, 'CLI session', 'CLI sessions') : null,
      sessionKinds.get('browser-tab') ? formatCountLabel(sessionKinds.get('browser-tab')!, 'browser surface', 'browser surfaces') : null,
      sessionKinds.get('file-reader') ? formatCountLabel(sessionKinds.get('file-reader')!, 'file view', 'file views') : null,
      sessionKinds.get('diff-viewer') ? formatCountLabel(sessionKinds.get('diff-viewer')!, 'diff view', 'diff views') : null,
      sessionKinds.get('remote-terminal') ? formatCountLabel(sessionKinds.get('remote-terminal')!, 'remote session', 'remote sessions') : null,
      sessionKinds.get('mcp-inspector') ? formatCountLabel(sessionKinds.get('mcp-inspector')!, 'inspector', 'inspectors') : null,
    ].filter((entry): entry is string => Boolean(entry));

    const gitSummary = checkpointDocument.git.isGitRepo
      ? [
          checkpointDocument.git.branch ?? 'Detached HEAD',
          formatCountLabel(checkpointDocument.changedFileCount, 'changed file', 'changed files'),
        ].join(' · ')
      : 'Git metadata unavailable';

    const surfaceSummary = checkpointDocument.surface
      ? checkpointDocument.surface.kind === 'web'
        ? `Live View${checkpointDocument.surface.webUrl ? ` · ${checkpointDocument.surface.webUrl}` : ''}`
        : `CLI Surface${checkpointDocument.surface.cliStatus ? ` · ${checkpointDocument.surface.cliStatus}` : ''}`
      : 'No focused surface snapshot';

    const contextSummary = checkpointDocument.projectContext
      ? [
          formatCountLabel(checkpointDocument.projectContext.sharedRuleCount, 'shared rule', 'shared rules'),
          formatCountLabel(checkpointDocument.projectContext.providerSourceCount, 'provider source', 'provider sources'),
        ].join(' · ')
      : 'No shared project context snapshot';

    const workflowSummary = checkpointDocument.projectWorkflows
      ? formatCountLabel(checkpointDocument.projectWorkflows.workflowCount, 'workflow', 'workflows')
      : 'No workflow snapshot';

    const teamContextSummary = checkpointDocument.projectTeamContext
      ? [
          formatCountLabel(checkpointDocument.projectTeamContext.spaceCount, 'shared space', 'shared spaces'),
          formatCountLabel(checkpointDocument.projectTeamContext.sharedRuleCount, 'shared rule', 'shared rules'),
          formatCountLabel(checkpointDocument.projectTeamContext.workflowCount, 'workflow', 'workflows'),
        ].join(' · ')
      : 'No team context snapshot';

    const confirm = document.createElement('div');
    confirm.className = 'checkpoint-restore-confirm';

    const intro = document.createElement('div');
    intro.className = 'checkpoint-restore-confirm-copy';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'checkpoint-restore-confirm-kicker shell-kicker';
    eyebrow.textContent = 'Checkpoint restore';
    intro.appendChild(eyebrow);

    const title = document.createElement('div');
    title.className = 'checkpoint-restore-confirm-title';
    title.textContent = checkpointDocument.label;
    intro.appendChild(title);

    const description = document.createElement('div');
    description.className = 'checkpoint-restore-confirm-description';
    description.textContent = restoreSummaryText;
    intro.appendChild(description);
    confirm.appendChild(intro);

    const stats = document.createElement('div');
    stats.className = 'checkpoint-restore-confirm-stats';
    for (const stat of [
      { label: 'Saved', value: new Date(checkpointDocument.createdAt).toLocaleString() },
      { label: 'Sessions', value: formatCountLabel(checkpointDocument.sessionCount, 'session', 'sessions') },
      { label: 'Changed files', value: String(checkpointDocument.changedFileCount) },
    ]) {
      const statCard = document.createElement('div');
      statCard.className = 'checkpoint-restore-confirm-stat';

      const statLabel = document.createElement('div');
      statLabel.className = 'checkpoint-restore-confirm-stat-label';
      statLabel.textContent = stat.label;

      const statValue = document.createElement('div');
      statValue.className = 'checkpoint-restore-confirm-stat-value';
      statValue.textContent = stat.value;

      statCard.appendChild(statLabel);
      statCard.appendChild(statValue);
      stats.appendChild(statCard);
    }
    confirm.appendChild(stats);

    const facts = document.createElement('div');
    facts.className = 'checkpoint-restore-confirm-facts';
    appendCheckpointRestoreFact(
      facts,
      'Restores',
      sessionParts.length > 0 ? sessionParts.join(', ') : 'Saved session state',
    );
    appendCheckpointRestoreFact(facts, 'Surface', surfaceSummary);
    appendCheckpointRestoreFact(facts, 'Git', gitSummary);
    appendCheckpointRestoreFact(facts, 'Shared context', contextSummary);
    appendCheckpointRestoreFact(facts, 'Team context', teamContextSummary);
    appendCheckpointRestoreFact(facts, 'Workflows', workflowSummary);
    appendCheckpointRestoreFact(
      facts,
      'Restore modes',
      'Additive keeps your current work open. Replace swaps the current layout for this checkpoint.',
    );
    confirm.appendChild(facts);

    if (checkpointDocument.git.changedFiles.length > 0) {
      const changedFiles = checkpointDocument.git.changedFiles.slice(0, 5);
      const fileBlock = document.createElement('div');
      fileBlock.className = 'checkpoint-restore-confirm-file-block';

      const fileTitle = document.createElement('div');
      fileTitle.className = 'checkpoint-restore-confirm-fact-label';
      fileTitle.textContent = 'Changed files snapshot';
      fileBlock.appendChild(fileTitle);

      const fileList = document.createElement('div');
      fileList.className = 'checkpoint-restore-confirm-file-list';

      for (const file of changedFiles) {
        const fileItem = document.createElement('button');
        fileItem.className = 'checkpoint-restore-confirm-file-item';
        fileItem.type = 'button';

        const status = document.createElement('span');
        status.className = 'checkpoint-restore-confirm-file-status';
        status.textContent = `${file.status} · ${file.area}`;

        const filePath = document.createElement('span');
        filePath.className = 'checkpoint-restore-confirm-file-path';
        filePath.textContent = file.path;

        fileItem.addEventListener('click', () => {
          const resolvedPath = resolveProjectFilePath(projectPath, file.path);
          if (file.area === 'untracked') {
            appState.addFileReaderSession(projectId, resolvedPath);
          } else {
            appState.addDiffViewerSession(projectId, resolvedPath, file.area, checkpointDocument.project.path);
          }
          closeModal();
          modal.classList.remove('modal-wide');
        });

        fileItem.appendChild(status);
        fileItem.appendChild(filePath);
        fileList.appendChild(fileItem);
      }

      if (checkpointDocument.git.changedFiles.length > changedFiles.length) {
        const more = document.createElement('div');
        more.className = 'checkpoint-restore-confirm-file-more';
        more.textContent = `+${checkpointDocument.git.changedFiles.length - changedFiles.length} more saved file change${checkpointDocument.git.changedFiles.length - changedFiles.length === 1 ? '' : 's'}`;
        fileList.appendChild(more);
      }

      fileBlock.appendChild(fileList);
      confirm.appendChild(fileBlock);
    }

    return confirm;
  }

  function countCustomizedShortcuts(): number {
    let count = 0;
    for (const [, shortcuts] of shortcutManager.getAll(shortcutOverridesDraft)) {
      for (const shortcut of shortcuts) {
        if (shortcutManager.hasOverride(shortcut.id, shortcutOverridesDraft)) count += 1;
      }
    }
    return count;
  }

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
      // Default provider dropdown
      const providerRow = document.createElement('div');
      providerRow.className = 'modal-toggle-field';

      const providerLabel = document.createElement('label');
      providerLabel.textContent = 'Default coding tool';

      const currentDefault = preferenceDraft.defaultProvider;

      const buildProviderOptions = (snapshot: { providers: CliProviderMeta[]; availability: Map<ProviderId, boolean> }) =>
        snapshot.providers.map(provider => {
          const available = snapshot.availability.get(provider.id) ?? true;
          return {
            value: provider.id,
            label: available ? provider.displayName : `${provider.displayName} (not installed)`,
            disabled: !available,
          };
        });

      const buildProviderNote = (snapshot: { availability: Map<ProviderId, boolean> } | null, providerId: ProviderId): string => {
        if (!snapshot) return 'Calder falls back to the next installed tool if this one is missing.';
        if (snapshot.availability.get(providerId)) {
          return 'New sessions use this tool unless a workflow picks a different one.';
        }
        return 'This default is not installed on this Mac. Calder will fall back to the next installed tool until you install it.';
      };

      let snapshot = getProviderAvailabilitySnapshot();
      if (snapshot) {
        defaultProviderSelect = createCustomSelect('pref-default-provider', buildProviderOptions(snapshot), currentDefault);
        preferenceDraft.defaultProvider = defaultProviderSelect.getValue() as ProviderId;
      } else {
        defaultProviderSelect = createCustomSelect('pref-default-provider', [{ value: currentDefault, label: 'Loading…' }], currentDefault);
        loadProviderAvailability().then(() => {
          if (currentSection !== 'general') return;
          snapshot = getProviderAvailabilitySnapshot();
          if (snapshot) {
            if (defaultProviderSelect) defaultProviderSelect.destroy();
            defaultProviderSelect = createCustomSelect(
              'pref-default-provider',
              buildProviderOptions(snapshot),
              preferenceDraft.defaultProvider,
            );
            providerRow.querySelector('.custom-select')?.remove();
            providerRow.appendChild(defaultProviderSelect.element);
            preferenceDraft.defaultProvider = defaultProviderSelect.getValue() as ProviderId;
            providerNote.textContent = buildProviderNote(snapshot, preferenceDraft.defaultProvider);
            defaultProviderSelect.element.addEventListener('change', () => {
              if (!defaultProviderSelect) return;
              preferenceDraft.defaultProvider = defaultProviderSelect.getValue() as ProviderId;
              providerNote.textContent = buildProviderNote(snapshot, preferenceDraft.defaultProvider);
            });
          }
        });
      }

      const providerNote = document.createElement('div');
      providerNote.className = 'preferences-control-note';
      providerNote.textContent = buildProviderNote(snapshot, preferenceDraft.defaultProvider);

      defaultProviderSelect.element.addEventListener('change', () => {
        if (!defaultProviderSelect) return;
        preferenceDraft.defaultProvider = defaultProviderSelect.getValue() as ProviderId;
        providerNote.textContent = buildProviderNote(snapshot, preferenceDraft.defaultProvider);
      });

      providerRow.appendChild(providerLabel);
      providerRow.appendChild(defaultProviderSelect.element);
      content.appendChild(providerRow);
      content.appendChild(providerNote);

      const languageRow = document.createElement('div');
      languageRow.className = 'modal-toggle-field';

      const languageLabel = document.createElement('label');
      languageLabel.textContent = 'Interface language';

      const currentLanguage = preferenceDraft.language;
      languageSelect = createCustomSelect(
        'pref-language',
        [
          { value: 'en', label: 'English' },
          { value: 'tr', label: 'Turkish' },
        ],
        currentLanguage,
      );

      const languageNote = document.createElement('div');
      languageNote.className = 'preferences-control-note';
      languageNote.textContent = 'Language changes apply after the interface refreshes.';

      languageRow.appendChild(languageLabel);
      languageRow.appendChild(languageSelect.element);
      content.appendChild(languageRow);
      content.appendChild(languageNote);
      languageSelect.element.addEventListener('change', () => {
        if (!languageSelect) return;
        preferenceDraft.language = languageSelect.getValue() as UiLanguage;
      });

      const row = document.createElement('div');
      row.className = 'modal-toggle-field';

      const label = document.createElement('label');
      label.htmlFor = 'pref-sound-on-waiting';
      label.textContent = 'Play sound when session finishes work';

      soundCheckbox = document.createElement('input');
      soundCheckbox.type = 'checkbox';
      soundCheckbox.id = 'pref-sound-on-waiting';
      soundCheckbox.checked = preferenceDraft.soundOnSessionWaiting;
      soundCheckbox.addEventListener('change', () => {
        if (!soundCheckbox) return;
        preferenceDraft.soundOnSessionWaiting = soundCheckbox.checked;
      });

      row.appendChild(label);
      row.appendChild(soundCheckbox);
      content.appendChild(row);

      const notifRow = document.createElement('div');
      notifRow.className = 'modal-toggle-field';

      const notifLabel = document.createElement('label');
      notifLabel.htmlFor = 'pref-notifications-desktop';
      notifLabel.textContent = 'Desktop notifications when sessions need attention';

      notificationsCheckbox = document.createElement('input');
      notificationsCheckbox.type = 'checkbox';
      notificationsCheckbox.id = 'pref-notifications-desktop';
      notificationsCheckbox.checked = preferenceDraft.notificationsDesktop;
      notificationsCheckbox.addEventListener('change', () => {
        if (!notificationsCheckbox) return;
        preferenceDraft.notificationsDesktop = notificationsCheckbox.checked;
      });

      notifRow.appendChild(notifLabel);
      notifRow.appendChild(notificationsCheckbox);
      content.appendChild(notifRow);

      const historyRow = document.createElement('div');
      historyRow.className = 'modal-toggle-field';

      const historyLabel = document.createElement('label');
      historyLabel.htmlFor = 'pref-session-history';
      historyLabel.textContent = 'Record session history when sessions close';

      historyCheckbox = document.createElement('input');
      historyCheckbox.type = 'checkbox';
      historyCheckbox.id = 'pref-session-history';
      historyCheckbox.checked = preferenceDraft.sessionHistoryEnabled;
      historyCheckbox.addEventListener('change', () => {
        if (!historyCheckbox) return;
        preferenceDraft.sessionHistoryEnabled = historyCheckbox.checked;
      });

      historyRow.appendChild(historyLabel);
      historyRow.appendChild(historyCheckbox);
      content.appendChild(historyRow);

      const insightsRow = document.createElement('div');
      insightsRow.className = 'modal-toggle-field';

      const insightsLabel = document.createElement('label');
      insightsLabel.htmlFor = 'pref-insights-enabled';
      insightsLabel.textContent = 'Show insight alerts';

      insightsCheckbox = document.createElement('input');
      insightsCheckbox.type = 'checkbox';
      insightsCheckbox.id = 'pref-insights-enabled';
      insightsCheckbox.checked = preferenceDraft.insightsEnabled;
      insightsCheckbox.addEventListener('change', () => {
        if (!insightsCheckbox) return;
        preferenceDraft.insightsEnabled = insightsCheckbox.checked;
      });

      insightsRow.appendChild(insightsLabel);
      insightsRow.appendChild(insightsCheckbox);
      content.appendChild(insightsRow);

      const autoTitleRow = document.createElement('div');
      autoTitleRow.className = 'modal-toggle-field';

      const autoTitleLabel = document.createElement('label');
      autoTitleLabel.htmlFor = 'pref-auto-title';
      autoTitleLabel.textContent = 'Auto-name sessions from conversation title';

      autoTitleCheckbox = document.createElement('input');
      autoTitleCheckbox.type = 'checkbox';
      autoTitleCheckbox.id = 'pref-auto-title';
      autoTitleCheckbox.checked = preferenceDraft.autoTitleEnabled;
      autoTitleCheckbox.addEventListener('change', () => {
        if (!autoTitleCheckbox) return;
        preferenceDraft.autoTitleEnabled = autoTitleCheckbox.checked;
      });

      autoTitleRow.appendChild(autoTitleLabel);
      autoTitleRow.appendChild(autoTitleCheckbox);
      content.appendChild(autoTitleRow);

    } else if (section === 'layout') {
      renderLayoutPreferencesSection({
        content,
        preferenceDraft,
        appendSectionIntro,
        appendOverviewGrid,
        appendSectionCard,
      });

    } else if (section === 'shortcuts') {
      appendSectionIntro(
        content,
        'Keyboard',
        'Working keys',
        'Keep the shortcuts you use every day close to hand and override only the ones that really help.',
      );
      appendOverviewGrid(content, [
        {
          label: 'Customized',
          value: `${countCustomizedShortcuts()}`,
          note: 'Only explicit overrides are tracked here.',
        },
        {
          label: 'Focus',
          value: 'Session + surface',
          note: 'Bindings cover sessions, the left stage, and shell navigation.',
        },
        {
          label: 'Style',
          value: 'Command-first',
          note: 'Record a new combo directly from the keyboard when you need one.',
        },
      ]);
      renderShortcutsSection({
        container: content,
        shortcutOverridesDraft,
        cleanupRecorder,
        setActiveRecorder: (cleanup) => {
          activeRecorder = { cleanup };
        },
        clearActiveRecorder: () => {
          activeRecorder = null;
        },
        rerenderShortcuts: () => renderSection('shortcuts'),
      });

    } else if (section === 'providers') {
      renderProvidersPreferencesSection({
        content,
        appendSectionIntro,
        appendOverviewGrid,
        appendSectionGroup,
        appendSectionCard,
        closeWideModal: () => {
          closeModal();
          modal.classList.remove('modal-wide');
        },
        rerenderProviders: () => renderSection('providers'),
        modalBody: bodyEl,
        confirmButton: btnConfirm,
        cancelButton: btnCancel,
        registerModalCleanup: extendModalCleanup,
        buildCheckpointRestoreConfirm,
        isProvidersSectionActive: () => currentSection === 'providers',
        onApplySetupBadge: applySetupBadge,
        onFixProvider: fixAndRerender,
        onInstallMobileDependency: installMobileDependencyAndRerender,
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

  // Menu click handler
  menu.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.preferences-menu-item') as HTMLElement | null;
    if (target && target.dataset.section) {
      renderSection(target.dataset.section as Section);
    }
  });

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

  const save = () => {
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
    if (preferenceDraft.debugMode !== appState.preferences.debugMode) {
      appState.setPreference('debugMode', preferenceDraft.debugMode);
      window.calder.menu.rebuild(preferenceDraft.debugMode);
    }
  };

  const handleConfirm = () => {
    cleanupRecorder();
    save();
    closeModal();
    modal.classList.remove('modal-wide');
    btnConfirm.textContent = 'Create';
  };

  const handleCancel = () => {
    cleanupRecorder();
    closeModal();
    modal.classList.remove('modal-wide');
    btnConfirm.textContent = 'Create';
  };

  const handleKeydown = (e: KeyboardEvent) => {
    // Don't intercept if we're recording a shortcut
    if (activeRecorder) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  btnConfirm.addEventListener('click', handleConfirm);
  btnCancel.addEventListener('click', handleCancel);
  document.addEventListener('keydown', handleKeydown);

  extendModalCleanup(() => {
    cleanupRecorder();
    cleanupAboutUpdateListeners();
    if (defaultProviderSelect) defaultProviderSelect.destroy();
    if (languageSelect) languageSelect.destroy();
    btnConfirm.removeEventListener('click', handleConfirm);
    btnCancel.removeEventListener('click', handleCancel);
    document.removeEventListener('keydown', handleKeydown);
  });
}
