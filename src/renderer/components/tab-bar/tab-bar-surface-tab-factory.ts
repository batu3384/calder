import type { ProjectSurfaceRecord } from '../../../shared/types/project-surface.js';
import type { ProjectRecord } from '../../state.js';

interface CreateSurfaceModeTabOptions {
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
  tab.dataset.surfaceTab = 'cli';
  tab.title = options.title;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', String(options.active));
  tab.tabIndex = 0;
  const reorderHandle =
    options.project.sessions.length > 0
      ? '<span class="tab-reorder-handle" aria-hidden="true" title="Drag to reorder">&#8942;&#8942;</span>'
      : '';
  tab.innerHTML = `
    ${reorderHandle}
    <span class="tab-name">
      <span class="tab-name-prefix">${options.badgeMarkup}</span>
      <span class="tab-name-label">${options.label}</span>
    </span>
    <button type="button" class="tab-close" aria-label="Close ${options.label}" title="Close ${options.label}">&times;</button>
  `;

  tab.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      options.onFocus();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const tabs = [...options.tabListEl.querySelectorAll<HTMLElement>('.tab-item')];
      const index = tabs.indexOf(tab);
      const nextIndex = event.key === 'ArrowLeft' ? index - 1 : index + 1;
      tabs[nextIndex]?.focus();
    }
  });

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
      event.dataTransfer!.setData('text/plain', '__surface:cli');
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
