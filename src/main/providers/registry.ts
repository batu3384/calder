import type { ProviderId, CliProviderMeta } from '../../shared/types/provider';
import type { CliProvider } from './provider';
import { ClaudeProvider } from './claude-provider';
import { CodexProvider } from './codex-provider';
import { CopilotProvider } from './copilot-provider';
import { GeminiProvider } from './gemini-provider';
import { QwenProvider } from './qwen-provider';

const providers = new Map<ProviderId, CliProvider>();

export function initProviders(): void {
  registerProvider(new ClaudeProvider());
  registerProvider(new CodexProvider());
  registerProvider(new CopilotProvider());
  registerProvider(new GeminiProvider());
  registerProvider(new QwenProvider());
}

export function registerProvider(provider: CliProvider): void {
  providers.set(provider.meta.id, provider);
}

export function getProvider(id: ProviderId): CliProvider {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Unknown CLI provider: ${id}`);
  }
  return provider;
}

export function getAllProviders(): CliProvider[] {
  return Array.from(providers.values());
}

export function getProviderMeta(id: ProviderId): CliProviderMeta {
  return getProvider(id).meta;
}

export function getAllProviderMetas(): CliProviderMeta[] {
  return getAllProviders().map(p => p.meta);
}

export function getAvailableProviderIds(): ProviderId[] {
  return getAllProviders()
    .filter((provider) => {
      try {
        return provider.validatePrerequisites().ok;
      } catch {
        return false;
      }
    })
    .map(p => p.meta.id);
}
