export type ConfigDocumentKind = 'agent' | 'skill' | 'command';

export interface AgentDocOutlineItem {
  level: number;
  text: string;
  slug: string;
}

export interface AgentDocModel {
  kind: ConfigDocumentKind;
  metadata: Record<string, string>;
  summary: {
    name: string | null;
    description: string | null;
    model: string | null;
    tools: string[];
  };
  outline: AgentDocOutlineItem[];
  content: string;
}

function stripMarkdownDecorators(input: string): string {
  return input
    .replace(/`+/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .trim();
}

export function slugifyHeading(text: string): string {
  return stripMarkdownDecorators(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'section';
}

export function getConfigDocumentKind(filePath: string): ConfigDocumentKind | null {
  if (/(^|[\\/])agents[\\/].+\.(md|markdown|mdown|mkd|mdx)$/i.test(filePath)) {
    return 'agent';
  }
  if (/(^|[\\/])skills[\\/].+\.(md|markdown|mdown|mkd|mdx)$/i.test(filePath)) {
    return 'skill';
  }
  if (/(^|[\\/])commands[\\/].+\.(md|markdown|mdown|mkd|mdx)$/i.test(filePath)) {
    return 'command';
  }
  return null;
}

export function isConfigDocumentPath(filePath: string): boolean {
  return getConfigDocumentKind(filePath) !== null;
}

export const isAgentDocumentPath = isConfigDocumentPath;

function normalizeFrontmatterValue(value: string): string {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

function collapseBlockLines(lines: string[]): string {
  return lines
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMarkdownFrontmatter(content: string): { metadata: Record<string, string>; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    return { metadata: {}, body: content };
  }

  const metadata: Record<string, string> = {};
  let blockKey: string | null = null;
  let blockLines: string[] = [];

  const flushBlock = (): void => {
    if (!blockKey) return;
    metadata[blockKey] = collapseBlockLines(blockLines);
    blockKey = null;
    blockLines = [];
  };

  for (const line of match[1].split('\n')) {
    if (blockKey) {
      if (/^\s*$/.test(line)) {
        blockLines.push('');
        continue;
      }
      if (/^\s+/.test(line)) {
        blockLines.push(line.trim());
        continue;
      }
      flushBlock();
    }

    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) continue;
    if (value === '>' || value === '|') {
      blockKey = key;
      blockLines = [];
      continue;
    }
    metadata[key] = normalizeFrontmatterValue(value);
  }
  flushBlock();

  return {
    metadata,
    body: content.slice(match[0].length),
  };
}

export function extractMarkdownOutline(content: string): AgentDocOutlineItem[] {
  const outline: AgentDocOutlineItem[] = [];
  const slugCounts = new Map<string, number>();
  let inFence = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = trimmed.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (!match) continue;

    const text = stripMarkdownDecorators(match[2]);
    if (!text) continue;

    const baseSlug = slugifyHeading(text);
    const count = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, count + 1);

    outline.push({
      level: match[1].length,
      text,
      slug: count === 0 ? baseSlug : `${baseSlug}-${count + 1}`,
    });
  }

  return outline;
}

function getFileStem(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  return fileName.replace(/\.[^.]+$/u, '');
}

function getParentDirectoryName(filePath: string): string | null {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts.at(-2) ?? null;
}

function extractFirstParagraph(content: string): string | null {
  const lines = content.split('\n');
  const paragraph: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!trimmed) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(stripMarkdownDecorators(trimmed));
  }

  return paragraph.length > 0 ? paragraph.join(' ').replace(/\s+/g, ' ').trim() : null;
}

function deriveDocumentName(kind: ConfigDocumentKind, filePath: string, metadata: Record<string, string>): string | null {
  if (kind === 'command') {
    return `/${getFileStem(filePath)}`;
  }
  if (metadata.name) {
    return metadata.name;
  }
  if (kind === 'skill') {
    return getParentDirectoryName(filePath);
  }
  return getFileStem(filePath);
}

function deriveDocumentTools(kind: ConfigDocumentKind, metadata: Record<string, string>): string[] {
  if (kind === 'agent') {
    return (metadata.tools ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (kind === 'command' && metadata['argument-hint']) {
    return [metadata['argument-hint']];
  }
  return [];
}

export function buildConfigDocModel(filePath: string, content: string): AgentDocModel | null {
  const kind = getConfigDocumentKind(filePath);
  if (!kind) return null;

  const { metadata, body } = parseMarkdownFrontmatter(content);
  return {
    kind,
    metadata,
    summary: {
      name: deriveDocumentName(kind, filePath, metadata),
      description: metadata.description ?? extractFirstParagraph(body),
      model: kind === 'agent' ? metadata.model ?? null : null,
      tools: deriveDocumentTools(kind, metadata),
    },
    outline: extractMarkdownOutline(body),
    content: body,
  };
}

export const buildAgentDocModel = buildConfigDocModel;
