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
      { url: 'http://localhost:3000/dashboard', at: 1000 },
      1080,
    )).toBe(false);
  });

  it('drops less specific same-origin urls arriving right after a deep path', () => {
    expect(shouldDispatchLinkOpen(
      'http://localhost:3000/',
      { url: 'http://localhost:3000/admin/tickets', at: 1000 },
      1090,
    )).toBe(false);
  });

  it('keeps more specific same-origin urls arriving right after root', () => {
    expect(shouldDispatchLinkOpen(
      'http://localhost:3000/admin/tickets',
      { url: 'http://localhost:3000/', at: 1000 },
      1090,
    )).toBe(true);
  });
});
