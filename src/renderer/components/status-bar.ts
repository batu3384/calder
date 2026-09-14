const OBSERVE_OPTS: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class'],
};

function forwardClick(source: HTMLElement | null): void {
  source?.click();
}

function observeMirror(source: Node, sync: () => void): void {
  let raf = 0;
  const schedule = (): void => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      sync();
    });
  };
  new MutationObserver(schedule).observe(source, OBSERVE_OPTS);
}

export function initStatusBar(): void {
  const gitSource = document.getElementById('git-status');
  const gitMirror = document.getElementById('status-bar-git');
  const providerSlot = document.getElementById('session-provider-slot');
  const providerMirror = document.getElementById('status-bar-provider');
  const tabList = document.getElementById('tab-list');
  const sessionMirror = document.getElementById('status-bar-session');

  if (gitSource && gitMirror) {
    const syncGit = (): void => {
      gitMirror.textContent = gitSource.textContent?.trim() ?? '';
    };
    syncGit();
    observeMirror(gitSource, syncGit);
    gitMirror.addEventListener('click', () => forwardClick(gitSource));
  }

  if (providerSlot && providerMirror) {
    const findTrigger = (): HTMLElement | null =>
      providerSlot.querySelector<HTMLElement>('.custom-select-trigger');
    const syncProvider = (): void => {
      providerMirror.textContent = findTrigger()?.textContent?.trim() ?? '';
    };
    syncProvider();
    observeMirror(providerSlot, syncProvider);
    providerMirror.addEventListener('click', () => forwardClick(findTrigger()));
  }

  if (tabList && sessionMirror) {
    const syncSession = (): void => {
      const active = tabList.querySelector<HTMLElement>('.tab-item.active .tab-name');
      sessionMirror.textContent = active?.textContent?.trim() ?? '';
    };
    syncSession();
    observeMirror(tabList, syncSession);
  }
}
