export type PreferencesSection = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about';

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
    <div class="preferences-menu-kicker shell-kicker">Calder</div>
    <div class="preferences-menu-title">Workspace settings</div>
    <div class="preferences-menu-caption">Defaults, layout, providers, and safety rules for every session.</div>
  `;
  menu.appendChild(menuHeader);

  const menuItems: Map<PreferencesSection, HTMLButtonElement> = new Map();
  for (const section of sections) {
    const item = document.createElement('button');
    item.className = 'preferences-menu-item';
    item.type = 'button';
    item.dataset.section = section.id;
    item.innerHTML = `
      <span class="preferences-menu-item-label">${section.label}</span>
      <span class="preferences-menu-item-caption">${section.caption}</span>
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
