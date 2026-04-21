import { blessedAdapter } from './blessed.js';
import { inkAdapter } from './ink.js';
import { textualAdapter } from './textual.js';
import type { CliAdapterDetectionInput, CliSurfaceAdapter } from './adapter-contract.js';

const adapters: CliSurfaceAdapter[] = [textualAdapter, inkAdapter, blessedAdapter];

export function detectCliAdapter(input: CliAdapterDetectionInput): CliSurfaceAdapter | undefined {
  return adapters.find((adapter) => adapter.detect(input));
}
