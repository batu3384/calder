import type { ProjectRecord } from '../../shared/types.js';
import { appState } from '../state.js';
import { toProjectRelativeContextPath } from '../project-context-utils.js';
import { setModalError, showModal } from './modal.js';

export interface RenderProjectContextSectionArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onRefreshProviders: () => void;
  onCloseModalWide: () => void;
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
    const empty = document.createElement('div');
    empty.className = 'context-discovery-empty';
    empty.textContent = 'Open a project to inspect provider-native memory and shared project rules.';
    shell.appendChild(empty);
    return;
  }
  const project = args.project;

  const actions = document.createElement('div');
  actions.className = 'context-discovery-actions';

  const starterBtn = document.createElement('button');
  starterBtn.className = 'context-discovery-action-btn';
  starterBtn.type = 'button';
  starterBtn.textContent = 'Create starter files';
  starterBtn.addEventListener('click', async () => {
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

  const createRuleBtn = document.createElement('button');
  createRuleBtn.className = 'context-discovery-action-btn';
  createRuleBtn.type = 'button';
  createRuleBtn.textContent = 'New shared rule';
  createRuleBtn.addEventListener('click', () => {
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
  });
  actions.appendChild(createRuleBtn);
  shell.appendChild(actions);

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

    const header = document.createElement('div');
    header.className = 'context-discovery-item-header';

    const title = document.createElement('div');
    title.className = 'context-discovery-item-title';
    title.textContent = source.displayName;
    header.appendChild(title);

    const status = document.createElement('div');
    status.className = 'context-discovery-item-status';

    const itemActions = document.createElement('div');
    itemActions.className = 'context-discovery-item-actions';

    const relativePath = toProjectRelativeContextPath(project.path, source.path);
    const previewBtn = document.createElement('button');
    previewBtn.className = 'context-discovery-item-btn';
    previewBtn.type = 'button';
    previewBtn.textContent = 'Preview';
    previewBtn.addEventListener('click', () => {
      appState.addFileReaderSession(project.id, source.path);
      args.onCloseModalWide();
    });
    itemActions.appendChild(previewBtn);

    if (relativePath) {
      const openBtn = document.createElement('button');
      openBtn.className = 'context-discovery-item-btn';
      openBtn.type = 'button';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', async () => {
        openBtn.disabled = true;
        try {
          await window.calder.git.openInEditor(project.path, relativePath);
        } finally {
          openBtn.disabled = false;
        }
      });
      itemActions.appendChild(openBtn);
    }

    const meta = document.createElement('div');
    meta.className = 'context-discovery-item-meta';
    const scopeLabel = source.provider === 'shared' ? 'Shared rule' : `${source.provider} memory`;
    meta.textContent = source.summary ? `${scopeLabel} · ${source.summary}` : scopeLabel;

    if (source.provider === 'shared' && source.kind === 'rules') {
      if (relativePath) {
        const renameBtn = document.createElement('button');
        renameBtn.className = 'context-discovery-item-btn';
        renameBtn.type = 'button';
        renameBtn.textContent = 'Rename';
        renameBtn.addEventListener('click', () => {
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
        });
        itemActions.appendChild(renameBtn);

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
        itemActions.appendChild(deleteBtn);
      }

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
    } else {
      status.textContent = 'Provider memory';
    }

    itemActions.appendChild(status);
    if (itemActions.childElementCount > 0) {
      header.appendChild(itemActions);
    }
    item.appendChild(header);
    item.appendChild(meta);
    list.appendChild(item);
  }

  shell.appendChild(list);
}
