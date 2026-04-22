export interface PreferencesOverviewItem {
  label: string;
  value: string;
  note?: string;
}

export function appendSectionIntro(
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
): void {
  const intro = document.createElement('div');
  intro.className = 'preferences-section-intro';

  const eyebrowEl = document.createElement('div');
  eyebrowEl.className = 'preferences-section-eyebrow shell-kicker';
  eyebrowEl.textContent = eyebrow;
  intro.appendChild(eyebrowEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'preferences-section-title';
  titleEl.textContent = title;
  intro.appendChild(titleEl);

  const descriptionEl = document.createElement('div');
  descriptionEl.className = 'preferences-section-description';
  descriptionEl.textContent = description;
  intro.appendChild(descriptionEl);

  container.appendChild(intro);
}

export function appendSectionCard(
  container: HTMLElement,
  title: string,
  description?: string,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'preferences-section-card';

  const heading = document.createElement('div');
  heading.className = 'preferences-card-heading';
  heading.textContent = title;
  card.appendChild(heading);

  if (description) {
    const copy = document.createElement('div');
    copy.className = 'preferences-card-copy';
    copy.textContent = description;
    card.appendChild(copy);
  }

  container.appendChild(card);
  return card;
}

export function appendSectionGroup(
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
): HTMLElement {
  const group = document.createElement('section');
  group.className = 'preferences-subsection';

  const header = document.createElement('div');
  header.className = 'preferences-subsection-header';

  const eyebrowEl = document.createElement('div');
  eyebrowEl.className = 'preferences-subsection-eyebrow shell-kicker';
  eyebrowEl.textContent = eyebrow;
  header.appendChild(eyebrowEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'preferences-subsection-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const descriptionEl = document.createElement('div');
  descriptionEl.className = 'preferences-subsection-description';
  descriptionEl.textContent = description;
  header.appendChild(descriptionEl);

  group.appendChild(header);

  const body = document.createElement('div');
  body.className = 'preferences-subsection-grid';
  group.appendChild(body);

  container.appendChild(group);
  return body;
}

export function appendOverviewGrid(
  container: HTMLElement,
  items: PreferencesOverviewItem[],
): void {
  const grid = document.createElement('div');
  grid.className = 'preferences-overview-grid';

  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'preferences-overview-card';

    const labelEl = document.createElement('div');
    labelEl.className = 'preferences-overview-label';
    labelEl.textContent = item.label;
    card.appendChild(labelEl);

    const valueEl = document.createElement('div');
    valueEl.className = 'preferences-overview-value';
    valueEl.textContent = item.value;
    card.appendChild(valueEl);

    if (item.note) {
      const noteEl = document.createElement('div');
      noteEl.className = 'preferences-overview-note';
      noteEl.textContent = item.note;
      card.appendChild(noteEl);
    }

    grid.appendChild(card);
  }

  container.appendChild(grid);
}
