import { t } from '../i18n.js';
import { appState } from '../state.js';
import {
  appendFileReaderMessage,
  buildConfigDocModel,
  type FileReaderInstance,
  getConfigDocumentKind,
  isConfigDocumentPath,
  isMarkdownFile,
  renderBody,
  resolveFilePath,
  scrollToLine,
} from './file-reader-render.js';
import { destroySearchBar } from './search-bar.js';

export type { FileReaderInstance } from './file-reader-render.js';

const instances = new Map<string, FileReaderInstance>();
let unwatchFileChanged: (() => void) | null = null;

async function loadFile(instance: FileReaderInstance): Promise<void> {
  if (instance.loaded) return;

  const project = appState.activeProject;
  if (!project) return;

  const body = instance.element.querySelector('.file-reader-body')!;
  body.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'file-reader-content';
  const loadingLine = document.createElement('div');
  loadingLine.className = 'file-reader-line';
  const loadingText = document.createElement('span');
  loadingText.className = 'file-reader-line-text';
  loadingText.textContent = t('Loading...');
  loadingLine.appendChild(loadingText);
  loading.appendChild(loadingLine);
  body.appendChild(loading);

  try {
    const fullPath = resolveFilePath(instance);
    const result = await window.calder.fs.readFile(fullPath);
    if (!result.ok) {
      const reasonText =
        result.reason === 'blocked'
          ? t('Access to this file is blocked')
          : result.reason === 'too-large'
            ? t('File is too large to preview')
            : result.reason === 'not-found'
              ? t('File not found')
              : t('Failed to load file');
      appendFileReaderMessage(body, reasonText);
      return;
    }
    instance.rawContent = result.content;
    instance.configDoc = buildConfigDocModel(instance.filePath, result.content);
    body.replaceChildren();
    renderBody(instance);
    instance.loaded = true;
    if (instance.targetLine && instance.viewMode === 'raw') {
      scrollToLine(instance);
    }
  } catch {
    appendFileReaderMessage(body, t('Failed to load file'));
  }
}

function ensureFileChangedListener(): void {
  if (unwatchFileChanged) return;
  unwatchFileChanged = window.calder.fs.onFileChanged((changedPath: string) => {
    for (const [sessionId, instance] of instances) {
      if (instance.resolvedPath === changedPath && instance.loaded) {
        reloadFileReader(sessionId);
      }
    }
  });
}

export function reloadFileReader(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  instance.loaded = false;
  void loadFile(instance);
}

export function createFileReaderPane(
  sessionId: string,
  filePath: string,
  targetLine?: number,
): void {
  if (instances.has(sessionId)) return;

  const el = document.createElement('div');
  el.className = 'file-reader-pane';
  el.dataset.sessionId = sessionId;
  el.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'file-viewer-header';

  const headerCopy = document.createElement('div');
  headerCopy.className = 'file-viewer-header-copy';

  const pathSpan = document.createElement('span');
  pathSpan.className = 'file-viewer-title file-viewer-path';
  pathSpan.textContent = filePath;

  const meta = document.createElement('span');
  meta.className = 'file-viewer-meta';
  meta.textContent = isConfigDocumentPath(filePath) ? 'Document surface' : 'Read-only preview';

  headerCopy.appendChild(pathSpan);
  headerCopy.appendChild(meta);

  const toolbar = document.createElement('div');
  toolbar.className = 'file-viewer-toolbar';

  const badge = document.createElement('span');
  badge.className = 'file-reader-badge calder-status-pill';
  const configDocKind = getConfigDocumentKind(filePath);
  const isConfigDoc = isConfigDocumentPath(filePath);
  badge.textContent = configDocKind ? `${configDocKind.toUpperCase()} DOC` : 'READ-ONLY';

  toolbar.appendChild(badge);

  const isMd = isMarkdownFile(filePath);
  const instance: FileReaderInstance = {
    element: el,
    filePath,
    resolvedPath: null,
    loaded: false,
    targetLine,
    viewMode: isMd ? 'rendered' : 'raw',
    configDoc: null,
  };

  if (isMd) {
    const toggleGroup = document.createElement('div');
    toggleGroup.className = 'file-reader-view-toggle';

    const renderedBtn = document.createElement('button');
    renderedBtn.className = 'search-toggle-btn active';
    renderedBtn.textContent = isConfigDoc ? t('Document') : t('Rendered');
    renderedBtn.title = isConfigDoc ? t('Document View') : t('Rendered Markdown');

    const rawBtn = document.createElement('button');
    rawBtn.className = 'search-toggle-btn';
    rawBtn.textContent = t('Raw');
    rawBtn.title = t('Raw Text');

    const setMode = (mode: 'raw' | 'rendered') => {
      instance.viewMode = mode;
      renderedBtn.classList.toggle('active', mode === 'rendered');
      rawBtn.classList.toggle('active', mode === 'raw');
      if (instance.rawContent !== undefined) {
        renderBody(instance);
      }
    };

    renderedBtn.addEventListener('click', () => setMode('rendered'));
    rawBtn.addEventListener('click', () => setMode('raw'));

    toggleGroup.appendChild(renderedBtn);
    toggleGroup.appendChild(rawBtn);
    toolbar.appendChild(toggleGroup);
  }

  header.appendChild(headerCopy);
  header.appendChild(toolbar);
  el.appendChild(header);

  const body = document.createElement('div');
  body.className = 'file-reader-body';
  el.appendChild(body);

  instances.set(sessionId, instance);
}

