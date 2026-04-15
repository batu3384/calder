import { describe, expect, it } from 'vitest';
import {
  classifyAutoApprovalOperation,
  decideAutoApprovalAction,
} from './auto-approval-classifier.js';

describe('classifyAutoApprovalOperation', () => {
  it.each([
    [{ tool: 'Write' }, 'edit'],
    [{ tool: 'Edit' }, 'edit'],
    [{ tool: 'MultiEdit' }, 'edit'],
  ] as const)('classifies edit tools as edit: %j', (input, expected) => {
    expect(classifyAutoApprovalOperation(input)).toBe(expected);
  });

  it.each([
    [{ tool: 'Bash', command: 'rg --files src' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'ls -la' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'pwd' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'cat README.md' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'sed -n 1,20p src/main.ts' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'head -n 5 README.md' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'tail -n 5 README.md' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'wc -l src/main.ts' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'find . -maxdepth 1 -type f' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'git status --short' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'git log --oneline -n 5' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'git show HEAD~1' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'git diff -- src/main.ts' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'rg "needle" src' }, 'safe_tool'],
  ] as const)('classifies read-only bash commands as safe_tool: %j', (input, expected) => {
    expect(classifyAutoApprovalOperation(input)).toBe(expected);
  });

  it.each([
    [{ tool: 'Bash', command: 'rm -rf dist' }, 'destructive'],
    [{ tool: 'Bash', command: 'git reset --hard HEAD~1' }, 'destructive'],
    [{ tool: 'Bash', command: 'git checkout -- src/main.ts' }, 'destructive'],
    [{ tool: 'bash', command: 'bash', args: ['-lc', 'rm -rf dist'] }, 'destructive'],
    [{ tool: 'sh', command: 'sh', args: ['-lc', 'git reset --hard HEAD~1'] }, 'destructive'],
  ] as const)('classifies destructive bash commands as destructive: %j', (input, expected) => {
    expect(classifyAutoApprovalOperation(input)).toBe(expected);
  });

  it.each([
    [{ tool: 'Bash', command: 'npm test' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'git add src/main.ts' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'python script.py' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'cat README.md | xargs rm' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'rg foo $(rm -rf dist)' }, 'destructive'],
    [{ tool: 'Bash', command: 'cat README.md `rm -rf dist`' }, 'destructive'],
    [{ tool: 'Bash', command: 'find . -maxdepth 1 -type f -fprint out.txt' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'find . -maxdepth 1 -type f -fprintf out.txt %p' }, 'risky_tool'],
    [{ tool: 'Bash', command: "find . '-exec' rm -rf {} \\;" }, 'destructive'],
    [{ tool: 'Bash', command: 'find . "-delete"' }, 'risky_tool'],
  ] as const)('classifies other bash commands as risky_tool: %j', (input, expected) => {
    expect(classifyAutoApprovalOperation(input)).toBe(expected);
  });

  it.each([
    [{ tool: 'Read', command: 'ls -la' }, 'risky_tool'],
    [{ tool: 'Search', command: 'cat README.md' }, 'risky_tool'],
  ] as const)('does not classify non-Bash tool payloads as safe_tool: %j', (input, expected) => {
    expect(classifyAutoApprovalOperation(input)).toBe(expected);
  });

  it.each([
    [undefined],
    [null],
    [{}],
    [{ tool: 'Bash' }],
  ] as const)('returns unknown for missing data: %j', (input) => {
    expect(classifyAutoApprovalOperation(input)).toBe('unknown');
  });
});

describe('decideAutoApprovalAction', () => {
  it('hard-blocks destructive operations in every mode', () => {
    expect(decideAutoApprovalAction('off', 'destructive')).toEqual({
      decision: 'block',
      reason: 'Destructive operations are blocked in every auto-approval mode.',
    });
    expect(decideAutoApprovalAction('edit_only', 'destructive')).toEqual({
      decision: 'block',
      reason: 'Destructive operations are blocked in every auto-approval mode.',
    });
    expect(decideAutoApprovalAction('edit_plus_safe_tools', 'destructive')).toEqual({
      decision: 'block',
      reason: 'Destructive operations are blocked in every auto-approval mode.',
    });
  });

  it('asks for safe tools in edit_only mode', () => {
    expect(decideAutoApprovalAction('edit_only', 'safe_tool')).toEqual({
      decision: 'ask',
      reason: 'Safe tools still require approval in edit_only mode.',
    });
  });

  it('allows edit and safe_tool in edit_plus_safe_tools mode', () => {
    expect(decideAutoApprovalAction('edit_plus_safe_tools', 'edit')).toEqual({
      decision: 'allow',
      reason: 'Edit operations are allowed in edit_plus_safe_tools mode.',
    });
    expect(decideAutoApprovalAction('edit_plus_safe_tools', 'safe_tool')).toEqual({
      decision: 'allow',
      reason: 'Safe tools are allowed in edit_plus_safe_tools mode.',
    });
  });

  it('asks for risky and unknown operations', () => {
    expect(decideAutoApprovalAction('edit_plus_safe_tools', 'risky_tool')).toEqual({
      decision: 'ask',
      reason: 'risky_tool operations require approval.',
    });
    expect(decideAutoApprovalAction('edit_plus_safe_tools', 'unknown')).toEqual({
      decision: 'ask',
      reason: 'unknown operations require approval.',
    });
  });

  it('asks for every operation when mode is off', () => {
    expect(decideAutoApprovalAction('off', 'edit')).toEqual({
      decision: 'ask',
      reason: 'Auto-approval is off.',
    });
  });
});
