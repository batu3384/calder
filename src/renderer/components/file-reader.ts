import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { appState } from '../state.js';
import { destroySearchBar } from './search-bar.js';
import { escapeHtml } from './dom-search-backend.js';
import {
  buildConfigDocModel,
  getConfigDocumentKind,
  isConfigDocumentPath,
  type AgentDocModel,
} from './file-reader-agent-doc.js';

interface FileReaderInstance {
  element: HTMLElement;
  filePath: string;
  resolvedPath: string | null;
  loaded: boolean;
  targetLine?: number;
  viewMode: 'raw' | 'rendered';
  rawContent?: string;
  configDoc: AgentDocModel | null;
}

function isMarkdownFile(filePath: string): boolean {
  return /\.(md|markdown|mdown|mkd|mdx)$/i.test(filePath);
}

const instances = new Map<string, FileReaderInstance>();
let unwatchFileChanged: (() => void) | null = null;

function renderFileContent(content: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'file-reader-content';

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const row = document.createElement('div');
    row.className = 'file-reader-line';

    const lineNum = document.createElement('span');
    lineNum.className = 'file-reader-line-num';
    lineNum.textContent = String(i + 1);

    const lineText = document.createElement('span');
    lineText.className = 'file-reader-line-text';
    lineText.innerHTML = escapeHtml(lines[i]) || '&nbsp;';

    row.appendChild(lineNum);
    row.appendChild(lineText);
    wrapper.appendChild(row);
  }

  return wrapper;
}

function renderConfigDocSummary(configDoc: AgentDocModel): HTMLElement | null {
  if (!configDoc.summary.name && !configDoc.summary.description && !configDoc.summary.model && configDoc.summary.tools.length === 0) {
    return null;
  }

  const card = document.createElement('section');
  card.className = 'file-reader-agent-card agent-doc-header';

  if (configDoc.summary.name) {
    const title = document.createElement('h1');
    title.className = 'file-reader-agent-title';
    title.textContent = configDoc.summary.name;
    card.appendChild(title);
  }

  if (configDoc.summary.description) {
    const description = document.createElement('p');
    description.className = 'file-reader-agent-description';
    description.textContent = configDoc.summary.description;
    card.appendChild(description);
  }

  const meta = document.createElement('div');
  meta.className = 'file-reader-agent-meta agent-doc-meta';

  if (configDoc.summary.model) {
    const model = document.createElement('span');
    model.className = 'file-reader-agent-chip';
    model.textContent = `Model: ${configDoc.summary.model}`;
    meta.appendChild(model);
  }

  for (const tool of configDoc.summary.tools) {
    const toolChip = document.createElement('span');
    toolChip.className = 'file-reader-agent-chip secondary';
    toolChip.textContent = tool;
    meta.appendChild(toolChip);
  }

  if (meta.childElementCount > 0) {
    card.appendChild(meta);
  }

  return card;
}

function applyConfigDocAnchors(container: HTMLElement, outline: AgentDocModel['outline']): void {
  const headings = Array.from(container.querySelectorAll('h1, h2, h3'));
  outline.forEach((item, index) => {
    const heading = headings[index] as HTMLElement | undefined;
    if (!heading) return;
    heading.id = item.slug;
    heading.dataset.level = String(item.level);
  });
}

function renderConfigDocOutline(configDoc: AgentDocModel, markdownBody: HTMLElement): HTMLElement | null {
  if (configDoc.outline.length === 0) return null;

  const nav = document.createElement('nav');
  nav.className = 'file-reader-doc-outline';
  nav.setAttribute('aria-label', 'Document sections');

  for (const item of configDoc.outline) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `file-reader-doc-outline-btn level-${item.level}`;
    button.textContent = item.text;
    button.addEventListener('click', () => {
      const target = markdownBody.querySelector(`#${item.slug}`) as HTMLElement | null;
      if (!target) return;
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    nav.appendChild(button);
  }

  return nav;
}

function renderMarkdownContent(content: string, instance: FileReaderInstance): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'file-reader-content file-reader-markdown';

  const markdown = instance.configDoc?.content ?? content;
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  const markdownBody = document.createElement('div');
  markdownBody.className = 'file-reader-markdown-body agent-doc-body';
  markdownBody.innerHTML = DOMPurify.sanitize(rawHtml);

  if (!instance.configDoc) {
    wrapper.appendChild(markdownBody);
    return wrapper;
  }

  applyConfigDocAnchors(markdownBody, instance.configDoc.outline);

  const shell = document.createElement('div');
  shell.className = 'file-reader-doc-shell agent-doc-shell';

  const summary = renderConfigDocSummary(instance.configDoc);
  if (summary) shell.appendChild(summary);

  const outline = renderConfigDocOutline(instance.configDoc, markdownBody);
  if (outline) shell.appendChild(outline);

  shell.appendChild(markdownBody);
  wrapper.appendChild(shell);
  return wrapper;
}

