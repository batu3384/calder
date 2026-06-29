/**
 * Component lifecycle management system.
 * Provides centralized tracking and cleanup of component instances.
 */

export interface LifecycleListener {
  destroy(): void;
}

const activeListeners = new Set<LifecycleListener>();

export function registerLifecycle(component: LifecycleListener): void {
  activeListeners.add(component);
}

export function unregisterLifecycle(component: LifecycleListener): void {
  activeListeners.delete(component);
}

export function destroyAll(): void {
  // Collect first to avoid Set mutation during iteration.
  const components = [...activeListeners];
  activeListeners.clear();
  for (const c of components) {
    try {
      c.destroy();
    } catch (err) {
      console.warn('[component-lifecycle] destroy threw:', err);
    }
  }
}

export function getActiveCount(): number {
  return activeListeners.size;
}