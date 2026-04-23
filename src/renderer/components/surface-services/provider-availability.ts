import * as providerAvailabilityModule from '../../provider-availability.js';

type ProviderAvailabilityModule = typeof providerAvailabilityModule;
const providerAvailability = providerAvailabilityModule as ProviderAvailabilityModule;

export type { ProviderAvailabilitySnapshot } from '../../provider-availability.js';

export const getProviderAvailabilitySnapshot: ProviderAvailabilityModule['getProviderAvailabilitySnapshot'] = (...args) =>
  providerAvailability.getProviderAvailabilitySnapshot(...args);

export const getProviderCapabilities: ProviderAvailabilityModule['getProviderCapabilities'] = (...args) =>
  providerAvailability.getProviderCapabilities(...args);

export const getProviderDisplayName: ProviderAvailabilityModule['getProviderDisplayName'] = (...args) =>
  providerAvailability.getProviderDisplayName(...args);

export const hasMultipleAvailableProviders: ProviderAvailabilityModule['hasMultipleAvailableProviders'] = (...args) =>
  providerAvailability.hasMultipleAvailableProviders(...args);

export const loadProviderAvailability: ProviderAvailabilityModule['loadProviderAvailability'] = (...args) =>
  providerAvailability.loadProviderAvailability(...args);

export const resolvePreferredProviderForLaunch: ProviderAvailabilityModule['resolvePreferredProviderForLaunch'] = (...args) =>
  providerAvailability.resolvePreferredProviderForLaunch(...args);

export const resolveProviderForCheck: ProviderAvailabilityModule['resolveProviderForCheck'] = (...args) =>
  providerAvailability.resolveProviderForCheck(...args);

export const shouldRenderInlineProviderSelector: ProviderAvailabilityModule['shouldRenderInlineProviderSelector'] = (...args) =>
  providerAvailability.shouldRenderInlineProviderSelector(...args);
