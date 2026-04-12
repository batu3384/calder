import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildAgentDocModel,
  isAgentDocumentPath,
  parseMarkdownFrontmatter,
} from './file-reader-agent-doc.js';

const fileReaderSource = readFileSync(new URL('./file-reader.ts', import.meta.url), 'utf-8');
const styles = readFileSync(new URL('../styles/file-viewer.css', import.meta.url), 'utf-8');

describe('file reader agent document helpers', () => {
  it('recognizes config markdown files under agents, skills, and commands directories', () => {
    expect(isAgentDocumentPath('/Users/me/.claude/agents/bug-analyzer.md')).toBe(true);
    expect(isAgentDocumentPath('/Users/me/project/agents/custom-agent.markdown')).toBe(true);
    expect(isAgentDocumentPath('/Users/me/.claude/skills/debugger/SKILL.md')).toBe(true);
    expect(isAgentDocumentPath('/Users/me/.claude/commands/commit.md')).toBe(true);
    expect(isAgentDocumentPath('/Users/me/project/docs/notes.md')).toBe(false);
  });

  it('parses frontmatter and strips it from the markdown body', () => {
    const parsed = parseMarkdownFrontmatter(`---
name: bug-analyzer
description: Deep debugger
model: opus
tools: read_file, write_file
---

# Heading

Body text
`);

    expect(parsed.metadata.name).toBe('bug-analyzer');
    expect(parsed.metadata.description).toBe('Deep debugger');
    expect(parsed.metadata.model).toBe('opus');
    expect(parsed.metadata.tools).toBe('read_file, write_file');
    expect(parsed.body.trim().startsWith('# Heading')).toBe(true);
  });

  it('parses folded frontmatter description blocks', () => {
    const parsed = parseMarkdownFrontmatter(`---
name: agent-reach
description: >
  Give your AI agent eyes to see the internet.
  Works across multiple platforms.
triggers:
  - search
---

# Agent Reach
`);

    expect(parsed.metadata.name).toBe('agent-reach');
    expect(parsed.metadata.description).toBe('Give your AI agent eyes to see the internet. Works across multiple platforms.');
    expect(parsed.body.trim()).toBe('# Agent Reach');
  });

  it('builds an agent doc model with summary fields and outline', () => {
    const model = buildAgentDocModel(
      '/Users/me/.claude/agents/bug-analyzer.md',
      `---
name: bug-analyzer
description: Deep debugger
model: opus
tools: read_file, write_file
---

# Code Execution Flow Analysis

Intro paragraph

## Core Expertise

### Static Analysis

\`\`\`md
## Ignored Inside Code Fence
\`\`\`
`
    );

    expect(model).not.toBeNull();
    expect(model?.metadata.name).toBe('bug-analyzer');
    expect(model?.summary.tools).toEqual(['read_file', 'write_file']);
    expect(model?.outline.map((item) => item.text)).toEqual([
      'Code Execution Flow Analysis',
      'Core Expertise',
      'Static Analysis',
    ]);
    expect(model?.content.trim().startsWith('# Code Execution Flow Analysis')).toBe(true);
  });

  it('builds a skill doc model with summary fallback and outline', () => {
    const model = buildAgentDocModel(
      '/Users/me/.claude/skills/agent-reach/SKILL.md',
      `---
name: agent-reach
description: >
  Give your AI agent eyes to see the internet.
  Search, read, and inspect the web.
---

# Agent Reach

## Routing

Body text
`
    );

    expect(model).not.toBeNull();
    expect(model?.summary.name).toBe('agent-reach');
    expect(model?.summary.description).toBe('Give your AI agent eyes to see the internet. Search, read, and inspect the web.');
    expect(model?.outline.map((item) => item.text)).toEqual(['Agent Reach', 'Routing']);
  });

  it('builds a command doc model with command name and argument hint', () => {
    const model = buildAgentDocModel(
      '/Users/me/.claude/commands/commit.md',
      `---
argument-hint: [--no-verify]
description: Create well-formatted commits
---

# Claude Command: Commit

## Usage

Body text
`
    );

    expect(model).not.toBeNull();
    expect(model?.summary.name).toBe('/commit');
    expect(model?.summary.description).toBe('Create well-formatted commits');
    expect(model?.summary.tools).toEqual(['[--no-verify]']);
    expect(model?.outline.map((item) => item.text)).toEqual(['Claude Command: Commit', 'Usage']);
  });

  it('renders config markdown through the dedicated agent document shell hooks', () => {
    expect(fileReaderSource).toContain('agent-doc-shell');
    expect(fileReaderSource).toContain('agent-doc-header');
    expect(fileReaderSource).toContain('agent-doc-body');
    expect(fileReaderSource).toContain('agent-doc-meta');
    expect(styles).toContain('.agent-doc-shell');
    expect(styles).toContain('.agent-doc-body');
  });
});
