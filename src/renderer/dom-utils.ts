/** Escape a string for safe insertion into innerHTML. */
export function esc(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

const AREA_LABELS: Record<string, string> = { staged: 'Staged', working: 'Changes', untracked: 'Untracked', conflicted: 'Conflicted' };

/** Return a user-friendly label for a git area value. */
export function areaLabel(area: string): string {
  return AREA_LABELS[area] || area;
}

interface PassphraseInputOptions {
  placeholder?: string;
  value?: string;
}

/** Create a passphrase input field for session sharing. */
export function createPassphraseInput(options: PassphraseInputOptions = {}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'text';
  input.className = 'share-pin-input';
  input.placeholder = options.placeholder ?? 'Passphrase';
  input.value = options.value ?? '';
  input.minLength = 12;
  input.maxLength = 64;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^A-Za-z0-9\s-]/g, '').toUpperCase();
  });
  return input;
}
