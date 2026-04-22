import {
  parseSimctlDevices,
  runCommand,
  sleep,
  waitForIosDeviceToSettle as waitForIosDeviceToSettleHelper,
} from './mobile-inspector-helpers';
import type { SimctlDeviceRecord } from './mobile-inspector-helpers';

async function getIosDeviceByUdid(udid: string): Promise<SimctlDeviceRecord | null> {
  const listResult = await runCommand('xcrun', ['simctl', 'list', 'devices', '--json']);
  if (listResult.code !== 0) return null;
  return parseSimctlDevices(listResult.stdout).find((entry) => entry.udid === udid) ?? null;
}

export async function waitForIosDeviceToSettle(udid: string): Promise<SimctlDeviceRecord | null> {
  return waitForIosDeviceToSettleHelper(udid, getIosDeviceByUdid);
}

export async function runIosBootRecoverySequence(): Promise<void> {
  await runCommand('xcrun', ['simctl', 'shutdown', 'all'], 20_000);
  await runCommand('killall', ['-9', 'Simulator'], 8_000);
  await runCommand('killall', ['-9', 'com.apple.CoreSimulator.CoreSimulatorService'], 8_000);
  await sleep(1_500);
}
