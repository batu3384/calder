import type { SelectorOption, SelectorVerification } from './types.js';

export function buildSelectorOptions(
  selectors: SelectorOption[],
  activeSelector: SelectorOption | undefined,
  selectorVerifications: Record<string, SelectorVerification> | undefined,
  onActivate: (sel: SelectorOption) => void,
): HTMLElement {
  const container = document.createElement('div');
  const optionEls: HTMLElement[] = [];

  for (let i = 0; i < selectors.length; i++) {
    const sel = selectors[i];
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'inspect-selector-option';
    if (sel === activeSelector) row.classList.add('active');

    const verification = selectorVerifications?.[sel.value];
    if (verification) {
      row.dataset.selectorStatus = verification.status;
    }

    const badge = document.createElement('span');
    badge.className = `selector-badge selector-badge-${sel.type}`;
    badge.textContent = sel.type;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'selector-value';
    valueSpan.textContent = sel.value;

    if (verification) {
      const status = document.createElement('span');
      status.className = 'selector-match-status';
      status.textContent =
        verification.status === 'unique'
          ? '1'
          : verification.status === 'ambiguous'
            ? `${verification.matchCount}`
            : '0';
      status.title =
        verification.status === 'unique'
          ? 'Unique match'
          : verification.status === 'ambiguous'
            ? `${verification.matchCount} matches`
            : 'No match';
      row.appendChild(badge);
      row.appendChild(valueSpan);
      row.appendChild(status);
    } else {
      row.appendChild(badge);
      row.appendChild(valueSpan);
    }

    optionEls.push(row);
    container.appendChild(row);

    row.addEventListener('click', () => {
      optionEls.forEach((el) => el.classList.remove('active'));
      optionEls[i].classList.add('active');
      onActivate(sel);
    });
  }

  return container;
}
