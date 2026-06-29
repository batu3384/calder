import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatOtpForDisplay,
  scheduleMobileAnswerPoll,
  setShareDialogMobileFallbackLinks,
} from './share-dialog-mobile-pairing.js';

function createMockClassList() {
  const classes = new Set<string>();
  return {
    toggle(name: string, force?: boolean): void {
      if (typeof force === 'boolean') {
        if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
        return;
      }
      if (classes.has(name)) {
        classes.delete(name);
      } else {
        classes.add(name);
      }
    },
    contains(name: string): boolean {
      return classes.has(name);
    },
  };
}

describe('share dialog mobile pairing helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats otp codes in a grouped style', () => {
    expect(formatOtpForDisplay('123456')).toBe('123 456');
    expect(formatOtpForDisplay('12-34')).toBe('123 4');
    expect(formatOtpForDisplay('ab12')).toBe('12');
  });

  it('picks a non-loopback fallback link and toggles controls', () => {
    const mobileFallbackInput = { value: '' } as HTMLInputElement;
    const mobileFallbackRow = { classList: createMockClassList() } as HTMLDivElement;
    const useMobileFallbackBtn = { disabled: true } as HTMLButtonElement;
    const copyMobileFallbackBtn = { disabled: true } as HTMLButtonElement;

    const fallback = setShareDialogMobileFallbackLinks({
      links: [
        'http://localhost:1234/share',
        'http://127.0.0.1:1234/share',
        'https://192.168.1.22:8787/share',
      ],
      primaryLink: 'http://localhost:1234/share',
      mobileFallbackInput,
      mobileFallbackRow,
      useMobileFallbackBtn,
      copyMobileFallbackBtn,
    });

    expect(fallback).toBe('https://192.168.1.22:8787/share');
    expect(mobileFallbackInput.value).toBe('https://192.168.1.22:8787/share');
    expect(mobileFallbackRow.classList.contains('hidden')).toBe(false);
    expect(useMobileFallbackBtn.disabled).toBe(false);
    expect(copyMobileFallbackBtn.disabled).toBe(false);
  });

  it('schedules polling and returns the created timer handle', async () => {
    vi.useFakeTimers();
    const poller = vi.fn(async () => {});
    let capturedTimer: ReturnType<typeof setTimeout> | null = null;

    scheduleMobileAnswerPoll((timer) => {
      capturedTimer = timer;
    }, poller);

    expect(capturedTimer).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1300);
    expect(poller).toHaveBeenCalledTimes(1);
  });
});
