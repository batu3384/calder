import type {
  MobileDependencyCheck,
  MobileDependencyId,
} from '../shared/types/mobile';

export interface MobileDoctorCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface MobileDoctorCommandRunner {
  run(
    command: string,
    args: string[],
    options?: { timeoutMs?: number },
  ): Promise<MobileDoctorCommandResult>;
}

export interface MobileDoctorCheckContext {
  runner: MobileDoctorCommandRunner;
  hostPlatform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}

export interface CheckBinaryInput {
  runner: MobileDoctorCommandRunner;
  id: MobileDependencyId;
  label: string;
  scope: 'android' | 'ios' | 'shared';
  requiredFor: Array<'ios' | 'android'>;
  description: string;
  binary: string;
  versionArgs?: string[];
  docsUrl?: string;
  installHint?: string;
  installCommand?: string;
  autoFixAvailable?: boolean;
  fallbackPaths?: string[];
}

export function buildCheck(input: Omit<MobileDependencyCheck, 'required'>): MobileDependencyCheck {
  return {
    ...input,
    required: input.requiredFor.length > 0,
  };
}
