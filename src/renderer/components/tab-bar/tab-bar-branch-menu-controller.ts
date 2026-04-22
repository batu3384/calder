import { appState } from '../../state.js';
import { getActiveGitPath, getGitStatus } from '../../git-status.js';
import { closeModal, setModalError, showModal } from '../modal.js';

interface CreateTabBarBranchMenuControllerOptions {
  gitStatusEl: HTMLElement;
  hideTabContextMenu: () => void;
  getActiveContextMenu: () => HTMLElement | null;
  setActiveContextMenu: (menu: HTMLElement | null) => void;
  applyContextMenuSemantics: (menu: HTMLElement, label: string, focusFirstItem?: boolean) => void;
  refreshGitStatus: () => void;
}

export interface TabBarBranchMenuController {
  showBranchContextMenu: (event: MouseEvent) => Promise<void>;
}

export function createTabBarBranchMenuController(
  options: CreateTabBarBranchMenuControllerOptions,
): TabBarBranchMenuController {
  const {
    gitStatusEl,
    hideTabContextMenu,
    getActiveContextMenu,
    setActiveContextMenu,
    applyContextMenuSemantics,
    refreshGitStatus,
  } = options;

  async function switchBranch(gitPath: string, branchName: string): Promise<void> {
    const project = appState.activeProject;
    const freshStatus = project ? getGitStatus(project.id) : null;
    const dirty = freshStatus ? freshStatus.staged + freshStatus.modified + freshStatus.conflicted : 0;
    if (dirty > 0) {
      const confirmed = confirm(`You have uncommitted changes. Switch to "${branchName}" anyway?`);
      if (!confirmed) return;
    }

    try {
      await window.calder.git.checkoutBranch(gitPath, branchName);
      refreshGitStatus();
    } catch (err) {
      alert(`Failed to switch branch: ${err instanceof Error ? err.message : err}`);
    }
  }

  function promptCreateBranch(gitPath: string): void {
    showModal('Create New Branch', [
      { label: 'Branch name', id: 'branch-name', placeholder: 'feature/my-branch' },
    ], async (values) => {
      const name = values['branch-name']?.trim();
      if (!name) {
        setModalError('branch-name', 'Branch name is required');
        return;
      }
      if (/\s/.test(name)) {
        setModalError('branch-name', 'Branch name cannot contain spaces');
        return;
      }
      try {
        await window.calder.git.createBranch(gitPath, name);
        closeModal();
        refreshGitStatus();
      } catch (err) {
        setModalError('branch-name', err instanceof Error ? err.message : 'Failed to create branch');
      }
    });
  }

  async function showBranchContextMenu(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    hideTabContextMenu();

    const project = appState.activeProject;
    if (!project) return;

    const status = getGitStatus(project.id);
    if (!status || !status.isGitRepo) return;

    const gitPath = getActiveGitPath(project.id);

    const menu = document.createElement('div');
    menu.className = 'tab-context-menu calder-floating-list';
    menu.addEventListener('click', (clickEvent) => clickEvent.stopPropagation());
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Branch actions');

    const elRect = gitStatusEl.getBoundingClientRect();
    menu.style.left = `${elRect.left}px`;
    menu.style.top = `${elRect.bottom + 4}px`;

    const loadingItem = document.createElement('div');
    loadingItem.className = 'tab-context-menu-item disabled';
    loadingItem.textContent = 'Loading branches\u2026';
    menu.appendChild(loadingItem);

    document.body.appendChild(menu);
    setActiveContextMenu(menu);

    try {
      const branches = await window.calder.git.listBranches(gitPath);

      if (getActiveContextMenu() !== menu) return;

      menu.innerHTML = '';
      menu.addEventListener('click', (clickEvent) => clickEvent.stopPropagation());

      const searchInput = document.createElement('input');
      searchInput.className = 'branch-search-input';
      searchInput.type = 'text';
      searchInput.placeholder = 'Filter branches\u2026';
      searchInput.setAttribute('aria-label', 'Filter branches');
      menu.appendChild(searchInput);

      const container = document.createElement('div');
      container.className = 'branch-list-container';
      menu.appendChild(container);

      let filteredBranches = branches;
      let activeIndex = 0;
      let itemElements: HTMLElement[] = [];

      function setActiveHighlight(): void {
        itemElements.forEach((item, index) => {
          item.classList.toggle('keyboard-active', index === activeIndex);
        });
      }

      function setActiveAndScroll(): void {
        setActiveHighlight();
        itemElements[activeIndex]?.scrollIntoView({ block: 'nearest' });
      }

      function renderBranchItems(query: string): void {
        const lowerQuery = query.toLowerCase();
        filteredBranches = lowerQuery
          ? branches.filter((branch) => branch.name.toLowerCase().includes(lowerQuery))
          : branches;
        activeIndex = 0;
        itemElements = [];
        container.innerHTML = '';

        if (filteredBranches.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'tab-context-menu-item disabled';
          empty.textContent = 'No matching branches';
          empty.setAttribute('role', 'menuitem');
          empty.setAttribute('aria-disabled', 'true');
          empty.tabIndex = -1;
          container.appendChild(empty);
          return;
        }

        for (let index = 0; index < filteredBranches.length; index++) {
          const branch = filteredBranches[index];
          const item = document.createElement('div');
          item.className = 'tab-context-menu-item'
            + (branch.current ? ' active' : '')
            + (index === activeIndex ? ' keyboard-active' : '');
          item.textContent = (branch.current ? '\u2713 ' : '  ') + branch.name;
          item.setAttribute('role', 'menuitem');
          item.setAttribute('aria-disabled', branch.current ? 'true' : 'false');
          item.tabIndex = -1;
          item.addEventListener('mouseenter', () => {
            activeIndex = index;
            setActiveHighlight();
          });

          if (!branch.current) {
            item.addEventListener('click', () => {
              hideTabContextMenu();
              void switchBranch(gitPath, branch.name);
            });
          }

          itemElements.push(item);
          container.appendChild(item);
        }
      }

      searchInput.addEventListener('input', () => renderBranchItems(searchInput.value));
      searchInput.addEventListener('keydown', (keyEvent) => {
        keyEvent.stopPropagation();
        switch (keyEvent.key) {
          case 'ArrowDown':
            keyEvent.preventDefault();
            if (filteredBranches.length > 0) {
              activeIndex = (activeIndex + 1) % filteredBranches.length;
              setActiveAndScroll();
            }
            break;
          case 'ArrowUp':
            keyEvent.preventDefault();
            if (filteredBranches.length > 0) {
              activeIndex = (activeIndex - 1 + filteredBranches.length) % filteredBranches.length;
              setActiveAndScroll();
            }
            break;
          case 'Enter':
            keyEvent.preventDefault();
            if (activeIndex < filteredBranches.length) {
              const selected = filteredBranches[activeIndex];
              if (!selected.current) {
                hideTabContextMenu();
                void switchBranch(gitPath, selected.name);
              }
            }
            break;
          case 'Escape':
            keyEvent.preventDefault();
            hideTabContextMenu();
            break;
        }
      });

      renderBranchItems('');

      const separator = document.createElement('div');
      separator.className = 'tab-context-menu-separator';
      menu.appendChild(separator);

      const createItem = document.createElement('div');
      createItem.className = 'tab-context-menu-item';
      createItem.textContent = 'Create New Branch\u2026';
      createItem.addEventListener('click', () => {
        hideTabContextMenu();
        promptCreateBranch(gitPath);
      });
      menu.appendChild(createItem);

      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
      if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;

      applyContextMenuSemantics(menu, 'Branch actions', false);
      searchInput.focus();
    } catch {
      if (getActiveContextMenu() !== menu) return;
      menu.innerHTML = '';
      const errorItem = document.createElement('div');
      errorItem.className = 'tab-context-menu-item disabled';
      errorItem.textContent = 'Failed to load branches';
      menu.appendChild(errorItem);
      applyContextMenuSemantics(menu, 'Branch actions', false);
    }
  }

  return {
    showBranchContextMenu,
  };
}
