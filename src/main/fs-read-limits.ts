import { readFile, stat } from 'node:fs/promises';

/** Maximum project document read size (10 MiB) — matches fs:readFile policy. */
export const PROJECT_DOCUMENT_READ_MAX_BYTES = 10 * 1024 * 1024;

export async function readUtf8FileWithSizeLimit(
  filePath: string,
  maxBytes = PROJECT_DOCUMENT_READ_MAX_BYTES,
): Promise<string> {
  const fileStat = await stat(filePath);
  if (fileStat.size > maxBytes) {
    throw new Error(`File exceeds maximum read size (${maxBytes} bytes)`);
  }
  return readFile(filePath, 'utf8');
}
