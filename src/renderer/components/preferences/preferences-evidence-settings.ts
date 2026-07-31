import { appendPreferencesToggleField } from './preferences-modal-general-helpers.js';
import { openPixelOffice, setPixelOfficeOpen } from '../pixel-office/mount-pixel-office.js';

export function renderEvidenceSettingsSection(container: HTMLElement): void {
  const card = document.createElement('div');
  card.className = 'preferences-section-card';

  const heading = document.createElement('div');
  heading.className = 'preferences-card-heading';
  heading.textContent = 'Session Evidence';
  card.appendChild(heading);

  const copy = document.createElement('div');
  copy.className = 'preferences-card-copy';
  copy.textContent =
    'Record sanitized session activity locally for Pixel Office beside the terminal. Office mode drives live characters from Evidence; Off keeps capture without the office pane.';
  card.appendChild(copy);

  const body = document.createElement('div');
  body.className = 'preferences-evidence-settings-body';
  card.appendChild(body);

  const loading = document.createElement('div');
  loading.className = 'preferences-control-note';
  loading.textContent = 'Loading evidence settings…';
  body.appendChild(loading);
  container.appendChild(card);

  void window.calder.evidence.getSettings().then((settings) => {
    body.replaceChildren();

    appendPreferencesToggleField(
      body,
      'pref-evidence-enabled',
      'Record session evidence for new terminal sessions',
      settings.enabled,
      (enabled) => {
        void window.calder.evidence.getSettings().then((current) => {
          void window.calder.evidence.setSettings({ ...current, enabled });
        });
      },
    );

    const pixelRow = document.createElement('div');
    pixelRow.className = 'modal-toggle-field';

    const pixelLabel = document.createElement('label');
    pixelLabel.htmlFor = 'pref-evidence-pixel-mode';
    pixelLabel.textContent = 'Pixel Office';
    pixelRow.appendChild(pixelLabel);

    const pixelSelect = document.createElement('select');
    pixelSelect.id = 'pref-evidence-pixel-mode';
    pixelSelect.className = 'preferences-evidence-pixel-select';
    for (const mode of ['off', 'office'] as const) {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode === 'off' ? 'Off' : 'Office';
      option.selected = settings.pixelMode === mode;
      pixelSelect.appendChild(option);
    }
    pixelSelect.addEventListener('change', () => {
      const pixelMode = pixelSelect.value as 'off' | 'office';
      void window.calder.evidence.getSettings().then((current) => {
        void window.calder.evidence.setSettings({ ...current, pixelMode }).then(() => {
          if (pixelMode === 'office') openPixelOffice();
          else setPixelOfficeOpen(false);
        });
      });
    });
    pixelRow.appendChild(pixelSelect);
    body.appendChild(pixelRow);

    const note = document.createElement('div');
    note.className = 'preferences-control-note';
    note.textContent =
      'New installs default to Office (Cmd+Shift+O). Evidence stays local; disabling capture does not delete existing runs.';
    body.appendChild(note);
  });
}
