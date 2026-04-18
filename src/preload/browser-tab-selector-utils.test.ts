import { describe, expect, it } from 'vitest';
import { escapeCssAttributeValue, escapeCssIdentifier } from './browser-tab-selector-utils';

describe('browser tab selector utils', () => {
  it('escapes IDs with reserved selector characters', () => {
    expect(escapeCssIdentifier('cta:primary"hero')).toBe('cta\\:primary\\"hero');
  });

  it('escapes leading digit IDs for valid selector usage', () => {
    expect(escapeCssIdentifier('1panel')).toBe('\\31 panel');
  });

  it('escapes attribute values with quotes and newlines', () => {
    expect(escapeCssAttributeValue('foo"bar\\baz\nnext')).toBe('foo\\"bar\\\\baz\\a next');
  });
});
