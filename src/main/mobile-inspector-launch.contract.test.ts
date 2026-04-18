import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./mobile-inspector.ts', import.meta.url), 'utf8');

describe('mobile inspector launch embedding contract', () => {
  it('does not force-open external iOS Simulator.app windows', () => {
    expect(source).not.toContain("open', ['-a', 'Simulator']");
  });

  it('launches Android emulator in headless embedded mode defaults', () => {
    expect(source).toContain("'-no-window'");
    expect(source).toContain("'-no-audio'");
    expect(source).toContain("'-no-boot-anim'");
  });

  it('resolves Android command binaries via SDK fallback paths', () => {
    expect(source).toContain("getAndroidBinaryCandidates('adb'");
    expect(source).toContain("getAndroidBinaryCandidates('emulator'");
    expect(source).toContain('resolveBinaryCommand(');
  });

  it('waits for iOS bootstatus before reporting simulator boot success', () => {
    expect(source).toContain("await runCommand('xcrun', ['simctl', 'bootstatus'");
  });

  it('captures iOS screenshots via temporary file path (not stdout dash)', () => {
    expect(source).toContain('calder-ios-inspect-');
    expect(source).toContain("['simctl', 'io', targetDeviceId, 'screenshot', tempScreenshotPath]");
    expect(source).toContain('fs.readFileSync(tempScreenshotPath)');
    expect(source).not.toContain("['simctl', 'io', 'booted', 'screenshot', '-']");
  });

  it('routes tap interactions through platform-native bridges', () => {
    expect(source).toContain("['-s', ready.deviceId, 'shell', 'input', 'tap'");
    expect(source).toContain("fetch('http://127.0.0.1:4723/session'");
    expect(source).toContain('/actions');
  });
});
