export type FsReadFileFailureReason = 'blocked' | 'too-large' | 'not-found' | 'read-error';

export type FsReadFileResult =
  | { ok: true; content: string }
  | { ok: false; reason: FsReadFileFailureReason; message?: string };
