import { appState } from '../state.js';
import { closeModal, registerModalCleanup } from './modal.js';
import { promptNewProject } from './sidebar.js';

const ONBOARDING_SEEN_KEY = 'calder-onboarding-seen';

export function shouldShowOnboarding(): boolean {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(ONBOARDING_SEEN_KEY) === '1') {
    return false;
  }
  return appState.projects.length === 0;
}

export function showOnboardingDialog(): void {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const btnCancel = document.getElementById('modal-cancel');
  const btnConfirm = document.getElementById('modal-confirm');
  if (!overlay || !modal || !titleEl || !bodyEl || !btnCancel || !btnConfirm) {
    promptNewProject();
    return;
  }

  titleEl.textContent = 'Welcome to Calder';
  bodyEl.innerHTML = '';
  overlay.classList.remove('hidden');

  const intro = document.createElement('p');
  intro.textContent =
    'Add a project folder, install a supported coding CLI, then open your first agent session from the sidebar.';
  bodyEl.appendChild(intro);

  const list = document.createElement('ul');
  list.className = 'onboarding-provider-list';
  ['Claude Code', 'Codex', 'Copilot', 'Antigravity', 'Qwen'].forEach((provider) => {
    const item = document.createElement('li');
    item.textContent = provider;
    list.appendChild(item);
  });
  bodyEl.appendChild(list);

  btnCancel.textContent = 'Later';
  btnConfirm.textContent = 'Add project';

  const cleanup = (): void => {
    btnCancel.removeEventListener('click', onLater);
    btnConfirm.removeEventListener('click', onAddProject);
  };
  registerModalCleanup(cleanup);

  const onLater = (): void => {
    markOnboardingSeen();
    cleanup();
    closeModal();
  };

  const onAddProject = (): void => {
    markOnboardingSeen();
    cleanup();
    closeModal();
    promptNewProject();
  };

  btnCancel.addEventListener('click', onLater);
  btnConfirm.addEventListener('click', onAddProject);
}

function markOnboardingSeen(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
  }
}

export function resetOnboardingForTesting(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(ONBOARDING_SEEN_KEY);
  }
}
