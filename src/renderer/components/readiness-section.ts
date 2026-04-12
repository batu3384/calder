import { appState } from '../state.js';
import { showReadinessModal } from './readiness-modal.js';
import { esc, scoreColor } from '../dom-utils.js';
const container = document.getElementById('readiness-section')!;
type SectionPresentation = 'compact' | 'expanded' | 'promoted';
let collapsed = true;
let compactExpanded = false;
let scanning = false;
let lastExcludedKey = '';

function getSectionPresentation(): SectionPresentation {
  const wrapper = container.parentNode as { dataset?: Record<string, string> } | null;
  const value = wrapper?.dataset?.presentation;
  return value === 'compact' || value === 'promoted' || value === 'expanded' ? value : 'expanded';
}

function isDetailExpanded(presentation: SectionPresentation): boolean {
  if (presentation === 'promoted') return true;
  if (presentation === 'compact') return compactExpanded;
  return !collapsed;
}

export function initReadinessSection(): void {
  appState.on('state-loaded', () => {
    render();
    autoScanIfNeeded();
  });
  appState.on('project-changed', () => {
    render();
    autoScanIfNeeded();
  });
  appState.on('readiness-changed', render);
  appState.on('preferences-changed', () => {
    applyVisibility();
    const newKey = (appState.preferences.readinessExcludedProviders ?? []).join(',');
    if (newKey !== lastExcludedKey) {
      lastExcludedKey = newKey;
      autoScanIfNeeded();
    }
  });
  render();
}

function applyVisibility(): void {
  const visible = appState.preferences.sidebarViews?.readinessSection ?? true;
  container.classList.toggle('hidden', !visible);
}

function autoScanIfNeeded(): void {
  const project = appState.activeProject;
  if (!project) return;
  if (scanning) return;
  // Rescan silently if we already have results to avoid UI flicker
  runScan(!!project.readiness);
}

async function runScan(silent = false): Promise<void> {
  const project = appState.activeProject;
  if (!project || scanning) return;

  scanning = true;
  // Only show scanning UI when there's no existing result (or explicitly requested)
  if (!silent) render();

  try {
    const excluded = appState.preferences.readinessExcludedProviders ?? [];
    const result = await window.calder.readiness.analyze(project.path, excluded.length > 0 ? excluded : undefined);
    appState.setProjectReadiness(project.id, result);
  } catch (err) {
    console.warn('Readiness scan failed:', err);
  } finally {
    scanning = false;
    render();
  }
}


function render(): void {
  applyVisibility();
  const project = appState.activeProject;

  if (!project) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';
  const result = project.readiness;
  const presentation = getSectionPresentation();
  const detailExpanded = isDetailExpanded(presentation);
  const showCompactSummary = presentation === 'compact' && !detailExpanded;

  const section = document.createElement('div');
  section.className = 'config-section readiness-section-card';

  const header = document.createElement('div');
  header.className = 'config-section-header';

  const headingButton = document.createElement('button');
  headingButton.type = 'button';
  headingButton.className = 'config-section-heading config-section-toggle-button readiness-header-main';
  headingButton.setAttribute('aria-expanded', String(detailExpanded));
  headingButton.innerHTML = `<span class="config-section-toggle ${detailExpanded ? '' : 'collapsed'}">&#x25BC;</span><span class="config-section-title">Readiness</span>`;
  header.appendChild(headingButton);

  const actions = document.createElement('div');
  actions.className = 'config-section-meta readiness-header-actions';

  if (result) {
    const badge = document.createElement('span');
    badge.className = 'readiness-badge control-chip';
    badge.textContent = `${result.overallScore}%`;
    badge.style.background = scoreColor(result.overallScore);
    actions.appendChild(badge);
  }

  // Scan/Rescan button
  const scanBtn = document.createElement('button');
  scanBtn.type = 'button';
  scanBtn.className = 'readiness-scan-btn';
  scanBtn.textContent = scanning ? 'Scanning…' : (result ? 'Refresh' : 'Scan');
  scanBtn.disabled = scanning;
  scanBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    runScan();
  });
  actions.appendChild(scanBtn);
  header.appendChild(actions);

  const body = document.createElement('div');
  body.className = `config-section-body${detailExpanded || showCompactSummary ? '' : ' hidden'}`;

  if (scanning && !result) {
    const loading = document.createElement('div');
    loading.className = 'readiness-loading';
    loading.textContent = 'Analyzing project…';
    body.appendChild(loading);
  } else if (showCompactSummary && result) {
    const compact = document.createElement('div');
    compact.className = 'readiness-compact-summary';
    compact.textContent = result.overallScore >= 70 ? 'All good' : `${result.categories.length} health checks`;
    body.appendChild(compact);
  } else if (showCompactSummary) {
    const compact = document.createElement('div');
    compact.className = 'readiness-compact-summary';
    compact.textContent = 'Scan to check tool health';
    body.appendChild(compact);
  } else if (result) {
    for (const category of result.categories) {
      const row = document.createElement('div');
      row.className = 'readiness-category-row config-item-clickable calder-list-row';

      const color = scoreColor(category.score);
      row.innerHTML = `
        <span class="readiness-category-name">${esc(category.name)}</span>
        <div class="readiness-progress-bar">
          <div class="readiness-progress-fill" style="width:${category.score}%;background:${color}"></div>
        </div>
        <span class="readiness-category-score" style="color:${color}">${category.score}%</span>
      `;

      row.addEventListener('click', () => {
        showReadinessModal(result);
      });

      body.appendChild(row);
    }
  }

  headingButton.addEventListener('click', () => {
    if (presentation === 'promoted') return;
    if (presentation === 'compact') compactExpanded = !compactExpanded;
    else collapsed = !collapsed;
    render();
  });

  section.appendChild(header);
  section.appendChild(body);
  container.appendChild(section);
}
