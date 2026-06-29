import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const profileModalSource = readFileSync(new URL('./tab-bar-cli-profile-modal.ts', import.meta.url), 'utf-8');

describe('tab bar cli profile modal extraction', () => {
  it('keeps prompt orchestration in tab-bar and delegates details to dedicated helper', () => {
    expect(tabBarSource).toContain('function promptCliSurfaceProfile(');
    expect(tabBarSource).toContain('promptTabBarCliSurfaceProfile(project, existing, onReady);');
  });

  it('retains profile validation and persistence behavior inside helper module', () => {
    expect(profileModalSource).toContain("setModalError('cli-profile-name', 'Profile name is required')");
    expect(profileModalSource).toContain("setModalError('cli-profile-command', 'Command is required')");
    expect(profileModalSource).toContain('parseCliSurfacePortMode');
    expect(profileModalSource).toContain('isLikelyFixedPortCompatible');
    expect(profileModalSource).toContain('upsertCliSurfaceProfile(project, profile)');
    expect(profileModalSource).toContain('selectCliSurfaceProfile(project, profiles, profile.id);');
    expect(profileModalSource).toContain('closeModal();');
  });
});