function renderBody(instance: FileReaderInstance): void {
  const body = instance.element.querySelector('.file-reader-body')!;
  // Preserve text selection if user is selecting
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed && body.contains(sel.anchorNode)) {
    return;
  }
  body.innerHTML = '';
  if (instance.viewMode === 'rendered') {
    body.appendChild(renderMarkdownContent(instance.rawContent!, instance));
  } else {
    body.appendChild(renderFileContent(instance.rawContent!));
  }
}

function resolveFilePath(instance: FileReaderInstance): string {
  const project = appState.activeProject;
  if (instance.filePath.startsWith('/')) return instance.filePath;
  return project ? `${project.path}/${instance.filePath}` : instance.filePath;
}

async function loadFile(instance: FileReaderInstance): Promise<void> {
  if (instance.loaded) return;

  const project = appState.activeProject;
  if (!project) return;

  const body = instance.element.querySelector('.file-reader-body')!;
  body.innerHTML = '';
  const loading = document.createElement('div');
  loading.className = 'file-reader-content';
  loading.innerHTML = '<div class="file-reader-line"><span class="file-reader-line-text">Loading...</span></div>';
  body.appendChild(loading);

  try {
    const fullPath = resolveFilePath(instance);
    const content = await window.calder.fs.readFile(fullPath);
    instance.rawContent = content;
    instance.configDoc = buildConfigDocModel(instance.filePath, content);
    body.innerHTML = '';
    renderBody(instance);
    instance.loaded = true;
    if (instance.targetLine && instance.viewMode === 'raw') {
      scrollToLine(instance);
    }
  } catch {
    body.innerHTML = '<div class="file-reader-content"><div class="file-reader-line"><span class="file-reader-line-text">Failed to load file</span></div></div>';
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
  loadFile(instance);
}

export function createFileReaderPane(sessionId: string, filePath: string, targetLine?: number): void {
  if (instances.has(sessionId)) return;

  const el = document.createElement('div');
  el.className = 'file-reader-pane';
  el.dataset.sessionId = sessionId;
  el.style.display = 'none';

  // Header
  const header = document.createElement('div');
  header.className = 'file-viewer-header';

  const pathSpan = document.createElement('span');
  pathSpan.className = 'file-viewer-path';
  pathSpan.textContent = filePath;

  const badge = document.createElement('span');
  badge.className = 'file-reader-badge';
  const configDocKind = getConfigDocumentKind(filePath);
  const isConfigDoc = isConfigDocumentPath(filePath);
  badge.textContent = configDocKind ? `${configDocKind.toUpperCase()} DOC` : 'READ-ONLY';

  header.appendChild(pathSpan);
  header.appendChild(badge);

  const isMd = isMarkdownFile(filePath);
  const instance: FileReaderInstance = {
    element: el, filePath, resolvedPath: null, loaded: false, targetLine,
    viewMode: isMd ? 'rendered' : 'raw',
    configDoc: null,
  };

  if (isMd) {
    const toggleGroup = document.createElement('div');
    toggleGroup.className = 'file-reader-view-toggle';

    const renderedBtn = document.createElement('button');
    renderedBtn.className = 'search-toggle-btn active';
    renderedBtn.textContent = isConfigDoc ? 'Document' : 'Rendered';
    renderedBtn.title = isConfigDoc ? 'Document View' : 'Rendered Markdown';

    const rawBtn = document.createElement('button');
    rawBtn.className = 'search-toggle-btn';
    rawBtn.textContent = 'Raw';
    rawBtn.title = 'Raw Text';

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
    header.appendChild(toggleGroup);
  }

  el.appendChild(header);

  // Scrollable body
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

  // Start watching the file for external changes
  if (!instance.resolvedPath) {
    const fullPath = resolveFilePath(instance);
    instance.resolvedPath = fullPath;
    ensureFileChangedListener();
    window.calder.fs.watchFile(fullPath);
  }

  loadFile(instance);
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

function scrollToLine(instance: FileReaderInstance): void {
  const line = instance.targetLine;
  if (!line) return;

  const body = instance.element.querySelector('.file-reader-body');
  if (!body) return;

  // Clear previous highlights
  body.querySelectorAll('.file-reader-line-highlight').forEach((el) => {
    el.classList.remove('file-reader-line-highlight');
  });

  const lines = body.querySelectorAll('.file-reader-line');
  const targetEl = lines[line - 1] as HTMLElement | undefined;
  if (!targetEl) return;

  targetEl.classList.add('file-reader-line-highlight');
  requestAnimationFrame(() => {
    targetEl.scrollIntoView({ block: 'center' });
  });
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
  'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th', 'pre', 'blockquote',
].map((tag) => `.file-reader-markdown ${tag}`).join(', ');

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

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.placeholder = 'Go to line...';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'search-nav-btn search-close-btn';
  closeBtn.textContent = '\u2715';
  closeBtn.title = 'Close (Escape)';

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
    instance.element.querySelector('.file-reader-body')?.focus();
  }
}

function destroyGoToLineBar(sessionId: string): void {
  const entry = goToLineBars.get(sessionId);
  if (!entry) return;
  entry.bar.remove();
  goToLineBars.delete(sessionId);
}
