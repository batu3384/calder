export interface CliAdapterDetectionInput {
  command?: string;
  args?: string[];
  title?: string;
  adapterHint?: string;
}

export interface CliSurfaceAdapter {
  id: 'textual' | 'ink' | 'blessed';
  displayName: string;
  capabilityBadges: string[];
  detect(input: CliAdapterDetectionInput): boolean;
  enrich(meta: Record<string, unknown>): Record<string, unknown>;
}
