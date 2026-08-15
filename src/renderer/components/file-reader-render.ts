import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { appState } from '../state.js';
import { escapeHtml } from './dom-search-backend.js';
import {
  type AgentDocModel,
  buildConfigDocModel,
  getConfigDocumentKind,
  isConfigDocumentPath,
} from './file-reader-agent-doc.js';

export interface FileReaderInstance {
  element: HTMLElement;
  filePath: string;
  resolvedPath: string | null;
  loaded: boolean;
  targetLine?: number;
  viewMode: 'raw' | 'rendered';
  rawContent?: string;
  configDoc: AgentDocModel | null;
}

export function isMarkdownFile(filePath: string): boolean {
  return /\.(md|markdown|mdown|mkd|mdx)$/i.test(filePath);
}

export function renderFileContent(content: string): HTMLElement {
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
  if (
    !configDoc.summary.name &&
    !configDoc.summary.description &&
    !configDoc.summary.model &&
    configDoc.summary.tools.length === 0
  ) {
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

function renderConfigDocOutline(
  configDoc: AgentDocModel,
  markdownBody: HTMLElement,
): HTMLElement | null {
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

export function renderBody(instance: FileReaderInstance): void {
  const body = instance.element.querySelector('.file-reader-body')!;
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

export function resolveFilePath(instance: FileReaderInstance): string {
  const project = appState.activeProject;
  if (instance.filePath.startsWith('/')) return instance.filePath;
  return project ? `${project.path}/${instance.filePath}` : instance.filePath;
}

export function appendFileReaderMessage(body: HTMLElement, message: string): void {
  body.replaceChildren();
  const content = document.createElement('div');
  content.className = 'file-reader-content';
  const line = document.createElement('div');
  line.className = 'file-reader-line';
  const text = document.createElement('span');
  text.className = 'file-reader-line-text';
  text.textContent = message;
  line.appendChild(text);
  content.appendChild(line);
  body.appendChild(content);
}

export function scrollToLine(instance: FileReaderInstance): void {
  const line = instance.targetLine;
  if (!line) return;

  const body = instance.element.querySelector('.file-reader-body');
  if (!body) return;

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

export { buildConfigDocModel, getConfigDocumentKind, isConfigDocumentPath };
