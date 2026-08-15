import { t } from '../i18n.js';
import {
  renderMcpEmptyState,
  renderPromptsList,
  renderResourcesList,
  renderToolsList,
} from './mcp-inspector-lists.js';
import { applyTabularNums } from './surface-services/dom-utils.js';

type NavTab = 'tools' | 'resources' | 'prompts';

interface McpInspectorInstance {
  element: HTMLElement;
  connected: boolean;
  url: string;
  activeTab: NavTab;
  toolsList: unknown[];
  resourcesList: unknown[];
  promptsList: unknown[];
}

const instances = new Map<string, McpInspectorInstance>();

function setMcpStatus(
  pill: HTMLElement,
  dot: HTMLElement,
  label: HTMLElement,
  status: 'connected' | 'connecting' | 'disconnected',
  text: string,
): void {
  pill.className = `mcp-status-pill ${status}`;
  dot.className = `mcp-status ${status}`;
  label.className = 'mcp-status-label';
  label.textContent = text;
}

export function createInspectorPane(sessionId: string): void {
  if (instances.has(sessionId)) return;

  const pane = document.createElement('div');
  pane.className = 'mcp-inspector-pane hidden';
  pane.dataset.sessionId = sessionId;

  pane.innerHTML = `
    <div class="mcp-inspector-header">
      <input class="mcp-url-input" type="text" aria-label="${t('MCP server URL')}" placeholder="${t('MCP server URL (e.g. http://localhost:3000/mcp)')}" />
      <button class="mcp-connect-btn">${t('Connect')}</button>
      <span class="mcp-status-pill disconnected">
        <span class="mcp-status disconnected"></span>
        <span class="mcp-status-label">${t('Disconnected')}</span>
      </span>
    </div>
    <div class="mcp-inspector-body">
      <div class="mcp-inspector-nav">
        <button class="mcp-nav-tab active" data-tab="tools">${t('Tools')} <span class="mcp-nav-count">0</span></button>
        <button class="mcp-nav-tab" data-tab="resources">${t('Resources')} <span class="mcp-nav-count">0</span></button>
        <button class="mcp-nav-tab" data-tab="prompts">${t('Prompts')} <span class="mcp-nav-count">0</span></button>
      </div>
      <div class="mcp-inspector-content">
      </div>
    </div>
  `;

  const instance: McpInspectorInstance = {
    element: pane,
    connected: false,
    url: '',
    activeTab: 'tools',
    toolsList: [],
    resourcesList: [],
    promptsList: [],
  };
  instances.set(sessionId, instance);

  // Wire events
  const urlInput = pane.querySelector('.mcp-url-input') as HTMLInputElement;
  const connectBtn = pane.querySelector('.mcp-connect-btn') as HTMLButtonElement;
  const statusPill = pane.querySelector('.mcp-status-pill') as HTMLElement;
  const statusDot = pane.querySelector('.mcp-status') as HTMLElement;
  const statusLabel = pane.querySelector('.mcp-status-label') as HTMLElement;
  const navTabs = pane.querySelectorAll('.mcp-nav-tab');
  const content = pane.querySelector('.mcp-inspector-content') as HTMLElement;
  setMcpStatus(statusPill, statusDot, statusLabel, 'disconnected', t('Disconnected'));
  pane
    .querySelectorAll('.mcp-nav-count')
    .forEach((count) => applyTabularNums(count as HTMLElement));
  renderMcpEmptyState(
    content,
    t('Connect an MCP server'),
    t('Inspect tools, resources, and prompts from one place.'),
  );

  connectBtn.addEventListener('click', async () => {
    if (instance.connected) {
      await doDisconnect(
        sessionId,
        instance,
        connectBtn,
        statusPill,
        statusDot,
        statusLabel,
        content,
      );
    } else {
      const url = urlInput.value.trim();
      if (!url) return;
      await doConnect(
        sessionId,
        url,
        instance,
        connectBtn,
        statusPill,
        statusDot,
        statusLabel,
        urlInput,
        content,
      );
    }
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !instance.connected) {
      connectBtn.click();
    }
  });

  for (const tab of navTabs) {
    tab.addEventListener('click', () => {
      instance.activeTab = (tab as HTMLElement).dataset.tab as NavTab;
      navTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderContent(sessionId, instance, content);
    });
  }
}

