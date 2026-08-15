import { t } from '../i18n.js';
import { type JsonSchema, renderSchemaForm } from './mcp-schema-form.js';

export function renderMcpEmptyState(
  container: HTMLElement,
  title: string,
  copy?: string,
  tone: 'empty' | 'error' = 'empty',
): void {
  const shell = document.createElement('div');
  shell.className =
    tone === 'error'
      ? 'mcp-empty-content mcp-empty-state mcp-error-state'
      : 'mcp-empty-content mcp-empty-state';
  if (tone === 'error') {
    shell.setAttribute('role', 'alert');
  }

  const titleEl = document.createElement('div');
  titleEl.className = 'mcp-empty-title';
  titleEl.textContent = title;
  shell.appendChild(titleEl);

  if (copy) {
    const copyEl = document.createElement('div');
    copyEl.className = 'mcp-empty-copy';
    copyEl.textContent = copy;
    shell.appendChild(copyEl);
  }

  container.replaceChildren(shell);
}

function esc(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

export function renderToolsList(sessionId: string, tools: unknown[], container: HTMLElement): void {
  if (tools.length === 0) {
    renderMcpEmptyState(
      container,
      t('No tools available'),
      t('This server did not expose any callable tools.'),
    );
    return;
  }

  for (const tool of tools as Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>) {
    const card = document.createElement('div');
    card.className = 'mcp-card';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'mcp-card-header';
    header.innerHTML = `<span class="mcp-card-name">${esc(tool.name)}</span>`;
    if (tool.description) {
      header.innerHTML += `<span class="mcp-card-desc">${esc(tool.description)}</span>`;
    }

    const body = document.createElement('div');
    body.className = 'mcp-card-body hidden';

    let formRef: { getValues: () => Record<string, unknown> } | null = null;

    header.addEventListener('click', () => {
      const isOpen = !body.classList.contains('hidden');
      body.classList.toggle('hidden');
      if (!isOpen && body.children.length === 0) {
        // Build form
        if (tool.inputSchema && (tool.inputSchema as Record<string, unknown>).properties) {
          const { element, getValues } = renderSchemaForm(tool.inputSchema as JsonSchema);
          formRef = { getValues };
          body.appendChild(element);
        }

        const execBtn = document.createElement('button');
        execBtn.className = 'mcp-exec-btn';
        execBtn.textContent = t('Execute');

        const resultPre = document.createElement('pre');
        resultPre.className = 'mcp-result hidden';

        execBtn.addEventListener('click', async () => {
          execBtn.disabled = true;
          execBtn.textContent = t('Executing...');
          resultPre.classList.remove('hidden');
          resultPre.textContent = t('Loading...');

          const args = formRef ? formRef.getValues() : {};
          const res = await window.calder.mcp.callTool(sessionId, tool.name, args);
          resultPre.textContent = JSON.stringify(
            res.success ? res.data : { error: res.error },
            null,
            2,
          );
          execBtn.disabled = false;
          execBtn.textContent = t('Execute');
        });

        body.appendChild(execBtn);
        body.appendChild(resultPre);
      }
    });

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  }
}

export function renderResourcesList(
  sessionId: string,
  resources: unknown[],
  container: HTMLElement,
): void {
  if (resources.length === 0) {
    renderMcpEmptyState(
      container,
      t('No resources available'),
      t('This server did not expose any readable resources.'),
    );
    return;
  }

  for (const resource of resources as Array<{ name: string; uri: string; description?: string }>) {
    const card = document.createElement('div');
    card.className = 'mcp-card';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'mcp-card-header';
    header.innerHTML = `<span class="mcp-card-name">${esc(resource.name)}</span><span class="mcp-card-uri">${esc(resource.uri)}</span>`;
    if (resource.description) {
      header.innerHTML += `<span class="mcp-card-desc">${esc(resource.description)}</span>`;
    }

    const body = document.createElement('div');
    body.className = 'mcp-card-body hidden';

    header.addEventListener('click', async () => {
      const isOpen = !body.classList.contains('hidden');
      body.classList.toggle('hidden');
      if (!isOpen && body.children.length === 0) {
        const resultPre = document.createElement('pre');
        resultPre.className = 'mcp-result';
        resultPre.textContent = t('Loading...');
        body.appendChild(resultPre);

        const res = await window.calder.mcp.readResource(sessionId, resource.uri);
        resultPre.textContent = JSON.stringify(
          res.success ? res.data : { error: res.error },
          null,
          2,
        );
      }
    });

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  }
}

export function renderPromptsList(
  sessionId: string,
  prompts: unknown[],
  container: HTMLElement,
): void {
  if (prompts.length === 0) {
    renderMcpEmptyState(
      container,
      t('No prompts available'),
      t('This server did not expose any prompt templates.'),
    );
    return;
  }

  for (const prompt of prompts as Array<{
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  }>) {
    const card = document.createElement('div');
    card.className = 'mcp-card';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'mcp-card-header';
    header.innerHTML = `<span class="mcp-card-name">${esc(prompt.name)}</span>`;
    if (prompt.description) {
      header.innerHTML += `<span class="mcp-card-desc">${esc(prompt.description)}</span>`;
    }

    const body = document.createElement('div');
    body.className = 'mcp-card-body hidden';

    let argInputs: Map<string, HTMLInputElement> | null = null;

    header.addEventListener('click', () => {
      const isOpen = !body.classList.contains('hidden');
      body.classList.toggle('hidden');
      if (!isOpen && body.children.length === 0) {
        // Build argument inputs
        if (prompt.arguments && prompt.arguments.length > 0) {
          argInputs = new Map();
          const form = document.createElement('div');
          form.className = 'mcp-schema-form';
          for (const arg of prompt.arguments) {
            const field = document.createElement('div');
            field.className = 'mcp-form-field';
            const label = document.createElement('label');
            label.textContent = arg.name + (arg.required ? ' *' : '');
            if (arg.description) label.title = arg.description;
            field.appendChild(label);
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'mcp-form-input';
            if (arg.description) input.placeholder = arg.description;
            field.appendChild(input);
            form.appendChild(field);
            argInputs.set(arg.name, input);
          }
          body.appendChild(form);
        }

        const execBtn = document.createElement('button');
        execBtn.className = 'mcp-exec-btn';
        execBtn.textContent = t('Run');

        const resultPre = document.createElement('pre');
        resultPre.className = 'mcp-result hidden';

        execBtn.addEventListener('click', async () => {
          execBtn.disabled = true;
          execBtn.textContent = t('Running...');
          resultPre.classList.remove('hidden');
          resultPre.textContent = t('Loading...');

          const args: Record<string, string> = {};
          if (argInputs) {
            for (const [name, input] of argInputs) {
              if (input.value.trim()) args[name] = input.value.trim();
            }
          }
          const res = await window.calder.mcp.getPrompt(sessionId, prompt.name, args);
          resultPre.textContent = JSON.stringify(
            res.success ? res.data : { error: res.error },
            null,
            2,
          );
          execBtn.disabled = false;
          execBtn.textContent = t('Run');
        });

        body.appendChild(execBtn);
        body.appendChild(resultPre);
      }
    });

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  }
}
