import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

import * as fs from 'fs';
import * as path from 'path';
import { findQwenTranscriptPath, getQwenConfig } from './qwen-config';

const n = (p: string) => p.replace(/\\/g, '/');

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockStatSync = vi.mocked(fs.statSync);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
  mockReaddirSync.mockImplementation(() => { throw new Error('ENOENT'); });
  mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });
});

describe('getQwenConfig', () => {
  it('returns empty config when no qwen files exist', async () => {
    await expect(getQwenConfig('/project')).resolves.toEqual({
      mcpServers: [],
      agents: [],
      skills: [],
      commands: [],
    });
  });

  it('reads MCP servers from user and project settings with project override', async () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.qwen/settings.json') {
        return JSON.stringify({
          mcpServers: {
            shared: { command: 'user-command' },
            userOnly: { url: 'http://user' },
          },
        }) as any;
      }
      if (filePath === '/project/.qwen/settings.json') {
        return JSON.stringify({
          mcpServers: {
            shared: { url: 'http://project' },
          },
        }) as any;
      }
      throw new Error('ENOENT');
    });

    const config = await getQwenConfig('/project');
    expect(config.mcpServers).toEqual([
      { name: 'shared', url: 'http://project', status: 'configured', scope: 'project', filePath: path.join('/project', '.qwen', 'settings.json') },
      { name: 'userOnly', url: 'http://user', status: 'configured', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'settings.json') },
    ]);
  });

  it('reads agents, skills, and commands from user and project directories', async () => {
    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/mock/home/.qwen/agents') return ['user-agent.md'] as any;
      if (dirPath === '/project/.qwen/agents') return ['project-agent.md'] as any;
      if (dirPath === '/mock/home/.qwen/skills') return ['user-skill'] as any;
      if (dirPath === '/project/.qwen/skills') return ['project-skill'] as any;
      if (dirPath === '/mock/home/.qwen/commands') return ['user-command.md'] as any;
      if (dirPath === '/project/.qwen/commands') return ['project-command.md'] as any;
      throw new Error('ENOENT');
    });

    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.qwen/agents/user-agent.md') return '---\nname: UserAgent\nmodel: qwen-max\n---\n' as any;
      if (filePath === '/project/.qwen/agents/project-agent.md') return '---\nname: ProjectAgent\nmodel: qwen-coder\n---\n' as any;
      if (filePath === '/mock/home/.qwen/skills/user-skill/SKILL.md') return '---\nname: UserSkill\ndescription: Useful\n---\n' as any;
      if (filePath === '/project/.qwen/skills/project-skill/SKILL.md') return '---\nname: ProjectSkill\ndescription: Project only\n---\n' as any;
      if (filePath === '/mock/home/.qwen/commands/user-command.md') return '---\ndescription: User command\n---\n' as any;
      if (filePath === '/project/.qwen/commands/project-command.md') return '---\ndescription: Project command\n---\n' as any;
      throw new Error('ENOENT');
    });

    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath.endsWith('/SKILL.md')) {
        return { isFile: () => true } as any;
      }
      throw new Error('ENOENT');
    });

    const config = await getQwenConfig('/project');
    expect(config.agents).toEqual([
      { name: 'UserAgent', model: 'qwen-max', category: 'plugin', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'agents', 'user-agent.md') },
      { name: 'ProjectAgent', model: 'qwen-coder', category: 'plugin', scope: 'project', filePath: path.join('/project', '.qwen', 'agents', 'project-agent.md') },
    ]);
    expect(config.skills).toEqual([
      { name: 'UserSkill', description: 'Useful', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'skills', 'user-skill', 'SKILL.md') },
      { name: 'ProjectSkill', description: 'Project only', scope: 'project', filePath: path.join('/project', '.qwen', 'skills', 'project-skill', 'SKILL.md') },
    ]);
    expect(config.commands).toEqual([
      { name: 'user-command', description: 'User command', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'commands', 'user-command.md') },
      { name: 'project-command', description: 'Project command', scope: 'project', filePath: path.join('/project', '.qwen', 'commands', 'project-command.md') },
    ]);
  });

  it('filters invalid entries and falls back for partial frontmatter while deduping names', async () => {
    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/mock/home/.qwen/agents') return ['shared.md', 'skip.txt', 'nameless.md', 'nomodel.md'] as any;
      if (dirPath === '/project/.qwen/agents') return ['shared.md'] as any;
      if (dirPath === '/mock/home/.qwen/skills') return ['.hidden', 'shared-skill', 'nofile', 'fallback-skill', 'empty-skill'] as any;
      if (dirPath === '/project/.qwen/skills') return ['shared-skill'] as any;
      if (dirPath === '/mock/home/.qwen/commands') return ['shared-command.md', 'README.txt', 'nodesc-command.md'] as any;
      if (dirPath === '/project/.qwen/commands') return ['shared-command.md'] as any;
      throw new Error('ENOENT');
    });

    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.qwen/settings.json') {
        return JSON.stringify({
          mcpServers: {
            shared: { command: 'user-cmd' },
            userOnly: { url: 'http://user' },
            invalid: {},
          },
        }) as any;
      }
      if (filePath === '/project/.qwen/settings.json') {
        return JSON.stringify({
          mcpServers: {
            shared: { url: 'http://project' },
            projectOnly: { command: 'project-cmd' },
          },
        }) as any;
      }
      if (filePath === '/mock/home/.qwen/agents/shared.md') return '---\nname: SharedAgent\nmodel: qwen-plus\n---\n' as any;
      if (filePath === '/project/.qwen/agents/shared.md') return '---\nname: SharedAgent\nmodel: project-model\n---\n' as any;
      if (filePath === '/mock/home/.qwen/agents/nameless.md') return '---\ndescription: missing name\n---\n' as any;
      if (filePath === '/mock/home/.qwen/agents/nomodel.md') return '---\nname: NoModel\nline without colon\n---\n' as any;
      if (filePath === '/mock/home/.qwen/skills/shared-skill/SKILL.md') return '---\nname: SharedSkill\ndescription: User skill\n---\n' as any;
      if (filePath === '/project/.qwen/skills/shared-skill/SKILL.md') return '---\nname: SharedSkill\ndescription: Project skill\n---\n' as any;
      if (filePath === '/mock/home/.qwen/skills/fallback-skill/SKILL.md') return '# no frontmatter\n' as any;
      if (filePath === '/mock/home/.qwen/skills/empty-skill/SKILL.md') return '' as any;
      if (filePath === '/mock/home/.qwen/commands/shared-command.md') return '---\ndescription: User command\n---\n' as any;
      if (filePath === '/project/.qwen/commands/shared-command.md') return '---\ndescription: Project command\n---\n' as any;
      if (filePath === '/mock/home/.qwen/commands/nodesc-command.md') return '---\nline without colon\n---\n' as any;
      throw new Error('ENOENT');
    });

    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (
        filePath === '/mock/home/.qwen/skills/shared-skill/SKILL.md'
        || filePath === '/project/.qwen/skills/shared-skill/SKILL.md'
        || filePath === '/mock/home/.qwen/skills/fallback-skill/SKILL.md'
        || filePath === '/mock/home/.qwen/skills/empty-skill/SKILL.md'
      ) {
        return { isFile: () => true } as any;
      }
      throw new Error('ENOENT');
    });

    const config = await getQwenConfig('/project');
    expect(config.mcpServers).toEqual([
      { name: 'shared', url: 'http://project', status: 'configured', scope: 'project', filePath: path.join('/project', '.qwen', 'settings.json') },
      { name: 'userOnly', url: 'http://user', status: 'configured', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'settings.json') },
      { name: 'projectOnly', url: 'project-cmd', status: 'configured', scope: 'project', filePath: path.join('/project', '.qwen', 'settings.json') },
    ]);
    expect(config.agents).toEqual([
      { name: 'SharedAgent', model: 'qwen-plus', category: 'plugin', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'agents', 'shared.md') },
      { name: 'NoModel', model: '', category: 'plugin', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'agents', 'nomodel.md') },
    ]);
    expect(config.skills).toEqual([
      { name: 'SharedSkill', description: 'User skill', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'skills', 'shared-skill', 'SKILL.md') },
      { name: 'fallback-skill', description: '', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'skills', 'fallback-skill', 'SKILL.md') },
      { name: 'empty-skill', description: '', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'skills', 'empty-skill', 'SKILL.md') },
    ]);
    expect(config.commands).toEqual([
      { name: 'shared-command', description: 'User command', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'commands', 'shared-command.md') },
      { name: 'nodesc-command', description: '', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'commands', 'nodesc-command.md') },
    ]);
  });
});

