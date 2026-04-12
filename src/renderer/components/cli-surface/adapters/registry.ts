import { blessedAdapter } from './blessed.js';
import { inkAdapter } from './ink.js';
import { textualAdapter } from './textual.js';

export interface CliAdapterDetectionInput {
  command?: string;
  args?: string[];
  title?: string;
  adapterHint?: string;
}

export interface CliSurfaceAdapter {
  id: 'textual' | 'ink' | 'blessed';
  detect(input: CliAdapterDetectionInput): boolean;
  enrich(meta: Record<string, unknown>): Record<string, unknown>;
}

const adapters: CliSurfaceAdapter[] = [textualAdapter, inkAdapter, blessedAdapter];

export function detectCliAdapter(input: CliAdapterDetectionInput): CliSurfaceAdapter | undefined {
  return adapters.find((adapter) => adapter.detect(input));
}
