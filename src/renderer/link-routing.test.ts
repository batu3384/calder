import { describe, expect, it } from 'vitest';
import { resolveNavigableHttpUrl, shouldDispatchLinkOpen } from './link-routing.js';

describe('resolveNavigableHttpUrl', () => {
  it('normalizes bare localhost links', () => {
    expect(resolveNavigableHttpUrl('localhost:3000/dashboard')).toBe('http://localhost:3000/dashboard');
  });

  it('extracts the target from markdown links', () => {
    expect(resolveNavigableHttpUrl('[Open](http://localhost:3000/tickets)'))
      .toBe('http://localhost:3000/tickets');
  });

  it('removes wrapper punctuation around links', () => {
    expect(resolveNavigableHttpUrl('("http://localhost:3000/admin/dashboard"),'))
      .toBe('http://localhost:3000/admin/dashboard');
  });

  it('strips ansi escape noise from link payloads', () => {
    expect(resolveNavigableHttpUrl('\u001B[32mhttp://localhost:3000/admin/tickets\u001B[0m'))
      .toBe('http://localhost:3000/admin/tickets');
  });

  it('rejects non-http schemes', () => {
    expect(resolveNavigableHttpUrl('mailto:test@example.com')).toBeNull();
  });
});

describe('shouldDispatchLinkOpen', () => {
  it('drops same-origin duplicate urls in the dedupe window', () => {
    expect(shouldDispatchLinkOpen(
      'http://localhost:3000/dashboard',
      { url: 'http://localhost:3000/dashboard', at: 1000, source: 'web-link' },
      'web-link',
      1080,
    )).toBe(false);
  });

  it('drops less specific same-origin urls arriving right after a deep path', () => {
    expect(shouldDispatchLinkOpen(
      'http://localhost:3000/',
      { url: 'http://localhost:3000/admin/tickets', at: 1000, source: 'web-link' },
      'web-link',
      1090,
    )).toBe(false);
  });

  it('keeps more specific same-origin urls arriving right after root', () => {
    expect(shouldDispatchLinkOpen(
      'http://localhost:3000/admin/tickets',
      { url: 'http://localhost:3000/', at: 1000, source: 'web-link' },
      'web-link',
      1090,
    )).toBe(true);
  });

  it('keeps the more specific target when mixed link sources fire', () => {
    expect(shouldDispatchLinkOpen(
      'http://localhost:3000/dashboard',
      { url: 'http://localhost:3000/', at: 1000, source: 'web-link' },
      'osc-link',
      1030,
    )).toBe(true);
  });

  it('prefers osc-link when same-origin urls have equal specificity', () => {
    expect(shouldDispatchLinkOpen(
      'http://localhost:3000/bravo',
      { url: 'http://localhost:3000/alpha', at: 1000, source: 'web-link' },
      'osc-link',
      1030,
    )).toBe(true);
  });

  it('keeps the first winner for same-source equal-specificity urls', () => {
    expect(shouldDispatchLinkOpen(
      'http://localhost:3000/bravo',
      { url: 'http://localhost:3000/alpha', at: 1000, source: 'web-link' },
      'web-link',
      1030,
    )).toBe(false);
  });

  it('blocks mixed-source events that do not increase url specificity', () => {
    expect(shouldDispatchLinkOpen(
      'http://localhost:3000/dashboard',
      { url: 'http://localhost:3000/dashboard', at: 1000, source: 'osc-link' },
      'web-link',
      1030,
    )).toBe(false);
  });
});
