import { appState } from '../state.js';
import { closeModal, prepareModalSurface } from './modal.js';
import { createCustomSelect, type CustomSelectInstance } from './custom-select.js';
import { shortcutManager, displayKeys, eventToAccelerator } from '../shortcuts.js';
import { loadProviderAvailability, getProviderAvailabilitySnapshot } from '../provider-availability.js';
import type { CliProviderMeta, ProviderId, SettingsValidationResult } from '../../shared/types.js';
import { isTrackingHealthy } from '../../shared/tracking-health.js';


const overlay = document.getElementById('modal-overlay')!;
const modal = document.getElementById('modal')!;
const titleEl = document.getElementById('modal-title')!;
const bodyEl = document.getElementById('modal-body')!;
const btnCancel = document.getElementById('modal-cancel')!;
const btnConfirm = document.getElementById('modal-confirm')!;

type Section = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about';

export function showPreferencesModal(): void {
  prepareModalSurface();
  titleEl.textContent = 'Workspace Center';
  bodyEl.innerHTML = '';
  modal.classList.add('modal-wide');

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
    { id: 'providers', label: 'Integrations', caption: 'Tool health, binaries, and tracking' },
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
  let debugModeCheckbox: HTMLInputElement | null = null;
  let sidebarCheckboxes: { configSections: HTMLInputElement; gitPanel: HTMLInputElement; sessionHistory: HTMLInputElement; costFooter: HTMLInputElement } | null = null;
  let activeRecorder: { cleanup: () => void } | null = null;

  function appendSectionIntro(container: HTMLElement, eyebrow: string, title: string, description: string) {
    const intro = document.createElement('div');
    intro.className = 'preferences-section-intro';
    intro.innerHTML = `
      <div class="preferences-section-eyebrow shell-kicker">${eyebrow}</div>
      <div class="preferences-section-title">${title}</div>
      <div class="preferences-section-description">${description}</div>
    `;
    container.appendChild(intro);
  }

  function appendSectionCard(container: HTMLElement, title: string, description?: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'preferences-section-card';

    const heading = document.createElement('div');
    heading.className = 'preferences-card-heading';
    heading.textContent = title;
    card.appendChild(heading);

    if (description) {
      const copy = document.createElement('div');
      copy.className = 'preferences-card-copy';
      copy.textContent = description;
      card.appendChild(copy);
    }

    container.appendChild(card);
    return card;
  }

  function appendOverviewGrid(
    container: HTMLElement,
    items: Array<{ label: string; value: string; note?: string }>,
  ) {
    const grid = document.createElement('div');
    grid.className = 'preferences-overview-grid';

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'preferences-overview-card';
      card.innerHTML = `
        <div class="preferences-overview-label">${item.label}</div>
        <div class="preferences-overview-value">${item.value}</div>
        ${item.note ? `<div class="preferences-overview-note">${item.note}</div>` : ''}
      `;
      grid.appendChild(card);
    }

    container.appendChild(grid);
  }

  function renderProjectContextSection(container: HTMLElement) {
    const card = appendSectionCard(
      container,
      'Project context',
      'Calder discovers provider-native memory and shared project rules for the active repo without replacing each CLI tool’s own history.',
    );

    const shell = document.createElement('div');
    shell.className = 'context-discovery-shell';
    card.appendChild(shell);

    const project = appState.activeProject;
    if (!project) {
      const empty = document.createElement('div');
      empty.className = 'context-discovery-empty';
      empty.textContent = 'Open a project to inspect provider-native memory and shared project rules.';
      shell.appendChild(empty);
      return;
    }

    const projectContext = project.projectContext;
    if (!projectContext || projectContext.sources.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'context-discovery-empty';
      empty.textContent = 'No provider-native memory or shared project rules have been discovered for this repo yet.';
      shell.appendChild(empty);
      return;
    }

    const providerMemoryCount = projectContext.sources.filter((source) => source.provider !== 'shared').length;
    const summary = document.createElement('div');
    summary.className = 'context-discovery-summary';
    summary.innerHTML = `
      <div class="context-discovery-stat">
        <span class="context-discovery-stat-label">Project</span>
        <span class="context-discovery-stat-value">${project.name}</span>
      </div>
      <div class="context-discovery-stat">
        <span class="context-discovery-stat-label">Provider memory</span>
        <span class="context-discovery-stat-value">${providerMemoryCount}</span>
      </div>
      <div class="context-discovery-stat">
        <span class="context-discovery-stat-label">Shared rules</span>
        <span class="context-discovery-stat-value">${projectContext.sharedRuleCount}</span>
      </div>
    `;
    shell.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'context-discovery-list';
    for (const source of projectContext.sources.slice(0, 6)) {
      const item = document.createElement('div');
      item.className = 'context-discovery-item';

      const title = document.createElement('div');
      title.className = 'context-discovery-item-title';
      title.textContent = source.displayName;

      const meta = document.createElement('div');
      meta.className = 'context-discovery-item-meta';
      const scopeLabel = source.provider === 'shared' ? 'Shared rule' : `${source.provider} memory`;
      meta.textContent = source.summary
        ? `${scopeLabel} · ${source.summary}`
        : scopeLabel;

      item.appendChild(title);
      item.appendChild(meta);
      list.appendChild(item);
    }

    shell.appendChild(list);
  }

  function countCustomizedShortcuts(): number {
    let count = 0;
    for (const [, shortcuts] of shortcutManager.getAll()) {
      for (const shortcut of shortcuts) {
        if (shortcutManager.hasOverride(shortcut.id)) count += 1;
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

  function renderSection(section: Section) {
    cleanupRecorder();
    currentSection = section;
    content.innerHTML = '';

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
          label: 'Default tool',
          value: appState.preferences.defaultProvider ?? 'claude',
          note: 'Used when a new session has no explicit provider.',
        },
        {
          label: 'History',
          value: appState.preferences.sessionHistoryEnabled ? 'On' : 'Off',
          note: 'Closed sessions can stay searchable in the run log.',
        },
        {
          label: 'Alerts',
          value: appState.preferences.notificationsDesktop ? 'Desktop' : 'In-app only',
          note: 'Sound and notification behavior stays local to this workspace.',
        },
      ]);
      // Default provider dropdown
      const providerRow = document.createElement('div');
      providerRow.className = 'modal-toggle-field';

      const providerLabel = document.createElement('label');
      providerLabel.textContent = 'Default coding tool';

      const currentDefault = appState.preferences.defaultProvider ?? 'claude';

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
      } else {
        defaultProviderSelect = createCustomSelect('pref-default-provider', [{ value: currentDefault, label: 'Loading…' }], currentDefault);
        loadProviderAvailability().then(() => {
          if (currentSection !== 'general') return;
          snapshot = getProviderAvailabilitySnapshot();
          if (snapshot) {
            if (defaultProviderSelect) defaultProviderSelect.destroy();
            defaultProviderSelect = createCustomSelect('pref-default-provider', buildProviderOptions(snapshot), currentDefault);
            providerRow.querySelector('.custom-select')?.remove();
            providerRow.appendChild(defaultProviderSelect.element);
            providerNote.textContent = buildProviderNote(snapshot, currentDefault);
          }
        });
      }

      const providerNote = document.createElement('div');
      providerNote.className = 'preferences-control-note';
      providerNote.textContent = buildProviderNote(snapshot, currentDefault);

      providerRow.appendChild(providerLabel);
      providerRow.appendChild(defaultProviderSelect.element);
      content.appendChild(providerRow);
      content.appendChild(providerNote);

      const row = document.createElement('div');
      row.className = 'modal-toggle-field';

      const label = document.createElement('label');
      label.htmlFor = 'pref-sound-on-waiting';
      label.textContent = 'Play sound when session finishes work';

      soundCheckbox = document.createElement('input');
      soundCheckbox.type = 'checkbox';
      soundCheckbox.id = 'pref-sound-on-waiting';
      soundCheckbox.checked = appState.preferences.soundOnSessionWaiting;

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
      notificationsCheckbox.checked = appState.preferences.notificationsDesktop;

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
      historyCheckbox.checked = appState.preferences.sessionHistoryEnabled;

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
      insightsCheckbox.checked = appState.preferences.insightsEnabled;

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
      autoTitleCheckbox.checked = appState.preferences.autoTitleEnabled;

      autoTitleRow.appendChild(autoTitleLabel);
      autoTitleRow.appendChild(autoTitleCheckbox);
      content.appendChild(autoTitleRow);

    } else if (section === 'layout') {
      appendSectionIntro(
        content,
        'Workspace',
        'Stage layout',
        'Keep the left surface stable while deciding which support modules stay visible around active sessions.',
      );
      const views = appState.preferences.sidebarViews ?? { configSections: true, gitPanel: true, sessionHistory: true, costFooter: true };
      appendOverviewGrid(content, [
        {
          label: 'Ops rail',
          value: `${Object.values(views).filter(Boolean).length - (views.costFooter ? 1 : 0)} modules`,
          note: 'The right-side support column stays focused when you trim unused tools.',
        },
        {
          label: 'Surface split',
          value: 'Pinned left',
          note: 'Browser and CLI surfaces keep the project visible while sessions change on the right.',
        },
        {
          label: 'Session strip',
          value: views.costFooter ? 'Cost chip visible' : 'Cost chip hidden',
          note: 'Session chrome stays compact until you need more context.',
        },
      ]);
      const toggles: Array<{ key: keyof typeof views; label: string; group: 'ops' | 'session' }> = [
        { key: 'configSections', label: 'Toolkit', group: 'ops' },
        { key: 'gitPanel', label: 'Git', group: 'ops' },
        { key: 'sessionHistory', label: 'Run log', group: 'ops' },
        { key: 'costFooter', label: 'Spend chip', group: 'session' },
      ];

      const opsCard = appendSectionCard(
        content,
        'Ops Rail modules',
        'Choose which support modules stay visible in the right-side operations rail.',
      );
      const liveViewCard = appendSectionCard(
        content,
        'Live View behavior',
        'Live View stays anchored on the left when a browser session is open so page context never disappears.',
      );
      const sessionDeckCard = appendSectionCard(
        content,
        'Session Deck defaults',
        'Tune the shared AI work area and the strip above active sessions.',
      );

      const checkboxes: Record<string, HTMLInputElement> = {};
      for (const toggle of toggles) {
        const row = document.createElement('div');
        row.className = 'modal-toggle-field';

        const label = document.createElement('label');
        label.htmlFor = `pref-sidebar-${toggle.key}`;
        label.textContent = toggle.label;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `pref-sidebar-${toggle.key}`;
        cb.checked = views[toggle.key];

        row.appendChild(label);
        row.appendChild(cb);
        if (toggle.group === 'ops') {
          opsCard.appendChild(row);
        } else {
          sessionDeckCard.appendChild(row);
        }
        checkboxes[toggle.key] = cb;
      }

      const pinnedNote = document.createElement('div');
      pinnedNote.className = 'preferences-card-note';
      pinnedNote.textContent = 'Browser sessions automatically hold the left stage so inspection and handoff stay visible while you work.';
      liveViewCard.appendChild(pinnedNote);

      sidebarCheckboxes = checkboxes as typeof sidebarCheckboxes;

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
      renderShortcutsSection(content);

    } else if (section === 'providers') {
      appendSectionIntro(
        content,
        'Integrations',
        'Tool connections',
        'Check binaries, hooks, and tracking health without leaving the workspace.',
      );
      appendOverviewGrid(content, [
        {
          label: 'Checks',
          value: 'Live',
          note: 'Binary status and tracking checks are refreshed from the local setup.',
        },
        {
          label: 'Tracking',
          value: 'Status line + hooks',
          note: 'Cost, context, and session activity depend on these staying healthy.',
        },
        {
          label: 'Scope',
          value: 'All coding tools',
          note: 'Claude, Codex, Gemini, Qwen, and the rest share one health view.',
        },
      ]);
      renderProjectContextSection(content);
      renderSetupSection(content);

    } else if (section === 'about') {
      appendSectionIntro(
        content,
        'Project',
        'Calder',
        'Version details, update checks, and source links for the current build.',
      );
      appendOverviewGrid(content, [
        {
          label: 'Channel',
          value: 'Desktop app',
          note: 'This workspace is tuned for side-by-side surface and session work.',
        },
        {
          label: 'Source',
          value: 'Open source',
          note: 'The repo and issue tracker stay one click away.',
        },
        {
          label: 'Updates',
          value: 'Manual check',
          note: 'Run a direct check whenever you want to confirm a newer build.',
        },
      ]);
      const aboutDiv = document.createElement('div');
      aboutDiv.className = 'about-section';

      const aboutHero = document.createElement('div');
      aboutHero.className = 'about-hero';

      const appName = document.createElement('div');
      appName.className = 'about-app-name';
      appName.textContent = 'Calder';

      const versionLine = document.createElement('div');
      versionLine.className = 'about-version';
      versionLine.textContent = 'Version: loading...';

      const aboutLead = document.createElement('div');
      aboutLead.className = 'about-lead';
      aboutLead.textContent = 'A focused desktop workspace for browser context, CLI surfaces, and AI session flow.';

      aboutHero.appendChild(appName);
      aboutHero.appendChild(versionLine);
      aboutHero.appendChild(aboutLead);

      const updateRow = document.createElement('div');
      updateRow.className = 'about-update-row';

      const updateBtn = document.createElement('button');
      updateBtn.className = 'about-update-btn';
      updateBtn.textContent = 'Check for Updates';

      const updateStatus = document.createElement('span');
      updateStatus.className = 'about-update-status';

      updateBtn.addEventListener('click', () => {
        updateBtn.disabled = true;
        updateStatus.textContent = 'Checking...';
        window.calder.update.checkNow().then(() => {
          // If no update event fires within a few seconds, show "up to date"
          const timeout = setTimeout(() => {
            updateStatus.textContent = 'You\u2019re up to date.';
            updateBtn.disabled = false;
          }, 5000);
          const unsub = window.calder.update.onAvailable((info) => {
            clearTimeout(timeout);
            updateStatus.textContent = `Update v${info.version} available — downloading...`;
            unsub();
          });
          const unsubErr = window.calder.update.onError(() => {
            clearTimeout(timeout);
            updateStatus.textContent = 'Update check failed.';
            updateBtn.disabled = false;
            unsubErr();
          });
        }).catch(() => {
          updateStatus.textContent = 'Update check failed.';
          updateBtn.disabled = false;
        });
      });

      updateRow.appendChild(updateBtn);
      updateRow.appendChild(updateStatus);

      const linksDiv = document.createElement('div');
      linksDiv.className = 'about-links about-link-grid';

      const ghLink = document.createElement('a');
      ghLink.className = 'about-link';
      ghLink.textContent = 'GitHub';
      ghLink.href = '#';
      ghLink.addEventListener('click', (e) => { e.preventDefault(); window.calder.app.openExternal('https://github.com/batuhanyuksel/calder'); });

      const bugLink = document.createElement('a');
      bugLink.className = 'about-link';
      bugLink.textContent = 'Report a Bug';
      bugLink.href = '#';
      bugLink.addEventListener('click', (e) => { e.preventDefault(); window.calder.app.openExternal('https://github.com/batuhanyuksel/calder/issues'); });

      linksDiv.appendChild(ghLink);
      linksDiv.appendChild(bugLink);

      const communityDiv = document.createElement('div');
      communityDiv.className = 'about-community';
      communityDiv.append(
        'Calder is open source. ',
        (() => { const a = document.createElement('a'); a.className = 'about-link'; a.href = '#'; a.textContent = 'Contribute on GitHub'; a.addEventListener('click', (e) => { e.preventDefault(); window.calder.app.openExternal('https://github.com/batuhanyuksel/calder'); }); return a; })(),
        ' \u2014 and if you find it useful, give it a star!',
      );

      const debugRow = document.createElement('div');
      debugRow.className = 'modal-toggle-field';

      const debugLabel = document.createElement('label');
      debugLabel.htmlFor = 'pref-debug-mode';
      debugLabel.textContent = 'Debug Mode';

      debugModeCheckbox = document.createElement('input');
      debugModeCheckbox.type = 'checkbox';
      debugModeCheckbox.id = 'pref-debug-mode';
      debugModeCheckbox.checked = appState.preferences.debugMode;

      debugRow.appendChild(debugLabel);
      debugRow.appendChild(debugModeCheckbox);

      aboutDiv.appendChild(aboutHero);
      aboutDiv.appendChild(updateRow);
      aboutDiv.appendChild(linksDiv);
      aboutDiv.appendChild(communityDiv);
      aboutDiv.appendChild(debugRow);
      content.appendChild(aboutDiv);

      window.calder.app.getVersion().then((ver) => {
        versionLine.textContent = `Version: ${ver}`;
      });
    }
  }

  function renderShortcutsSection(container: HTMLElement) {
    const grouped = shortcutManager.getAll();

    for (const [category, shortcuts] of grouped) {
      const groupShell = document.createElement('div');
      groupShell.className = 'shortcut-group-shell';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'shortcut-group-header';

      const header = document.createElement('div');
      header.className = 'shortcut-category-header';
      header.textContent = category;

      const count = document.createElement('div');
      count.className = 'shortcut-group-count';
      count.textContent = `${shortcuts.length} commands`;

      groupHeader.appendChild(header);
      groupHeader.appendChild(count);
      groupShell.appendChild(groupHeader);

      for (const shortcut of shortcuts) {
        const row = document.createElement('div');
        row.className = 'shortcut-row shortcut-row-shell';

        const copy = document.createElement('div');
        copy.className = 'shortcut-row-copy';

        const label = document.createElement('div');
        label.className = 'shortcut-row-label';
        label.textContent = shortcut.label;

        copy.appendChild(label);

        const keyBtn = document.createElement('button');
        keyBtn.className = 'shortcut-key-btn';
        keyBtn.textContent = displayKeys(shortcut.resolvedKeys);

        const hasOverride = shortcutManager.hasOverride(shortcut.id);
        if (hasOverride) {
          keyBtn.classList.add('customized');
        }

        const resetBtn = document.createElement('button');
        resetBtn.className = 'shortcut-reset-btn';
        resetBtn.textContent = 'Reset';
        resetBtn.title = 'Reset to default';
        if (!hasOverride) {
          resetBtn.style.visibility = 'hidden';
        }

        const actions = document.createElement('div');
        actions.className = 'shortcut-row-actions';

        // Click key button to start recording
        keyBtn.addEventListener('click', () => {
          cleanupRecorder();
          keyBtn.textContent = 'Press keys...';
          keyBtn.classList.add('recording');

          const onKeydown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const accelerator = eventToAccelerator(e);
            if (!accelerator) return; // Bare modifier press

            // Save the override
            shortcutManager.setOverride(shortcut.id, accelerator);
            cleanup();
            // Re-render to update display
            renderSection('shortcuts');
          };

          const onBlur = () => {
            cleanup();
            keyBtn.textContent = displayKeys(shortcutManager.getKeys(shortcut.id));
            keyBtn.classList.remove('recording');
          };

          const cleanup = () => {
            document.removeEventListener('keydown', onKeydown, true);
            keyBtn.removeEventListener('blur', onBlur);
            keyBtn.classList.remove('recording');
            activeRecorder = null;
          };

          document.addEventListener('keydown', onKeydown, true);
          keyBtn.addEventListener('blur', onBlur);
          activeRecorder = { cleanup };
        });

        // Reset button
        resetBtn.addEventListener('click', () => {
          cleanupRecorder();
          shortcutManager.resetOverride(shortcut.id);
          renderSection('shortcuts');
        });

        actions.appendChild(keyBtn);
        actions.appendChild(resetBtn);
        row.appendChild(copy);
        row.appendChild(actions);
        groupShell.appendChild(row);
      }

      container.appendChild(groupShell);
    }
  }

  function renderCheckItem(parent: HTMLElement, opts: {
    label: string;
    description: string;
    ok: boolean;
    statusText: string;
    helpText?: string;
    onFix?: () => Promise<void>;
  }) {
    const row = document.createElement('div');
    row.className = 'setup-check-row';

    const icon = document.createElement('span');
    icon.className = opts.ok ? 'setup-check-icon ok' : 'setup-check-icon error';
    icon.textContent = opts.ok ? '\u2713' : '\u2717';

    const info = document.createElement('div');
    info.className = 'setup-check-info';

    const title = document.createElement('div');
    title.className = 'setup-check-label';
    title.textContent = opts.label;

    const desc = document.createElement('div');
    desc.className = 'setup-check-desc';
    desc.textContent = opts.description;

    info.appendChild(title);
    info.appendChild(desc);

    if (!opts.ok && opts.helpText) {
      const help = document.createElement('div');
      help.className = 'setup-check-help';
      help.textContent = opts.helpText;
      info.appendChild(help);
    }

    const status = document.createElement('div');
    status.className = opts.ok ? 'setup-check-status setup-check-status-pill ok' : 'setup-check-status setup-check-status-pill error';
    status.textContent = opts.statusText;

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(status);

    const { onFix } = opts;
    if (onFix) {
      const btn = document.createElement('button');
      btn.className = 'setup-fix-btn';
      btn.textContent = 'Fix';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Fixing\u2026';
        try {
          await onFix();
        } catch {
          btn.disabled = false;
          btn.textContent = 'Fix';
        }
      });
      row.appendChild(btn);
    }

    parent.appendChild(row);
  }

  async function fixAndRerender(providerId?: ProviderId) {
    await window.calder.settings.reinstall(providerId);
    renderSection('providers');
  }

  function renderProviderHeader(parent: HTMLElement, displayName: string, hasIssue: boolean) {
    const header = document.createElement('div');
    header.className = 'setup-provider-header';

    const row = document.createElement('div');
    row.className = 'setup-provider-header-row';

    const name = document.createElement('div');
    name.className = 'setup-provider-name';
    name.textContent = displayName;

    const status = document.createElement('div');
    status.className = hasIssue ? 'setup-provider-status error' : 'setup-provider-status ok';
    status.textContent = hasIssue ? 'Needs attention' : 'Ready';

    row.appendChild(name);
    row.appendChild(status);
    header.appendChild(row);
    parent.appendChild(header);
  }

  interface ProviderStatus {
    meta: CliProviderMeta;
    validation: SettingsValidationResult;
    binary: { ok: boolean; message: string };
  }

  async function fetchProviderStatuses(): Promise<ProviderStatus[]> {
    const providers = await window.calder.provider.listProviders();
    return Promise.all(
      providers.map(meta =>
        Promise.all([
          window.calder.settings.validate(meta.id),
          window.calder.provider.checkBinary(meta.id),
        ]).then(([validation, binary]) => ({ meta, validation, binary })),
      ),
    );
  }

  function hasProviderIssue({ meta, validation, binary }: ProviderStatus): boolean {
    if (!binary.ok) return true;
    return !isTrackingHealthy(meta, validation);
  }

  async function renderSetupSection(container: HTMLElement) {
    const section = document.createElement('div');
    section.className = 'setup-section';

    const loading = document.createElement('div');
    loading.className = 'setup-loading';
    loading.textContent = 'Checking configuration\u2026';
    section.appendChild(loading);
    container.appendChild(section);

    const results = await fetchProviderStatuses();

    if (currentSection !== 'providers') return;

    applySetupBadge(results.some(hasProviderIssue));

    section.innerHTML = '';

    for (const { meta, validation, binary } of results) {
      const providerShell = document.createElement('div');
      providerShell.className = 'setup-provider-shell';
      section.appendChild(providerShell);

      renderProviderHeader(providerShell, meta.displayName, hasProviderIssue({ meta, validation, binary }));

      renderCheckItem(providerShell, {
        label: meta.displayName,
        description: `The ${meta.binaryName} binary must be installed for sessions to work.`,
        ok: binary.ok,
        statusText: binary.ok ? 'Installed' : 'Not found',
        helpText: binary.ok ? undefined : binary.message,
      });

      if (!binary.ok) continue;

      const { capabilities } = meta;

      if (capabilities.costTracking || capabilities.contextWindow) {
        const slOk = validation.statusLine === 'calder';
        let slStatus = 'Configured';
        if (validation.statusLine === 'missing') slStatus = 'Not configured';
        else if (validation.statusLine === 'foreign') slStatus = 'Overwritten by another tool';

        renderCheckItem(providerShell, {
          label: 'Status Line',
          description: 'Required for cost tracking and context window monitoring.',
          ok: slOk,
          statusText: slStatus,
          onFix: slOk ? undefined : () => fixAndRerender(meta.id),
        });
      }

      if (capabilities.hookStatus) {
        const hooksOk = validation.hooks === 'complete';
        let hooksStatus = 'All hooks installed';
        if (validation.hooks === 'missing') hooksStatus = 'No hooks installed';
        else if (validation.hooks === 'partial') hooksStatus = 'Some hooks missing';

        renderCheckItem(providerShell, {
          label: 'Session Hooks',
          description: 'Required for session activity tracking.',
          ok: hooksOk,
          statusText: hooksStatus,
          onFix: hooksOk ? undefined : () => fixAndRerender(meta.id),
        });

        const hookList = document.createElement('div');
        hookList.className = 'setup-hook-details';
        for (const [event, installed] of Object.entries(validation.hookDetails)) {
          const item = document.createElement('div');
          item.className = 'setup-hook-item';
          const icon = document.createElement('span');
          icon.className = installed ? 'setup-check-icon ok' : 'setup-check-icon error';
          icon.textContent = installed ? '\u2713' : '\u2717';
          const name = document.createElement('span');
          name.className = 'setup-hook-name';
          name.textContent = event;
          item.appendChild(icon);
          item.appendChild(name);
          hookList.appendChild(item);
        }
        providerShell.appendChild(hookList);

        if (capabilities.costTracking && validation.statusLine !== 'calder' && !hooksOk) {
          const fixAllRow = document.createElement('div');
          fixAllRow.className = 'setup-fix-all-row';

          const fixAllBtn = document.createElement('button');
          fixAllBtn.className = 'setup-fix-btn';
          fixAllBtn.textContent = 'Fix All';
          fixAllBtn.addEventListener('click', async () => {
            fixAllBtn.disabled = true;
            fixAllBtn.textContent = 'Fixing\u2026';
            try {
              await fixAndRerender(meta.id);
            } catch {
              fixAllBtn.disabled = false;
              fixAllBtn.textContent = 'Fix All';
            }
          });

          fixAllRow.appendChild(fixAllBtn);
          providerShell.appendChild(fixAllRow);
        }
      }
    }
  }

  function applySetupBadge(hasIssue: boolean) {
    const setupItem = menuItems.get('providers');
    if (setupItem) {
      setupItem.classList.toggle('has-badge', hasIssue);
    }
  }

  async function updateSetupBadge() {
    const results = await fetchProviderStatuses();
    applySetupBadge(results.some(hasProviderIssue));
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
  if ((overlay as any)._cleanup) {
    (overlay as any)._cleanup();
    (overlay as any)._cleanup = null;
  }

  const save = () => {
    if (soundCheckbox) {
      appState.setPreference('soundOnSessionWaiting', soundCheckbox.checked);
    }
    if (notificationsCheckbox) {
      appState.setPreference('notificationsDesktop', notificationsCheckbox.checked);
    }
    if (historyCheckbox) {
      appState.setPreference('sessionHistoryEnabled', historyCheckbox.checked);
    }
    if (insightsCheckbox) {
      appState.setPreference('insightsEnabled', insightsCheckbox.checked);
    }
    if (autoTitleCheckbox) {
      appState.setPreference('autoTitleEnabled', autoTitleCheckbox.checked);
    }
    if (defaultProviderSelect) {
      appState.setPreference('defaultProvider', defaultProviderSelect.getValue() as ProviderId);
    }
    if (debugModeCheckbox && debugModeCheckbox.checked !== appState.preferences.debugMode) {
      appState.setPreference('debugMode', debugModeCheckbox.checked);
      window.calder.menu.rebuild(debugModeCheckbox.checked);
    }
    if (sidebarCheckboxes) {
      appState.setPreference('sidebarViews', {
        configSections: sidebarCheckboxes.configSections.checked,
        gitPanel: sidebarCheckboxes.gitPanel.checked,
        sessionHistory: sidebarCheckboxes.sessionHistory.checked,
        costFooter: sidebarCheckboxes.costFooter.checked,
      });
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

  (overlay as any)._cleanup = () => {
    cleanupRecorder();
    if (defaultProviderSelect) defaultProviderSelect.destroy();
    btnConfirm.removeEventListener('click', handleConfirm);
    btnCancel.removeEventListener('click', handleCancel);
    document.removeEventListener('keydown', handleKeydown);
  };
}
