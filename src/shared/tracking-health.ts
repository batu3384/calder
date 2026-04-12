import type { CliProviderMeta, SettingsValidationResult } from './types';

export function needsManagedStatusLine(meta: CliProviderMeta): boolean {
  return meta.capabilities.costTracking || meta.capabilities.contextWindow;
}

export function isTrackingHealthy(meta: CliProviderMeta, validation: SettingsValidationResult): boolean {
  const statusLineOk = !needsManagedStatusLine(meta) || validation.statusLine === 'calder';
  const hooksOk = !meta.capabilities.hookStatus || validation.hooks === 'complete';
  return statusLineOk && hooksOk;
}

