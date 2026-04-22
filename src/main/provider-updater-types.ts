export interface ProviderUpdaterRunner {
  run(
    command: string,
    args: string[],
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{ code: number; stdout: string; stderr: string }>;
}

export interface ProviderUpdateSpec {
  npmPackage?: string;
  brewFormula?: string;
  brewCask?: string;
  selfUpdateArgs?: string[];
}
