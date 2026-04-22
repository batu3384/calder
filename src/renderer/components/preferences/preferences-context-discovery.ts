import type { ProjectRecord } from '../../../shared/types/project.js';
import { appState } from '../../state.js';
import { toProjectRelativeContextPath } from '../../project-context-utils.js';
import { setModalError, showModal } from '../modal.js';

export interface RenderProjectContextSectionArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onRefreshProviders: () => void;
  onCloseModalWide: () => void;
}

type ProjectContextData = NonNullable<ProjectRecord['projectContext']>;
type ProjectContextSource = ProjectContextData['sources'][number];

function appendContextEmpty(shell: HTMLElement, text: string): void {
  const empty = document.createElement('div');
  empty.className = 'context-discovery-empty';
  empty.textContent = text;
  shell.appendChild(empty);
}

function createActionButton(label: string, onClick: () => void | Promise<void>): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'context-discovery-action-btn';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => {
    void onClick();
  });
  return button;
}

function openCreateSharedRuleModal(project: ProjectRecord, args: RenderProjectContextSectionArgs): void {
  showModal('New Shared Rule', [
    {
      label: 'Rule name',
      id: 'context-rule-name',
      placeholder: 'Review checklist',
      defaultValue: 'Review checklist',
    },
    {
      label: 'Priority',
      id: 'context-rule-priority',
      type: 'select',
      defaultValue: 'soft',
      options: [
        { value: 'soft', label: 'Soft guideline' },
        { value: 'hard', label: 'Hard requirement' },
      ],
    },
  ], async (values) => {
    const title = values['context-rule-name']?.trim() ?? '';
    if (!title) {
      setModalError('context-rule-name', 'Rule name is required');
      return;
    }

    const priority = values['context-rule-priority'] === 'hard' ? 'hard' : 'soft';
    const result = await window.calder.context.createSharedRule(project.path, title, priority);
    appState.setProjectContext(project.id, result.state);
    args.onCloseModalWide();
    void window.calder.git.openInEditor(project.path, result.relativePath);
  });
}

function appendDiscoveryActions(shell: HTMLElement, project: ProjectRecord, args: RenderProjectContextSectionArgs): void {
  const actions = document.createElement('div');
  actions.className = 'context-discovery-actions';

  const starterBtn = createActionButton('Create starter files', async () => {
    starterBtn.disabled = true;
    starterBtn.textContent = 'Creating…';
    try {
      const result = await window.calder.context.createStarterFiles(project.path);
      appState.setProjectContext(project.id, result.state);
      args.onRefreshProviders();
    } catch {
      starterBtn.disabled = false;
      starterBtn.textContent = 'Create starter files';
    }
  });
  actions.appendChild(starterBtn);

  const createRuleBtn = createActionButton('New shared rule', () => {
    openCreateSharedRuleModal(project, args);
  });
  actions.appendChild(createRuleBtn);

  shell.appendChild(actions);
}

function appendDiscoverySummary(
  shell: HTMLElement,
  project: ProjectRecord,
  projectContext: ProjectContextData,
): void {
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
}

function createSourceMeta(source: ProjectContextSource): HTMLDivElement {
  const meta = document.createElement('div');
  meta.className = 'context-discovery-item-meta';
  const scopeLabel = source.provider === 'shared' ? 'Shared rule' : `${source.provider} memory`;
  meta.textContent = source.summary ? `${scopeLabel} · ${source.summary}` : scopeLabel;
  return meta;
}

function createSourcePreviewButton(
  project: ProjectRecord,
  source: ProjectContextSource,
  args: RenderProjectContextSectionArgs,
): HTMLButtonElement {
  const previewBtn = document.createElement('button');
  previewBtn.className = 'context-discovery-item-btn';
  previewBtn.type = 'button';
  previewBtn.textContent = 'Preview';
  previewBtn.addEventListener('click', () => {
    appState.addFileReaderSession(project.id, source.path);
    args.onCloseModalWide();
  });
  return previewBtn;
}

function createSourceOpenButton(projectPath: string, relativePath: string): HTMLButtonElement {
  const openBtn = document.createElement('button');
  openBtn.className = 'context-discovery-item-btn';
  openBtn.type = 'button';
  openBtn.textContent = 'Open';
  openBtn.addEventListener('click', async () => {
    openBtn.disabled = true;
    try {
      await window.calder.git.openInEditor(projectPath, relativePath);
    } finally {
      openBtn.disabled = false;
    }
  });
  return openBtn;
}

function openRenameSharedRuleModal(
  project: ProjectRecord,
  relativePath: string,
  source: ProjectContextSource,
  args: RenderProjectContextSectionArgs,
): void {
  const initialTitle = source.summary?.trim() || source.displayName.replace(/\.(hard|soft)\.md$/i, '');
  const currentPriority = source.priority === 'hard' ? 'hard' : 'soft';
  showModal('Rename Shared Rule', [
    {
      label: 'Rule name',
      id: 'context-rule-rename-name',
      placeholder: 'Review checklist',
      defaultValue: initialTitle,
    },
    {
      label: 'Priority',
      id: 'context-rule-rename-priority',
      type: 'select',
      defaultValue: currentPriority,
      options: [
        { value: 'soft', label: 'Soft guideline' },
        { value: 'hard', label: 'Hard requirement' },
      ],
    },
  ], async (values) => {
    const title = values['context-rule-rename-name']?.trim() ?? '';
    if (!title) {
      setModalError('context-rule-rename-name', 'Rule name is required');
      return;
    }

    const priority = values['context-rule-rename-priority'] === 'hard' ? 'hard' : 'soft';
    const result = await window.calder.context.renameSharedRule(project.path, relativePath, title, priority);
    appState.setProjectContext(project.id, result.state);
    args.onCloseModalWide();
    void window.calder.git.openInEditor(project.path, result.relativePath);
  });
}

