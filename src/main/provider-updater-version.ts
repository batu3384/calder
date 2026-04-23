export function brewEntryMatchesToken(name: string | string[] | undefined, token: string): boolean {
  if (!name) return false;
  if (Array.isArray(name)) {
    return name.includes(token);
  }
  return name === token;
}

export function shouldUpdate(currentVersion?: string, latestVersion?: string): boolean {
  if (!latestVersion) return true;
  if (!currentVersion) return true;
  const compare = compareVersions(currentVersion, latestVersion);
  if (compare === null) return currentVersion !== latestVersion;
  return compare < 0;
}

export function hasDifferentVersion(beforeVersion?: string, afterVersion?: string): boolean {
  if (!beforeVersion || !afterVersion) return false;
  return beforeVersion !== afterVersion;
}

export function parseVersion(value: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?/);
  return match?.[0];
}

export function compareVersions(left: string, right: string): number | null {
  const leftVersion = parseComparableVersion(left);
  const rightVersion = parseComparableVersion(right);
  if (!leftVersion || !rightVersion) return null;

  const leftParts = leftVersion.parts;
  const rightParts = rightVersion.parts;
  const length = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < length; i += 1) {
    const l = leftParts[i] ?? 0;
    const r = rightParts[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }

  const leftPrerelease = leftVersion.prerelease;
  const rightPrerelease = rightVersion.prerelease;
  if (!leftPrerelease && !rightPrerelease) return 0;
  if (!leftPrerelease) return 1;
  if (!rightPrerelease) return -1;

  return comparePrerelease(leftPrerelease, rightPrerelease);
}

function comparePrerelease(left: string[], right: string[]): number {
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;

    const lNumeric = /^\d+$/.test(l);
    const rNumeric = /^\d+$/.test(r);
    if (lNumeric && rNumeric) {
      const lNum = Number.parseInt(l, 10);
      const rNum = Number.parseInt(r, 10);
      if (lNum > rNum) return 1;
      if (lNum < rNum) return -1;
      continue;
    }
    if (lNumeric && !rNumeric) return -1;
    if (!lNumeric && rNumeric) return 1;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function parseComparableVersion(value: string): { parts: number[]; prerelease?: string[] } | null {
  const match = value.match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  const parts = match[1].split('.').map((part) => Number.parseInt(part, 10));
  const prerelease = match[2]?.split('.').filter(Boolean);
  return { parts, prerelease: prerelease && prerelease.length > 0 ? prerelease : undefined };
}
