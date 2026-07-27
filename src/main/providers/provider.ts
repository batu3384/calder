import type { CliProviderMeta } from '../../shared/types/provider';

export interface CliProvider {
  readonly meta: CliProviderMeta;
  resolveBinaryPath(): string;
  getInstallCommand(): string;
  clearBinaryCache(): void;
  checkBinaryInstalled(): { ok: boolean; message: string };
  validatePrerequisites(): { ok: boolean; message: string };
  buildEnv(sessionId: string, baseEnv: Record<string, string>): Record<string, string>;
  buildArgs(opts: {
    cliSessionId: string | null;
    isResume: boolean;
    extraArgs: string;
    initialPrompt?: string;
  }): string[];
  cleanup(): void;
  getShiftEnterSequence(): string | null;
  parseCostFromOutput?(rawText: string): { totalCostUsd: number } | null;
  getTranscriptPath?(cliSessionId: string, projectPath: string): string | null;
}
