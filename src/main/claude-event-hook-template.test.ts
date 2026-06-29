import { describe, expect, it } from 'vitest';

import { buildClaudeEventHookPython } from './claude-event-hook-template.js';

describe('buildClaudeEventHookPython', () => {
  it('injects status directory, event type, and hook event placeholders', () => {
    const rendered = buildClaudeEventHookPython(
      'PostToolUse',
      'tool_use',
      '/tmp/calder-status',
    );

    expect(rendered).toContain('/tmp/calder-status');
    expect(rendered).toContain('tool_use');
    expect(rendered).toContain('PostToolUse');
    expect(rendered).not.toContain('__CALDER_STATUS_DIR__');
    expect(rendered).not.toContain('__CALDER_EVENT_TYPE__');
    expect(rendered).not.toContain('__CALDER_HOOK_EVENT__');
  });

  it('guards execution to Calder-managed sessions only', () => {
    const rendered = buildClaudeEventHookPython(
      'PreToolUse',
      'pre_tool_use',
      '/tmp/calder-status',
    );

    expect(rendered).toContain('CALDER_RUNTIME');
    expect(rendered).toContain('sid=os.environ.get("CLAUDE_IDE_SESSION_ID","")');
    expect(rendered).not.toContain('raw_sid=d.get("session_id","")');
  });
});
