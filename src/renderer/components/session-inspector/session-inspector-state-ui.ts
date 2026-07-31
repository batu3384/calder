export const inspectorState = {
  inspectorPanel: null as HTMLElement | null,
  inspectedSessionId: null as string | null,
  activeTab: 'ecosystem' as
    | 'timeline'
    | 'ecosystem'
    | 'evidence'
    | 'studio'
    | 'changes'
    | 'costs'
    | 'review'
    | 'tools'
    | 'context',
  updateTimer: null as ReturnType<typeof setTimeout> | null,
  resizing: false,
  reopenOnNextSession: false,
  expandedRows: new Set<string>(),
  autoExpandedAgentGroups: new Set<string>(),
  autoScroll: true,
  programmaticScroll: false,
};
