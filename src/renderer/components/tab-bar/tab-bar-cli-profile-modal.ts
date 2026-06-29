import type { CliSurfaceProfile } from '../../../shared/types/project-surface.js';
import type { ProjectRecord } from '../../state.js';
import { closeModal, setModalError, showModal } from '../modal.js';
import {
  isLikelyFixedPortCompatible,
  parseCliSurfaceArgs,
  parseCliSurfacePortMode,
} from './tab-bar-cli-surface-profile-utils.js';
import {
  selectCliSurfaceProfile,
  upsertCliSurfaceProfile,
} from './tab-bar-surface-state.js';

export function promptTabBarCliSurfaceProfile(
  project: ProjectRecord,
  existing?: CliSurfaceProfile,
  onReady?: (profile: CliSurfaceProfile) => void,
): void {
  showModal(
    existing ? 'Edit CLI Surface Profile' : 'CLI Surface Profile',
    [
      {
        label: 'Name',
        id: 'cli-profile-name',
        placeholder: 'Textual Dev',
        defaultValue: existing?.name ?? 'CLI Preview',
      },
      {
        label: 'Command',
        id: 'cli-profile-command',
        placeholder: 'python',
        defaultValue: existing?.command ?? '',
      },
      {
        label: 'Arguments',
        id: 'cli-profile-args',
        placeholder: "-m textual run app.py",
        defaultValue: existing?.args?.join(' ') ?? '',
      },
      {
        label: 'Working directory',
        id: 'cli-profile-cwd',
        placeholder: project.path,
        defaultValue: existing?.cwd ?? project.path,
      },
      {
        label: 'Port mode',
        id: 'cli-profile-port-mode',
        type: 'select',
        defaultValue: existing?.portMode ?? 'auto',
        options: [
          { value: 'auto', label: 'Auto (recommended)' },
          { value: 'fixed', label: 'Fixed port (supported web-server commands)' },
          { value: 'off', label: 'Off (no orchestration)' },
        ],
      },
      {
        label: 'Preferred port (optional in auto mode)',
        id: 'cli-profile-preferred-port',
        placeholder: '5173',
        defaultValue: existing?.preferredPort ? String(existing.preferredPort) : '',
      },
      {
        label: 'Allow fallback to next free port',
        id: 'cli-profile-port-fallback',
        type: 'checkbox',
        defaultValue: String(existing?.allowPortFallback ?? true),
      },
    ],
    (values) => {
      const name = values['cli-profile-name']?.trim();
      const command = values['cli-profile-command']?.trim();
      const parsedArgs = parseCliSurfaceArgs(values['cli-profile-args'] ?? '');
      const cwd = values['cli-profile-cwd']?.trim() || project.path;
      if (!name) {
        setModalError('cli-profile-name', 'Profile name is required');
        return;
      }
      if (!command) {
        setModalError('cli-profile-command', 'Command is required');
        return;
      }

      const portMode = parseCliSurfacePortMode(values['cli-profile-port-mode'], existing?.portMode ?? 'auto');
      const preferredPortRaw = values['cli-profile-preferred-port']?.trim() ?? '';
      let preferredPort: number | undefined;
      if (preferredPortRaw.length > 0) {
        const parsed = Number.parseInt(preferredPortRaw, 10);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          setModalError('cli-profile-preferred-port', 'Port must be between 1 and 65535');
          return;
        }
        preferredPort = parsed;
      } else if (portMode === 'fixed') {
        setModalError('cli-profile-preferred-port', 'Fixed mode requires a port');
        return;
      }

      const allowPortFallback = values['cli-profile-port-fallback'] === 'true';
      if (portMode === 'fixed' && !isLikelyFixedPortCompatible(command, parsedArgs)) {
        setModalError(
          'cli-profile-port-mode',
          'Fixed mode needs a supported command: vite/next/nuxt/astro or npm/pnpm/yarn with a script target.',
        );
        return;
      }

      const profile: CliSurfaceProfile = {
        id: existing?.id ?? crypto.randomUUID(),
        name,
        command,
        args: parsedArgs,
        cwd,
        portMode,
        preferredPort,
        allowPortFallback,
      };

      const profiles = upsertCliSurfaceProfile(project, profile);
      selectCliSurfaceProfile(project, profiles, profile.id);
      closeModal();
      onReady?.(profile);
    },
  );
}