export function destroyFileReaderPane(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  if (instance.resolvedPath) {
    window.calder.fs.unwatchFile(instance.resolvedPath);
  }
  destroySearchBar(sessionId);
  destroyGoToLineBar(sessionId);
  instance.element.remove();
  instances.delete(sessionId);
}

export function showFileReaderPane(sessionId: string, isSplit: boolean): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  instance.element.style.display = 'flex';
  if (isSplit) instance.element.classList.add('split');
  else instance.element.classList.remove('split');

  if (!instance.resolvedPath) {
    const fullPath = resolveFilePath(instance);
    instance.resolvedPath = fullPath;
    ensureFileChangedListener();
    window.calder.fs.watchFile(fullPath);
  }

  void loadFile(instance);
  if (instance.loaded && instance.targetLine) {
    scrollToLine(instance);
  }
}

export function setFileReaderLine(sessionId: string, line: number): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  instance.targetLine = line;
  if (instance.loaded) {
    scrollToLine(instance);
  }
}

export function hideAllFileReaderPanes(): void {
  for (const instance of instances.values()) {
    instance.element.style.display = 'none';
  }
}

export function attachFileReaderToContainer(sessionId: string, container: HTMLElement): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  container.appendChild(instance.element);
}

export function getFileReaderInstance(sessionId: string): FileReaderInstance | undefined {
  return instances.get(sessionId);
}

const MARKDOWN_TEXT_SELECTOR = [
  'p',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'td',
  'th',
  'pre',
  'blockquote',
]
  .map((tag) => `.file-reader-markdown ${tag}`)
  .join(', ');

const RAW_TEXT_SELECTOR = '.file-reader-line-text';

export function getFileReaderTextSelector(sessionId: string): string {
  const instance = instances.get(sessionId);
  if (!instance) return RAW_TEXT_SELECTOR;
  return instance.viewMode === 'rendered' ? MARKDOWN_TEXT_SELECTOR : RAW_TEXT_SELECTOR;
}

const goToLineBars = new Map<string, { bar: HTMLDivElement; input: HTMLInputElement }>();

export function showGoToLineBar(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  if (instance.viewMode === 'rendered') return;

  const existing = goToLineBars.get(sessionId);
  if (existing) {
    existing.bar.classList.remove('hidden');
    existing.input.focus();
    existing.input.select();
    return;
  }

  const bar = document.createElement('div');
  bar.className = 'goto-line-bar';

  const label = document.createElement('span');
  label.className = 'goto-line-label';
  label.textContent = t('Line');

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.placeholder = t('Go to line...');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'search-nav-btn search-close-btn';
  closeBtn.textContent = '\u2715';
  closeBtn.setAttribute('aria-label', t('Close go to line'));
  closeBtn.title = t('Close (Escape)');

  bar.appendChild(label);
  bar.appendChild(input);
  bar.appendChild(closeBtn);

  instance.element.appendChild(bar);
  goToLineBars.set(sessionId, { bar, input });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const line = parseInt(input.value, 10);
      if (line > 0) {
        setFileReaderLine(sessionId, line);
      }
      hideGoToLineBar(sessionId);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideGoToLineBar(sessionId);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
      e.preventDefault();
      input.select();
    }
  });

  closeBtn.addEventListener('click', () => hideGoToLineBar(sessionId));

  input.focus();
}

export function hideGoToLineBar(sessionId: string): void {
  const entry = goToLineBars.get(sessionId);
  if (!entry) return;
  entry.bar.classList.add('hidden');
  const instance = instances.get(sessionId);
  if (instance) {
    (instance.element.querySelector('.file-reader-body') as HTMLElement | null)?.focus();
  }
}

function destroyGoToLineBar(sessionId: string): void {
  const entry = goToLineBars.get(sessionId);
  if (!entry) return;
  entry.bar.remove();
  goToLineBars.delete(sessionId);
}