async function doConnect(
  sessionId: string,
  url: string,
  instance: McpInspectorInstance,
  btn: HTMLButtonElement,
  pill: HTMLElement,
  dot: HTMLElement,
  statusLabel: HTMLElement,
  urlInput: HTMLInputElement,
  content: HTMLElement,
): Promise<void> {
  btn.disabled = true;
  btn.textContent = t('Connecting...');
  setMcpStatus(pill, dot, statusLabel, 'connecting', t('Connecting'));

  const result = await window.calder.mcp.connect(sessionId, url);
  if (result.success) {
    instance.connected = true;
    instance.url = url;
    btn.textContent = t('Disconnect');
    setMcpStatus(pill, dot, statusLabel, 'connected', t('Connected'));
    urlInput.disabled = true;
    await refreshLists(sessionId, instance, content);
  } else {
    btn.textContent = t('Connect');
    setMcpStatus(pill, dot, statusLabel, 'disconnected', t('Disconnected'));
    renderMcpEmptyState(
      content,
      t('Connection failed'),
      result.error || t('Unknown error'),
      'error',
    );
  }
  btn.disabled = false;
}

async function doDisconnect(
  sessionId: string,
  instance: McpInspectorInstance,
  btn: HTMLButtonElement,
  pill: HTMLElement,
  dot: HTMLElement,
  statusLabel: HTMLElement,
  content: HTMLElement,
): Promise<void> {
  await window.calder.mcp.disconnect(sessionId);
  instance.connected = false;
  instance.toolsList = [];
  instance.resourcesList = [];
  instance.promptsList = [];
  btn.textContent = t('Connect');
  setMcpStatus(pill, dot, statusLabel, 'disconnected', t('Disconnected'));
  const urlInput = instance.element.querySelector('.mcp-url-input') as HTMLInputElement;
  urlInput.disabled = false;
  updateCounts(instance);
  renderMcpEmptyState(
    content,
    t('Disconnected'),
    t('Reconnect to inspect MCP capabilities again.'),
  );
}

async function refreshLists(
  sessionId: string,
  instance: McpInspectorInstance,
  content: HTMLElement,
): Promise<void> {
  const [tools, resources, prompts] = await Promise.all([
    window.calder.mcp.listTools(sessionId),
    window.calder.mcp.listResources(sessionId),
    window.calder.mcp.listPrompts(sessionId),
  ]);

  instance.toolsList = tools.success ? (tools.data as unknown[]) : [];
  instance.resourcesList = resources.success ? (resources.data as unknown[]) : [];
  instance.promptsList = prompts.success ? (prompts.data as unknown[]) : [];

  updateCounts(instance);
  renderContent(sessionId, instance, content);
}

function updateCounts(instance: McpInspectorInstance): void {
  const counts = instance.element.querySelectorAll('.mcp-nav-count');
  counts.forEach((count) => applyTabularNums(count as HTMLElement));
  counts[0].textContent = String(instance.toolsList.length);
  counts[1].textContent = String(instance.resourcesList.length);
  counts[2].textContent = String(instance.promptsList.length);
}

function renderContent(
  sessionId: string,
  instance: McpInspectorInstance,
  content: HTMLElement,
): void {
  content.innerHTML = '';

  if (!instance.connected) {
    renderMcpEmptyState(
      content,
      t('Connect an MCP server'),
      t('Inspect tools, resources, and prompts from one place.'),
    );
    return;
  }

  switch (instance.activeTab) {
    case 'tools':
      renderToolsList(sessionId, instance.toolsList, content);
      break;
    case 'resources':
      renderResourcesList(sessionId, instance.resourcesList, content);
      break;
    case 'prompts':
      renderPromptsList(sessionId, instance.promptsList, content);
      break;
  }
}

export function destroyInspectorPane(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  instance.element.remove();
  instances.delete(sessionId);
}

export function showInspectorPane(sessionId: string, split: boolean): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  instance.element.classList.remove('hidden');
  if (split) {
    instance.element.classList.add('split');
  } else {
    instance.element.classList.remove('split');
  }
}

export function hideAllInspectorPanes(): void {
  for (const instance of instances.values()) {
    instance.element.classList.add('hidden');
  }
}

export function attachInspectorToContainer(sessionId: string, container: HTMLElement): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  container.appendChild(instance.element);
}

export function getInspectorInstance(sessionId: string): McpInspectorInstance | undefined {
  return instances.get(sessionId);
}

export async function disconnectInspector(sessionId: string): Promise<void> {
  const instance = instances.get(sessionId);
  if (instance?.connected) {
    await window.calder.mcp.disconnect(sessionId);
  }
}
