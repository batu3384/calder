import { appState } from '../../state.js';
import type { AutoApprovalMode, AutoApprovalPolicySource } from '../../types.js';

const AUTO_APPROVAL_MODE_LABELS: Record<AutoApprovalMode, string> = {
  off: 'Off',
  edit_only: 'Edit Only',
  edit_plus_safe_tools: 'Edit + Safe Tools',
  full_auto: 'Full Auto',
  full_auto_unsafe: 'Full Auto (Unsafe)',
};

const AUTO_APPROVAL_MODE_LABELS_TR: Record<AutoApprovalMode, string> = {
  off: 'Kapalı',
  edit_only: 'Sadece Düzenleme',
  edit_plus_safe_tools: 'Düzenleme + Güvenli Komutlar',
  full_auto: 'Tam Otomatik',
  full_auto_unsafe: 'Tam Otomatik (Tehlikeli)',
};

export const AUTO_APPROVAL_MODE_OPTIONS: Array<{ value: AutoApprovalMode; label: string }> = [
  { value: 'off', label: AUTO_APPROVAL_MODE_LABELS.off },
  { value: 'edit_only', label: AUTO_APPROVAL_MODE_LABELS.edit_only },
  { value: 'edit_plus_safe_tools', label: AUTO_APPROVAL_MODE_LABELS.edit_plus_safe_tools },
  { value: 'full_auto', label: AUTO_APPROVAL_MODE_LABELS.full_auto },
  { value: 'full_auto_unsafe', label: AUTO_APPROVAL_MODE_LABELS.full_auto_unsafe },
];

function isTurkishUiLanguage(): boolean {
  return appState.preferences.language === 'tr';
}

export function localizedText(english: string, turkish: string): string {
  return isTurkishUiLanguage() ? turkish : english;
}

export function autoApprovalModeLabel(mode: AutoApprovalMode): string {
  return isTurkishUiLanguage()
    ? AUTO_APPROVAL_MODE_LABELS_TR[mode]
    : AUTO_APPROVAL_MODE_LABELS[mode];
}

export function projectInheritLabel(): string {
  return localizedText('Use Global Default', 'Global varsayılanını kullan');
}

export function sessionInheritLabel(): string {
  return localizedText('Use Project / Global Default', 'Proje / Global varsayılanını kullan');
}

export function autoApprovalScopeHelp(): { global: string; project: string; session: string } {
  return {
    global: localizedText('Default policy for this Mac.', 'Bu Mac için varsayılan politika.'),
    project: localizedText('Repository-level policy.', 'Depo düzeyinde politika.'),
    session: localizedText('Temporary policy for the active session.', 'Aktif oturum için geçici politika.'),
  };
}

export function autoApprovalSourceLabel(source: AutoApprovalPolicySource): string {
  const tr = isTurkishUiLanguage();
  switch (source) {
    case 'session':
      return tr ? 'Oturum geçersiz kılması' : 'Session override';
    case 'project':
      return tr ? 'Proje politikası' : 'Project policy';
    case 'global':
      return tr ? 'Global varsayılan' : 'Global default';
    case 'fallback':
    default:
      return tr ? 'Yedek varsayılan' : 'Fallback default';
  }
}

export function autoApprovalModeBehavior(mode: AutoApprovalMode): string {
  const tr = isTurkishUiLanguage();
  if (mode === 'off') {
    return tr
      ? 'Her işlemden önce onay ister.'
      : 'Always asks for approval before actions.';
  }
  if (mode === 'edit_only') {
    return tr
      ? 'Yalnızca dosya düzenlemelerini otomatik onaylar.'
      : 'Auto-approves file edits only.';
  }
  if (mode === 'edit_plus_safe_tools') {
    return tr
      ? 'Dosya düzenlemeleri ve güvenli salt-okunur komutları otomatik onaylar.'
      : 'Auto-approves file edits and safe read-only commands.';
  }
  if (mode === 'full_auto') {
    return tr
      ? 'Yıkıcı olmayan işlemleri otomatik onaylar; yıkıcı işlemler manuel onay gerektirir.'
      : 'Auto-approves non-destructive operations; destructive actions still require manual approval.';
  }
  return tr
    ? 'Yıkıcı işlemler dahil tüm işlemleri otomatik onaylar.'
    : 'Auto-approves every operation, including destructive actions.';
}

export function autoApprovalModeGuideSummary(mode: AutoApprovalMode): string {
  const tr = isTurkishUiLanguage();
  if (mode === 'off') {
    return tr ? 'İşlemleri onaylamadan önce sorar.' : 'Asks before approving operations.';
  }
  if (mode === 'edit_only') {
    return tr ? 'Dosya düzenlemelerini otomatik onaylar.' : 'Auto-approves file edits.';
  }
  if (mode === 'edit_plus_safe_tools') {
    return tr
      ? 'Düzenlemeleri ve güvenli salt-okunur komutları otomatik onaylar.'
      : 'Auto-approves edits and read-only safe commands.';
  }
  if (mode === 'full_auto') {
    return tr
      ? 'Yıkıcı olmayan işlemleri otomatik onaylar; yıkıcı işlemlerde sorar.'
      : 'Auto-approves non-destructive operations; asks before destructive actions.';
  }
  return tr
    ? 'Yıkıcı işlemler dahil tüm işlemleri otomatik onaylar.'
    : 'Auto-approves every operation, including destructive actions.';
}
