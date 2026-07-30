import type { WebSurfaceState } from './project-core.js';

export interface ProjectSurfaceRecord {
  kind: 'web';
  active: boolean;
  targetSessionId?: string;
  web?: WebSurfaceState;
}
