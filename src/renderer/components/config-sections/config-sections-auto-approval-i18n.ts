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

export type AutoApprovalModePlainLanguageDetails = {
  autoRuns: string;
  stillAsks: string;
};

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
      ? 'Hiçbir şeyi otomatik çalıştırmaz; her işlemde onay ister.'
      : 'Auto-runs nothing; asks before every action.';
  }
  if (mode === 'edit_only') {
    return tr
      ? 'Dosya düzenlemelerini otomatik çalıştırır; komutlar ve araçlar için sorar.'
      : 'Auto-runs file edits; asks before commands and tools.';
  }
  if (mode === 'edit_plus_safe_tools') {
    return tr
      ? 'Dosya düzenlemelerini ve güvenli salt-okunur komutları otomatik çalıştırır.'
      : 'Auto-runs file edits and safe read-only commands.';
  }
  if (mode === 'full_auto') {
    return tr
      ? 'Yıkıcı olmayan işlemleri otomatik çalıştırır; yıkıcı işlemler için sorar.'
      : 'Auto-runs non-destructive operations; asks before destructive actions.';
  }
  return tr
    ? 'Yıkıcı işlemler dahil her şeyi otomatik çalıştırır.'
    : 'Auto-runs every operation, including destructive actions.';
}

export function autoApprovalModePlainLanguageDetails(mode: AutoApprovalMode): AutoApprovalModePlainLanguageDetails {
  const tr = isTurkishUiLanguage();
  if (mode === 'off') {
    return {
      autoRuns: tr ? 'Hiçbir şey.' : 'Nothing.',
      stillAsks: tr ? 'Her düzenleme, komut ve araç çalıştırma.' : 'Every edit, command, and tool run.',
    };
  }
  if (mode === 'edit_only') {
    return {
      autoRuns: tr ? 'Dosya düzenlemeleri.' : 'File edits.',
      stillAsks: tr ? 'Komutlar, araçlar ve yıkıcı işlemler.' : 'Commands, tools, and destructive actions.',
    };
  }
  if (mode === 'edit_plus_safe_tools') {
    return {
      autoRuns: tr
        ? 'Dosya düzenlemeleri ve güvenli salt-okunur komutlar.'
        : 'File edits and safe read-only commands.',
      stillAsks: tr
        ? 'Yazma yapan, riskli veya yıkıcı komutlar.'
        : 'Write, risky, or destructive commands.',
    };
  }
  if (mode === 'full_auto') {
    return {
      autoRuns: tr ? 'Yıkıcı olmayan işlemler.' : 'Non-destructive operations.',
      stillAsks: tr ? 'Yıkıcı işlemler.' : 'Destructive actions.',
    };
  }
  return {
    autoRuns: tr ? 'Yıkıcı işlemler dahil her şey.' : 'Everything, including destructive actions.',
    stillAsks: tr ? 'Politika gereği hiçbir şey.' : 'Nothing by policy.',
  };
}

export function autoApprovalModeGuideSummary(mode: AutoApprovalMode): string {
  const details = autoApprovalModePlainLanguageDetails(mode);
  return localizedText(
    `Auto-runs: ${details.autoRuns} Still asks: ${details.stillAsks}`,
    `Otomatik çalıştırır: ${details.autoRuns} Yine sorar: ${details.stillAsks}`,
  );
}
