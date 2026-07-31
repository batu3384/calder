import { inspectorState } from './session-inspector-state-ui.js';

export type InspectorTab = typeof inspectorState.activeTab;

export function setInspectorTab(tab: InspectorTab): void {
  if (!inspectorState.inspectorPanel) return;
  const btn = inspectorState.inspectorPanel.querySelector<HTMLButtonElement>(
    `.inspector-tab[data-tab="${tab}"]`,
  );
  btn?.click();
}
