import { describe, it, expect } from 'vitest';
import {
  canonicalizeNavigationUrl,
  describeBrowserPageState,
  isLocalBrowserUrl,
  isStaleNavigationRevert,
  normalizeUrl,
  resolveBrowserPageState,
  STALE_NAVIGATION_REVERT_WINDOW_MS,
} from './navigation.js';

describe('normalizeUrl', () => {
  it('prepends http:// to bare hostnames', () => {
    expect(normalizeUrl('example.com')).toBe('http://example.com');
  });

  it('preserves http URLs', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('preserves https URLs', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('preserves file:// URLs', () => {
    expect(normalizeUrl('file:///Users/foo/index.html')).toBe('file:///Users/foo/index.html');
  });

  it('preserves about: URLs', () => {
    expect(normalizeUrl('about:blank')).toBe('about:blank');
  });

  it('trims whitespace', () => {
    expect(normalizeUrl('  example.com  ')).toBe('http://example.com');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeUrl('   ')).toBe('');
  });

  it('wraps host:port with http://', () => {
    expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000');
  });

  it('wraps ip:port with http://', () => {
    expect(normalizeUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
  });

  it('preserves view-source: URLs', () => {
    expect(normalizeUrl('view-source:https://example.com')).toBe('view-source:https://example.com');
  });
});

describe('browser navigation state helpers', () => {
  it('canonicalizes http urls before stale navigation comparison', () => {
    expect(canonicalizeNavigationUrl(' https://example.com/path/// ')).toBe('https://example.com/path');
    expect(canonicalizeNavigationUrl('not a url')).toBe('not a url');
  });

  it('classifies local, remote, loading, offline, and ready page states', () => {
    expect(isLocalBrowserUrl('http://localhost:3000')).toBe(true);
    expect(isLocalBrowserUrl('https://example.com')).toBe(false);
    expect(resolveBrowserPageState('http://localhost:3000', false, false)).toBe('local');
    expect(resolveBrowserPageState('https://example.com', false, false)).toBe('remote');
    expect(resolveBrowserPageState('not a url', false, false)).toBe('ready');
    expect(resolveBrowserPageState('https://example.com', true, false)).toBe('loading');
    expect(resolveBrowserPageState('https://example.com', false, true)).toBe('offline');
    expect(describeBrowserPageState('offline')).toBe('Offline');
  });

  it('detects stale navigation events that revert to the previous committed url', () => {
    const navigation = {
      pendingNavigationUrl: 'http://localhost:3001',
      pendingNavigationPreviousUrl: 'http://localhost:3000/',
      pendingNavigationAt: 1_000,
    };

    expect(isStaleNavigationRevert(navigation, 'http://localhost:3000', 1_100)).toBe(true);
    expect(navigation.pendingNavigationUrl).toBe('http://localhost:3001');
  });

  it('clears expired pending navigation markers', () => {
    const navigation = {
      pendingNavigationUrl: 'http://localhost:3001',
      pendingNavigationPreviousUrl: 'http://localhost:3000',
      pendingNavigationAt: 1_000,
    };

    expect(isStaleNavigationRevert(
      navigation,
      'http://localhost:3000',
      1_000 + STALE_NAVIGATION_REVERT_WINDOW_MS + 1,
    )).toBe(false);
    expect(navigation).toEqual({});
  });
});
