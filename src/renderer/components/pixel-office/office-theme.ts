export interface OfficeTheme {
  stage: string;
  floor: string;
  floorAccent: string;
  wall: string;
  wallAccent: string;
  desk: string;
  deskAccent: string;
  active: string;
  waiting: string;
  danger: string;
  info: string;
  text: string;
  mutedText: string;
}

export const DEFAULT_OFFICE_THEME: OfficeTheme = {
  stage: '#010102',
  floor: '#0f1011',
  floorAccent: '#23252a',
  wall: '#141516',
  wallAccent: '#34343a',
  desk: '#23252a',
  deskAccent: '#52767d',
  active: '#27a644',
  waiting: '#d5a94f',
  danger: '#ef8a74',
  info: '#8fb8c1',
  text: '#f7f8f8',
  mutedText: '#8a8f98',
};

export function officeThemeFromCss(getProperty: (name: string) => string): OfficeTheme {
  const read = (name: string, fallback: string): string => getProperty(name).trim() || fallback;
  const readShared = (name: string, sharedName: string, fallback: string): string =>
    read(name, read(sharedName, fallback));

  return {
    stage: readShared('--pixel-office-stage', '--surface-live', DEFAULT_OFFICE_THEME.stage),
    floor: readShared('--pixel-office-floor', '--surface-panel', DEFAULT_OFFICE_THEME.floor),
    floorAccent: readShared(
      '--pixel-office-floor-accent',
      '--border-subtle',
      DEFAULT_OFFICE_THEME.floorAccent,
    ),
    wall: readShared('--pixel-office-wall', '--surface-raised', DEFAULT_OFFICE_THEME.wall),
    wallAccent: readShared(
      '--pixel-office-wall-accent',
      '--border',
      DEFAULT_OFFICE_THEME.wallAccent,
    ),
    desk: readShared('--pixel-office-desk', '--surface-contrast', DEFAULT_OFFICE_THEME.desk),
    deskAccent: readShared(
      '--pixel-office-desk-accent',
      '--accent-dim',
      DEFAULT_OFFICE_THEME.deskAccent,
    ),
    active: read('--accent-positive', DEFAULT_OFFICE_THEME.active),
    waiting: read('--accent-warning', DEFAULT_OFFICE_THEME.waiting),
    danger: read('--accent-danger', DEFAULT_OFFICE_THEME.danger),
    info: read('--accent-info', DEFAULT_OFFICE_THEME.info),
    text: read('--text-primary', DEFAULT_OFFICE_THEME.text),
    mutedText: read('--text-muted', DEFAULT_OFFICE_THEME.mutedText),
  };
}

export function readOfficeTheme(): OfficeTheme {
  if (typeof document === 'undefined') return DEFAULT_OFFICE_THEME;
  const styles = window.getComputedStyle(document.documentElement);
  return officeThemeFromCss((name) => styles.getPropertyValue(name));
}
