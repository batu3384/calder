import type {
  ProviderUpdaterOptions,
  ProviderUpdaterRunner,
  ResolvedProviderUpdaterOptions,
} from '../provider-updater-types';
import { defaultRunner } from './default-runner';

export function resolveUpdaterOptions(
  options: ProviderUpdaterOptions | undefined,
  runnerOverride?: ProviderUpdaterRunner,
): ResolvedProviderUpdaterOptions {
  return {
    runner: options?.runner ?? runnerOverride ?? defaultRunner,
    now: options?.now ?? Date.now,
    onProgress: options?.onProgress,
    signal: options?.signal,
  };
}
