export interface StartInlineTabRenameOptions {
  tab: HTMLElement;
  currentName: string;
  maxLength: number;
  onCommit: (newName: string) => void;
  onCancel: () => void;
}

export function startInlineTabRename(options: StartInlineTabRenameOptions): void {
  const { tab, currentName, maxLength, onCommit, onCancel } = options;
  const nameSpan = tab.querySelector('.tab-name') as HTMLElement;
  if (nameSpan.querySelector('input')) return;

  const input = document.createElement('input');
  input.maxLength = maxLength;
  input.value = currentName;
  nameSpan.textContent = '';
  nameSpan.appendChild(input);
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    input.remove();
    if (newName && newName !== currentName) {
      onCommit(newName);
    } else {
      onCancel();
    }
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      committed = true;
      input.remove();
      onCancel();
    }
  });

  input.addEventListener('blur', commit);
}
