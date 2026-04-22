import type { ProjectRecord } from '../../state.js';
import type { ProjectSurfaceRecord } from '../../../shared/types/project.js';

interface CreateSurfaceModeTabOptions {
  kind: 'cli' | 'mobile';
  project: ProjectRecord;
  tabListEl: HTMLElement;
  active: boolean;
  title: string;
  badgeMarkup: string;
  label: string;
  onFocus: () => void;
  onClose: () => void;
  getProjectSurface: (project: ProjectRecord) => ProjectSurfaceRecord;
  updateProjectSurface: (project: ProjectRecord, next: ProjectSurfaceRecord) => void;
}

export function createSurfaceModeTab(options: CreateSurfaceModeTabOptions): HTMLElement {
  const tab = document.createElement('div');
  tab.className = 'tab-item tab-surface-item' + (options.active ? ' active' : '');
  tab.dataset.surfaceTab = options.kind;
  tab.title = options.title;
  const reorderHandle = options.project.sessions.length > 0
    ? '<span class="tab-reorder-handle" aria-hidden="true" title="Drag to reorder">&#8942;&#8942;</span>'
    : '';
  tab.innerHTML = `
    ${reorderHandle}
    <span class="tab-name">
      <span class="tab-name-prefix">${options.badgeMarkup}</span>
      <span class="tab-name-label">${options.label}</span>
    </span>
    <span class="tab-close" title="Close ${options.label}">&times;</span>
  `;

  tab.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).classList.contains('tab-close')) return;
    options.onFocus();
  });

  tab.addEventListener('auxclick', (event) => {
    if (event.button === 1) {
      event.preventDefault();
      options.onClose();
    }
  });

  tab.querySelector('.tab-close')!.addEventListener('click', () => {
    options.onClose();
  });

  const reorderHandleEl = tab.querySelector('.tab-reorder-handle') as HTMLElement | null;
  if (reorderHandleEl) {
    reorderHandleEl.draggable = true;
    reorderHandleEl.addEventListener('dragstart', (event) => {
      event.dataTransfer!.effectAllowed = 'move';
      event.dataTransfer!.setData('text/plain', `__surface:${options.kind}`);
      tab.classList.add('dragging');
    });

    tab.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'move';
      const rect = tab.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      tab.classList.remove('drag-over-left', 'drag-over-right');
      if (event.clientX < midX) {
        tab.classList.add('drag-over-left');
      } else {
        tab.classList.add('drag-over-right');
      }
    });

    tab.addEventListener('dragleave', () => {
      tab.classList.remove('drag-over-left', 'drag-over-right');
    });

    tab.addEventListener('drop', (event) => {
      event.preventDefault();
      tab.classList.remove('drag-over-left', 'drag-over-right');
      const draggedId = event.dataTransfer!.getData('text/plain');
      if (!draggedId) return;

      const rect = tab.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const currentSurface = options.getProjectSurface(options.project);

      if (draggedId.startsWith('__surface:')) {
        const draggedKind = draggedId.replace('__surface:', '') as 'cli' | 'mobile';
        if (draggedKind === options.kind) return;
        const baseOrder: Array<'cli' | 'mobile'> = Array.isArray(currentSurface.tabOrder)
          && currentSurface.tabOrder.length === 2
          && currentSurface.tabOrder.includes('cli')
          && currentSurface.tabOrder.includes('mobile')
          ? [...currentSurface.tabOrder]
          : ['cli', 'mobile'];
        const filtered = baseOrder.filter((entry) => entry !== draggedKind);
        const targetIndex = filtered.indexOf(options.kind);
        const insertIndex = event.clientX < midX ? targetIndex : targetIndex + 1;
        filtered.splice(Math.max(0, insertIndex), 0, draggedKind);
        options.updateProjectSurface(options.project, {
          ...currentSurface,
          tabOrder: filtered,
        });
        return;
      }

      const desiredPlacement = event.clientX < midX ? 'start' : 'end';
      if ((currentSurface.tabPlacement ?? 'end') !== desiredPlacement) {
        options.updateProjectSurface(options.project, {
          ...currentSurface,
          tabPlacement: desiredPlacement,
        });
      }
    });

    reorderHandleEl.addEventListener('dragend', () => {
      tab.classList.remove('dragging');
      options.tabListEl.querySelectorAll('.drag-over-left, .drag-over-right').forEach((entry) => {
        entry.classList.remove('drag-over-left', 'drag-over-right');
      });
    });
  }

  return tab;
}