function createRenameRuleButton(
  project: ProjectRecord,
  source: ProjectContextSource,
  relativePath: string,
  args: RenderProjectContextSectionArgs,
): HTMLButtonElement {
  const renameBtn = document.createElement('button');
  renameBtn.className = 'context-discovery-item-btn';
  renameBtn.type = 'button';
  renameBtn.textContent = 'Rename';
  renameBtn.addEventListener('click', () => {
    openRenameSharedRuleModal(project, relativePath, source, args);
  });
  return renameBtn;
}

function createDeleteRuleButton(
  project: ProjectRecord,
  source: ProjectContextSource,
  relativePath: string,
  args: RenderProjectContextSectionArgs,
): HTMLButtonElement {
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'context-discovery-item-btn';
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Delete shared rule "${source.displayName}"?`)) {
      return;
    }
    const result = await window.calder.context.deleteSharedRule(project.path, relativePath);
    appState.setProjectContext(project.id, result.state);
    args.onRefreshProviders();
  });
  return deleteBtn;
}

function createSharedRuleStatus(
  project: ProjectRecord,
  source: ProjectContextSource,
  projectContext: ProjectContextData,
  args: RenderProjectContextSectionArgs,
): HTMLElement {
  const status = document.createElement('div');
  status.className = 'context-discovery-item-status';

  const toggle = document.createElement('label');
  toggle.className = 'context-discovery-toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = source.enabled !== false;

  const label = document.createElement('span');
  label.textContent = checkbox.checked ? 'Active in prompts' : 'Muted';

  checkbox.addEventListener('change', () => {
    const nextState = {
      ...projectContext,
      sources: projectContext.sources.map((entry) => (
        entry.id === source.id
          ? { ...entry, enabled: checkbox.checked }
          : entry
      )),
    };
    appState.setProjectContext(project.id, nextState);
    args.onRefreshProviders();
  });

  toggle.appendChild(checkbox);
  toggle.appendChild(label);
  status.appendChild(toggle);
  return status;
}

function createProviderMemoryStatus(): HTMLElement {
  const status = document.createElement('div');
  status.className = 'context-discovery-item-status';
  status.textContent = 'Provider memory';
  return status;
}

function createSourceItem(
  project: ProjectRecord,
  projectContext: ProjectContextData,
  source: ProjectContextSource,
  args: RenderProjectContextSectionArgs,
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'context-discovery-item';

  const header = document.createElement('div');
  header.className = 'context-discovery-item-header';

  const title = document.createElement('div');
  title.className = 'context-discovery-item-title';
  title.textContent = source.displayName;
  header.appendChild(title);

  const itemActions = document.createElement('div');
  itemActions.className = 'context-discovery-item-actions';

  const relativePath = toProjectRelativeContextPath(project.path, source.path);
  itemActions.appendChild(createSourcePreviewButton(project, source, args));

  if (relativePath) {
    itemActions.appendChild(createSourceOpenButton(project.path, relativePath));
  }

  if (source.provider === 'shared' && source.kind === 'rules') {
    if (relativePath) {
      itemActions.appendChild(createRenameRuleButton(project, source, relativePath, args));
      itemActions.appendChild(createDeleteRuleButton(project, source, relativePath, args));
    }
    itemActions.appendChild(createSharedRuleStatus(project, source, projectContext, args));
  } else {
    itemActions.appendChild(createProviderMemoryStatus());
  }

  if (itemActions.childElementCount > 0) {
    header.appendChild(itemActions);
  }

  item.appendChild(header);
  item.appendChild(createSourceMeta(source));
  return item;
}

function appendDiscoveryList(
  shell: HTMLElement,
  project: ProjectRecord,
  projectContext: ProjectContextData,
  args: RenderProjectContextSectionArgs,
): void {
  const list = document.createElement('div');
  list.className = 'context-discovery-list';
  for (const source of projectContext.sources.slice(0, 6)) {
    list.appendChild(createSourceItem(project, projectContext, source, args));
  }
  shell.appendChild(list);
}

export function renderProjectContextSection(args: RenderProjectContextSectionArgs): void {
  const card = args.appendSectionCard(
    args.container,
    'Project context',
    'Calder discovers provider-native memory and shared project rules for the active repo without replacing each CLI tool’s own history.',
  );

  const shell = document.createElement('div');
  shell.className = 'context-discovery-shell';
  card.appendChild(shell);

  if (!args.project) {
    appendContextEmpty(
      shell,
      'Open a project to inspect provider-native memory and shared project rules.',
    );
    return;
  }

  const project = args.project;
  appendDiscoveryActions(shell, project, args);

  const projectContext = project.projectContext;
  if (!projectContext || projectContext.sources.length === 0) {
    appendContextEmpty(
      shell,
      'No provider-native memory or shared project rules have been discovered for this repo yet.',
    );
    return;
  }

  appendDiscoverySummary(shell, project, projectContext);
  appendDiscoveryList(shell, project, projectContext, args);
}
