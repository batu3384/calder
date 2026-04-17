import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./context-inspector.ts', import.meta.url), 'utf-8');

describe('context inspector provider label contract', () => {
  it('derives the overview provider label from shared provider metadata', () => {
    expect(source).toContain('getProviderDisplayName(getInspectorProviderId())');
  });
});
