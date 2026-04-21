import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadStatuslineTemplateWithPlatform(options: { isWin: boolean; pythonBin: string }) {
  vi.resetModules();
  vi.doMock('./platform', () => ({
    isWin: options.isWin,
    pythonBin: options.pythonBin,
  }));
  return import('./statusline-template');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildStatusLineWrapper platform branches', () => {
  it('renders Windows wrapper when running on win32', async () => {
    const { buildStatusLineWrapper } = await loadStatuslineTemplateWithPlatform({
      isWin: true,
      pythonBin: 'python',
    });

    const wrapper = buildStatusLineWrapper('C:\\tmp\\statusline.py', 'C:\\tmp\\statusline.log');

    expect(wrapper).toBe(
      '@echo off\r\npython "C:\\tmp\\statusline.py" render 2>>"C:\\tmp\\statusline.log"\r\n',
    );
  });

  it('renders POSIX wrapper when running on non-Windows', async () => {
    const { buildStatusLineWrapper } = await loadStatuslineTemplateWithPlatform({
      isWin: false,
      pythonBin: '/usr/bin/python3',
    });

    const wrapper = buildStatusLineWrapper('/tmp/statusline.py', '/tmp/statusline.log');

    expect(wrapper).toBe('#!/bin/sh\n/usr/bin/python3 "/tmp/statusline.py" render 2>>"/tmp/statusline.log"\n');
  });
});
