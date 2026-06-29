import {
  type CliSurfaceLayoutElements,
  createCliSurfaceLayout,
  createCliSurfaceTerminal,
} from './pane-elements.js';
import { type CliSurfaceInstance,createCliSurfaceInstance } from './pane-instance.js';
import type { CliSurfacePaneStore } from './pane-store.js';

interface EnsureCliSurfaceInstanceOptions {
  projectId: string;
  store: CliSurfacePaneStore;
  attachPaneBindings(): void;
  bindCliSurfaceInstanceHandlers(
    projectId: string,
    instance: CliSurfaceInstance,
    layout: CliSurfaceLayoutElements,
  ): void;
  initializeCliSurfaceInstance(instance: CliSurfaceInstance): void;
  resolveProjectPath(projectId: string): string | undefined;
  openExternal(url: string, cwd?: string): void;
}

export function ensureCliSurfacePaneInstance(options: EnsureCliSurfaceInstanceOptions): CliSurfaceInstance {
  const existing = options.store.instances.get(options.projectId);
  if (existing) return existing;

  options.attachPaneBindings();

  const layout = createCliSurfaceLayout(options.projectId);
  const terminalElements = createCliSurfaceTerminal(
    options.projectId,
    layout.viewport,
    layout.hoverOverlay,
    layout.selectionOverlay,
    {
      resolveProjectPath: options.resolveProjectPath,
      openExternal: options.openExternal,
    },
  );

  const instance = createCliSurfaceInstance(options.projectId, layout, terminalElements);
  options.bindCliSurfaceInstanceHandlers(options.projectId, instance, layout);
  options.initializeCliSurfaceInstance(instance);
  return instance;
}

export function attachCliSurfacePaneToContainer(
  projectId: string,
  container: HTMLElement,
  ensureInstance: (projectId: string) => CliSurfaceInstance,
): void {
  const instance = ensureInstance(projectId);
  if (instance.element.parentElement !== container) {
    container.appendChild(instance.element);
  }
}

export function showCliSurfacePaneByProject(
  projectId: string,
  ensureInstance: (projectId: string) => CliSurfaceInstance,
  fitSurface: (instance: CliSurfaceInstance) => void,
): void {
  const instance = ensureInstance(projectId);
  instance.element.classList.remove('hidden');
  fitSurface(instance);
}

export function hideAllCliSurfacePaneElements(store: CliSurfacePaneStore): void {
  store.instances.forEach((instance) => instance.element.classList.add('hidden'));
}

export function getCliSurfacePaneInstanceFromStore(
  store: CliSurfacePaneStore,
  projectId: string,
): CliSurfaceInstance | undefined {
  return store.instances.get(projectId);
}

export function destroyCliSurfacePaneInstance(store: CliSurfacePaneStore, projectId: string): void {
  const instance = store.instances.get(projectId);
  if (!instance) {
    store.clearProjectSurfaceCaches(projectId);
    return;
  }

  store.instances.delete(projectId);

  if (instance.targetMenuOutsideClickHandler) {
    document.removeEventListener('mousedown', instance.targetMenuOutsideClickHandler);
  }
  instance.targetMenuController?.closeMenu();

  for (const cleanup of instance.cleanupFns) {
    try {
      cleanup();
    } catch {
      // Best-effort cleanup only.
    }
  }

  try {
    (instance.terminal as unknown as { dispose?: () => void }).dispose?.();
  } catch {
    // Terminal may already be disposed in tests or during teardown.
  }
  instance.element.remove();
  store.clearProjectSurfaceCaches(projectId);
}