describe('findQwenTranscriptPath', () => {
  it('prefers QWEN_RUNTIME_DIR when searching for transcripts', () => {
    vi.stubEnv('QWEN_RUNTIME_DIR', '/runtime/qwen');

    try {
      mockReaddirSync.mockImplementation((inputPath) => {
        const dirPath = n(String(inputPath));
        if (dirPath === '/runtime/qwen/projects') return ['project-a'] as any;
        if (dirPath === '/runtime/qwen/projects/project-a/chats') return ['sid-1.jsonl'] as any;
        throw new Error('ENOENT');
      });
      mockStatSync.mockImplementation((inputPath) => {
        const filePath = n(String(inputPath));
        if (filePath === '/runtime/qwen/projects/project-a') return { isDirectory: () => true, mtimeMs: 10 } as any;
        if (filePath === '/runtime/qwen/projects/project-a/chats') return { isDirectory: () => true, mtimeMs: 10 } as any;
        if (filePath === '/runtime/qwen/projects/project-a/chats/sid-1.jsonl') return { isFile: () => true, mtimeMs: 20 } as any;
        throw new Error('ENOENT');
      });

      expect(findQwenTranscriptPath('sid-1', '/project')).toBe(
        path.join('/runtime/qwen', 'projects', 'project-a', 'chats', 'sid-1.jsonl'),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('falls back to advanced.runtimeOutputDir from settings when env is absent', () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.qwen/settings.json') {
        return JSON.stringify({ advanced: { runtimeOutputDir: '/custom/runtime' } }) as any;
      }
      throw new Error('ENOENT');
    });
    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/custom/runtime/projects') return ['project-b'] as any;
      if (dirPath === '/custom/runtime/projects/project-b/chats') return ['sid-2.jsonl'] as any;
      throw new Error('ENOENT');
    });
    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/custom/runtime/projects/project-b') return { isDirectory: () => true, mtimeMs: 10 } as any;
      if (filePath === '/custom/runtime/projects/project-b/chats') return { isDirectory: () => true, mtimeMs: 10 } as any;
      if (filePath === '/custom/runtime/projects/project-b/chats/sid-2.jsonl') return { isFile: () => true, mtimeMs: 30 } as any;
      throw new Error('ENOENT');
    });

    expect(findQwenTranscriptPath('sid-2', '/project')).toBe(
      path.join('/custom/runtime', 'projects', 'project-b', 'chats', 'sid-2.jsonl'),
    );
  });

  it('prefers project advanced.runtimeOutputDir over user settings', () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.qwen/settings.json') {
        return JSON.stringify({ advanced: { runtimeOutputDir: '/user/runtime' } }) as any;
      }
      if (filePath === '/project/.qwen/settings.json') {
        return JSON.stringify({ advanced: { runtimeOutputDir: '/project/runtime' } }) as any;
      }
      throw new Error('ENOENT');
    });
    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/project/runtime/projects') return ['project-c'] as any;
      if (dirPath === '/project/runtime/projects/project-c/chats') return ['sid-3.jsonl'] as any;
      throw new Error('ENOENT');
    });
    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/project/runtime/projects/project-c') return { isDirectory: () => true, mtimeMs: 10 } as any;
      if (filePath === '/project/runtime/projects/project-c/chats') return { isDirectory: () => true, mtimeMs: 10 } as any;
      if (filePath === '/project/runtime/projects/project-c/chats/sid-3.jsonl') return { isFile: () => true, mtimeMs: 15 } as any;
      throw new Error('ENOENT');
    });

    expect(findQwenTranscriptPath('sid-3', '/project')).toBe(
      path.join('/project/runtime', 'projects', 'project-c', 'chats', 'sid-3.jsonl'),
    );
  });

  it('picks newest readable transcript and tolerates stat failures while scanning projects', () => {
    vi.stubEnv('QWEN_RUNTIME_DIR', '/runtime/qwen');
    const statCalls = new Map<string, number>();

    try {
      mockReaddirSync.mockImplementation((inputPath) => {
        const dirPath = n(String(inputPath));
        if (dirPath === '/runtime/qwen/projects') return ['project-a', 'project-b', 'project-c', 'project-d'] as any;
        if (dirPath === '/runtime/qwen/projects/project-a/chats') return ['sid-new.jsonl'] as any;
        if (dirPath === '/runtime/qwen/projects/project-b/chats') return ['sid-new.jsonl'] as any;
        throw new Error('ENOENT');
      });
      mockStatSync.mockImplementation((inputPath) => {
        const filePath = n(String(inputPath));
        const count = (statCalls.get(filePath) ?? 0) + 1;
        statCalls.set(filePath, count);

        if (filePath === '/runtime/qwen/projects/project-a') return { isDirectory: () => true, mtimeMs: 1 } as any;
        if (filePath === '/runtime/qwen/projects/project-a/chats') return { isDirectory: () => true, mtimeMs: 1 } as any;
        if (filePath === '/runtime/qwen/projects/project-a/chats/sid-new.jsonl') return { isFile: () => true, mtimeMs: 200 } as any;

        if (filePath === '/runtime/qwen/projects/project-b') return { isDirectory: () => true, mtimeMs: 1 } as any;
        if (filePath === '/runtime/qwen/projects/project-b/chats') return { isDirectory: () => true, mtimeMs: 1 } as any;
        if (filePath === '/runtime/qwen/projects/project-b/chats/sid-new.jsonl') {
          if (count === 1) return { isFile: () => true, mtimeMs: 10 } as any;
          throw new Error('EACCES');
        }

        if (filePath === '/runtime/qwen/projects/project-c') return { isDirectory: () => true, mtimeMs: 1 } as any;
        if (filePath === '/runtime/qwen/projects/project-c/chats') throw new Error('EACCES');
        if (filePath === '/runtime/qwen/projects/project-d') return { isDirectory: () => false, mtimeMs: 1 } as any;

        throw new Error('ENOENT');
      });

      expect(findQwenTranscriptPath('sid-new', '/project')).toBe(
        path.join('/runtime/qwen', 'projects', 'project-a', 'chats', 'sid-new.jsonl'),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('returns null when runtime discovery throws unexpectedly', () => {
    expect(findQwenTranscriptPath('sid-err', undefined as unknown as string)).toBeNull();
  });

  it('returns null when no matching transcript exists', () => {
    expect(findQwenTranscriptPath('missing', '/project')).toBeNull();
  });
});
