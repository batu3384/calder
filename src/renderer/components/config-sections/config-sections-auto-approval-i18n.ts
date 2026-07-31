import { appState } from '../../state.js';
import type { AutoApprovalMode, AutoApprovalPolicySource } from '../../types.js';

const AUTO_APPROVAL_MODE_LABELS: Record<AutoApprovalMode, string> = {
  ask: 'Ask every time',
  project_edits: 'Auto-approve file edits',
  session_safe: 'Auto-approve safe actions',
};

const AUTO_APPROVAL_MODE_LABELS_TR: Record<AutoApprovalMode, string> = {
  ask: 'Her seferinde sor',
  project_edits: 'Dosyaları otomatik onayla',
  session_safe: 'Güvenli işlemleri onayla',
};

export const AUTO_APPROVAL_MODE_OPTIONS: Array<{ value: AutoApprovalMode; label: string }> = [
  { value: 'ask', label: AUTO_APPROVAL_MODE_LABELS.ask },
  { value: 'project_edits', label: AUTO_APPROVAL_MODE_LABELS.project_edits },
  { value: 'session_safe', label: AUTO_APPROVAL_MODE_LABELS.session_safe },
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
  return localizedText('Follow global default', 'Global varsayılanı izle');
}

export function sessionInheritLabel(): string {
  return localizedText('Follow project default', 'Proje varsayılanını izle');
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
  if (mode === 'ask') {
    return tr
      ? 'Her izin isteğinde sorar. Calder dış CLI ayarlarını asla değiştirmez.'
      : 'Asks on every permission request. Calder never changes other CLI settings.';
  }
  if (mode === 'project_edits') {
    return tr
      ? 'Yalnız bu projedeki dosya düzenlemelerini otomatik onaylar; komutlar ve dış yollar için sorar.'
      : 'Auto-approves in-project file edits only; asks for commands and outside paths.';
  }
  return tr
    ? 'Bu oturumda proje düzenlemeleri ve salt-okunur komutlar otomatik; yıkıcı/bilinmeyen için sorar.'
    : 'This session: auto-approve project edits and read-only tools; asks for destructive/unknown.';
}

export function autoApprovalModePlainLanguageDetails(
  mode: AutoApprovalMode,
): AutoApprovalModePlainLanguageDetails {
  const tr = isTurkishUiLanguage();
  if (mode === 'ask') {
    return {
      autoRuns: tr ? 'Hiçbir şey.' : 'Nothing.',
      stillAsks: tr
        ? 'Her düzenleme, komut ve araç çalıştırma.'
        : 'Every edit, command, and tool run.',
    };
  }
  if (mode === 'project_edits') {
    return {
      autoRuns: tr ? 'Proje içi dosya düzenlemeleri.' : 'In-project file edits.',
      stillAsks: tr
        ? 'Komutlar, dış yollar, home/global, yıkıcı işlemler.'
        : 'Commands, outside paths, home/global, destructive actions.',
    };
  }
  return {
    autoRuns: tr
      ? 'Proje düzenlemeleri ve güvenli salt-okunur komutlar (yalnız bu oturum).'
      : 'Project edits and safe read-only commands (this session only).',
    stillAsks: tr
      ? 'Yazma/riskli/yıkıcı komutlar ve proje dışı yollar.'
      : 'Write, risky, destructive commands and outside-project paths.',
  };
}
