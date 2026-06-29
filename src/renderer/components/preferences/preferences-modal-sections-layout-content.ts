import type {
  LayoutSidebarViews,
  RenderLayoutSectionArgs,
} from './preferences-modal-sections-types.js';

export interface LayoutSectionCopy {
  opsRailTitle: string;
  liveViewTitle: string;
  sessionDeckTitle: string;
}

interface RenderLayoutSectionContentArgs extends RenderLayoutSectionArgs {
  copy: LayoutSectionCopy;
}

export function renderLayoutPreferencesSectionContent({
  content,
  preferenceDraft,
  appendSectionIntro,
  appendOverviewGrid,
  appendSectionCard,
  copy,
}: RenderLayoutSectionContentArgs): void {
  appendSectionIntro(
    content,
    'Workspace',
    'Stage layout',
    'Keep the left surface stable while deciding which support modules stay visible around active sessions.',
  );

  const views = preferenceDraft.sidebarViews;
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

  const toggles: Array<{ key: keyof LayoutSidebarViews; label: string; group: 'ops' | 'session' }> =
    [
      { key: 'configSections', label: 'Toolkit', group: 'ops' },
      { key: 'gitPanel', label: 'Git', group: 'ops' },
      { key: 'sessionHistory', label: 'Run log', group: 'ops' },
      { key: 'costFooter', label: 'Spend chip', group: 'session' },
    ];

  const opsCard = appendSectionCard(
    content,
    copy.opsRailTitle,
    'Choose which support modules stay visible in the right-side operations rail.',
  );
  const liveViewCard = appendSectionCard(
    content,
    copy.liveViewTitle,
    'Live View stays anchored on the left when a browser session is open so page context never disappears.',
  );
  const sessionDeckCard = appendSectionCard(
    content,
    copy.sessionDeckTitle,
    'Tune the shared AI work area and the strip above active sessions.',
  );

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
    cb.addEventListener('change', () => {
      preferenceDraft.sidebarViews[toggle.key] = cb.checked;
    });

    row.appendChild(label);
    row.appendChild(cb);
    if (toggle.group === 'ops') {
      opsCard.appendChild(row);
    } else {
      sessionDeckCard.appendChild(row);
    }
  }

  const pinnedNote = document.createElement('div');
  pinnedNote.className = 'preferences-card-note';
  pinnedNote.textContent =
    'Browser sessions automatically hold the left stage so inspection and handoff stay visible while you work.';
  liveViewCard.appendChild(pinnedNote);
}
