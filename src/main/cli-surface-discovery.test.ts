import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { discoverCliSurface } from './cli-surface-discovery';

function makeProject(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
}

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('discoverCliSurface', () => {
  it('returns a high-confidence npm script candidate for a dedicated tui script', async () => {
    const root = makeProject('node-tui');
    roots.push(root);
    writeFiles(root, {
      'package.json': JSON.stringify({
        name: 'node-tui',
        scripts: { 'dev:tui': 'tsx src/tui.ts' },
      }),
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('high');
    expect(result.candidates[0]).toMatchObject({
      command: 'npm',
      args: ['run', 'dev:tui'],
      source: 'package.json:scripts.dev:tui',
    });
  });

  it('returns a medium-confidence result when multiple node scripts are plausible', async () => {
    const root = makeProject('node-ambiguous');
    roots.push(root);
    writeFiles(root, {
      'package.json': JSON.stringify({
        name: 'node-ambiguous',
        scripts: { cli: 'tsx src/cli.ts', dev: 'tsx src/dev.ts' },
      }),
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('medium');
    expect(result.candidates.map((candidate) => candidate.args?.join(' '))).toEqual([
      'run cli',
      'run dev',
    ]);
  });

  it('returns a high-confidence python candidate for a textual app entry file', async () => {
    const root = makeProject('python-textual');
    roots.push(root);
    writeFiles(root, {
      'app.py': 'from textual.app import App\nclass Demo(App):\n    pass\n',
      'pyproject.toml': '[project]\nname = "demo"\nversion = "0.1.0"\n',
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('high');
    expect(result.candidates[0]).toMatchObject({
      command: 'python',
      args: ['app.py'],
      source: 'python:textual-app',
    });
  });

  it('returns a high-confidence cargo candidate for a Rust CLI project', async () => {
    const root = makeProject('rust-cli');
    roots.push(root);
    writeFiles(root, {
      'Cargo.toml': '[package]\nname = "rust-cli"\nversion = "0.1.0"\nedition = "2024"\n',
      'src/main.rs': 'fn main() { println!("hi"); }\n',
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('high');
    expect(result.candidates[0]).toMatchObject({
      command: 'cargo',
      args: ['run'],
      source: 'cargo:main-bin',
    });
  });

  it('returns a high-confidence go candidate for a cmd entrypoint', async () => {
    const root = makeProject('go-cli');
    roots.push(root);
    writeFiles(root, {
      'go.mod': 'module example.com/cli\n\ngo 1.24.0\n',
      'cmd/demo/main.go': 'package main\nfunc main() {}\n',
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('high');
    expect(result.candidates[0]).toMatchObject({
      command: 'go',
      args: ['run', './cmd/demo'],
      source: 'go:cmd-entry',
    });
  });

  it('returns a medium-confidence result when multiple Go cmd entrypoints exist', async () => {
    const root = makeProject('go-multi');
    roots.push(root);
    writeFiles(root, {
      'go.mod': 'module example.com/cli\n\ngo 1.24.0\n',
      'cmd/ironsentinel/main.go': 'package main\nfunc main() {}\n',
      'cmd/releasectl/main.go': 'package main\nfunc main() {}\n',
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('medium');
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.args?.join(' '))).toEqual([
      'run ./cmd/ironsentinel',
      'run ./cmd/releasectl',
    ]);
    expect(result.candidates.every((candidate) => candidate.confidence === 'medium')).toBe(true);
  });

  it('returns a low-confidence result when no runtime can be inferred', async () => {
    const root = makeProject('unknown');
    roots.push(root);
    writeFiles(root, { 'README.md': '# Unknown\n' });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('low');
    expect(result.candidates).toEqual([]);
  });
});
