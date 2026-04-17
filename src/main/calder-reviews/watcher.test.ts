import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const mockWatch = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockDiscoverProjectReviews = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: mockMkdirSync,
    watch: mockWatch,
  },
}));

vi.mock('./discovery.js', () => ({
  discoverProjectReviews: mockDiscoverProjectReviews,
}));

import {
  startProjectReviewWatcher,
  stopProjectReviewWatcher,
} from './watcher.js';

const watchCallbacks = new Map<string, () => void>();
const closeFns: Array<ReturnType<typeof vi.fn>> = [];
const n = (value: string) => value.replace(/\\/g, '/');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  watchCallbacks.clear();
  closeFns.length = 0;
  mockMkdirSync.mockReset();

  mockWatch.mockImplementation(((dirPath: string, listener: () => void) => {
    const close = vi.fn();
    closeFns.push(close);
    watchCallbacks.set(n(dirPath), listener);
    return {
      close,
      on: vi.fn().mockReturnThis(),
    } as any;
  }) as any);
});

afterEach(() => {
  stopProjectReviewWatcher();
  vi.useRealTimers();
});

describe('project review watcher', () => {
  it('watches the review directory and emits refreshed data on change', async () => {
    const nextState = {
      reviews: [
        {
          id: 'review:/repo/.calder/reviews/pr-1.md',
          path: '/repo/.calder/reviews/pr-1.md',
          displayName: 'pr-1.md',
          summary: 'Updated review',
          lastUpdated: '2026-04-14T10:00:00.000Z',
        },
      ],
      lastUpdated: '2026-04-14T10:00:00.000Z',
    };
    mockDiscoverProjectReviews.mockResolvedValue(nextState);
    const onChange = vi.fn();
    const reviewsDir = path.join('/repo', '.calder', 'reviews');

    startProjectReviewWatcher('/repo', onChange);
    expect(mockMkdirSync).toHaveBeenCalledWith(reviewsDir, { recursive: true });
    expect(watchCallbacks.has('/repo/.calder/reviews')).toBe(true);

    watchCallbacks.get('/repo/.calder/reviews')?.();
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(mockDiscoverProjectReviews).toHaveBeenCalledWith('/repo');
    expect(onChange).toHaveBeenCalledWith(nextState);
  });

  it('cleans up timers and watchers on stop', async () => {
    mockDiscoverProjectReviews.mockResolvedValue({ reviews: [], lastUpdated: undefined });
    const onChange = vi.fn();

    startProjectReviewWatcher('/repo', onChange);
    watchCallbacks.get('/repo/.calder/reviews')?.();
    stopProjectReviewWatcher();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
    expect(closeFns.every((close) => close.mock.calls.length === 1)).toBe(true);
  });
});
