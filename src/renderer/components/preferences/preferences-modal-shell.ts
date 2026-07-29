export type PreferencesSection =
  | 'general'
  | 'interface'
  | 'tools'
  | 'automation'
  | 'safety'
  | 'shortcuts'
  | 'about';

interface PreferencesSectionSpec {
  id: PreferencesSection;
  label: string;
  caption: string;
}

interface CreatePreferencesModalShellArgs {
  body: HTMLElement;
  sections: PreferencesSectionSpec[];
}

interface PreferencesModalShell {
  menu: HTMLDivElement;
  menuItems: Map<PreferencesSection, HTMLButtonElement>;
  content: HTMLDivElement;
}

const SECTION_ICONS: Record<PreferencesSection, string> = {
  general:
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.25"/><path d="M8 5.5v2.75l1.75 1.25"/></svg>',
  interface:
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M2.5 6h11"/></svg>',
  tools:
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12.5l3.5-3.5M9.5 4.5l2 2M10.25 3.25l2.5 2.5-4.75 4.75H5.5V8z"/></svg>',
  automation:
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8h3l1.5-3 2 6L11 8h2"/></svg>',
  safety:
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2.75l5 2v3.5c0 3-2.1 4.9-5 5.75-2.9-.85-5-2.75-5-5.75v-3.5l5-2z"/></svg>',
  shortcuts:
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="4" width="4.5" height="3" rx="0.75"/><rect x="9" y="4" width="4.5" height="3" rx="0.75"/><rect x="2.5" y="9" width="11" height="3" rx="0.75"/></svg>',
  about:
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.25"/><path d="M8 7.25V11M8 5.25h.01"/></svg>',
};

export function createPreferencesModalShell({
  body,
  sections,
}: CreatePreferencesModalShellArgs): PreferencesModalShell {
  const layout = document.createElement('div');
  layout.className = 'preferences-layout preferences-shell';

  const menu = document.createElement('div');
  menu.className = 'preferences-menu';

  const menuHeader = document.createElement('div');
  menuHeader.className = 'preferences-menu-header';
  menuHeader.innerHTML = `
    <div class="preferences-menu-title">Settings</div>
  `;
  menu.appendChild(menuHeader);

  const menuItems: Map<PreferencesSection, HTMLButtonElement> = new Map();
  for (const section of sections) {
    const item = document.createElement('button');
    item.className = 'preferences-menu-item';
    item.type = 'button';
    item.dataset.section = section.id;
    item.setAttribute('aria-label', `${section.label} — ${section.caption}`);
    item.innerHTML = `
      <span class="preferences-menu-item-icon" aria-hidden="true">${SECTION_ICONS[section.id]}</span>
      <span class="preferences-menu-item-label">${section.label}</span>
    `;
    menu.appendChild(item);
    menuItems.set(section.id, item);
  }

  const contentShell = document.createElement('div');
  contentShell.className = 'preferences-content-shell';

  const content = document.createElement('div');
  content.className = 'preferences-content preferences-section';

  layout.appendChild(menu);
  contentShell.appendChild(content);
  layout.appendChild(contentShell);
  body.appendChild(layout);

  return { menu, menuItems, content };
}
