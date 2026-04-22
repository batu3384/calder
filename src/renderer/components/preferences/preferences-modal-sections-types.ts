import type { MobileDependencyId } from '../../../shared/types/mobile.js';
import type { ProviderId, UiLanguage } from '../../../shared/types/provider.js';
import type { ProjectCheckpointDocument } from '../../../shared/types/project.js';
import type { CustomSelectInstance } from '../custom-select.js';

export type AppendSectionIntro = (
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
) => void;

export type AppendOverviewGrid = (
  container: HTMLElement,
  items: Array<{ label: string; value: string; note?: string }>,
) => void;

export type AppendSectionCard = (container: HTMLElement, title: string, description?: string) => HTMLElement;
export type AppendSectionGroup = (
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
) => HTMLElement;

export interface LayoutSidebarViews {
  configSections: boolean;
  gitPanel: boolean;
  sessionHistory: boolean;
  costFooter: boolean;
}

export interface LayoutDraft {
  sidebarViews: LayoutSidebarViews;
}

export interface AboutDraft {
  debugMode: boolean;
}

export interface GeneralDraft {
  soundOnSessionWaiting: boolean;
  notificationsDesktop: boolean;
  sessionHistoryEnabled: boolean;
  insightsEnabled: boolean;
  autoTitleEnabled: boolean;
  defaultProvider: ProviderId;
  language: UiLanguage;
}

export interface RenderLayoutSectionArgs {
  content: HTMLElement;
  preferenceDraft: LayoutDraft;
  appendSectionIntro: AppendSectionIntro;
  appendOverviewGrid: AppendOverviewGrid;
  appendSectionCard: AppendSectionCard;
}

export interface RenderAboutSectionArgs {
  content: HTMLElement;
  preferenceDraft: AboutDraft;
  appendSectionIntro: AppendSectionIntro;
  appendOverviewGrid: AppendOverviewGrid;
  formatRelativeTimestamp: (timestamp?: string) => string;
}

export interface RenderGeneralSectionArgs {
  content: HTMLElement;
  preferenceDraft: GeneralDraft;
  appendSectionIntro: AppendSectionIntro;
  appendOverviewGrid: AppendOverviewGrid;
  isGeneralSectionActive: () => boolean;
  getDefaultProviderSelect: () => CustomSelectInstance | null;
  replaceDefaultProviderSelect: (select: CustomSelectInstance) => void;
  replaceLanguageSelect: (select: CustomSelectInstance) => void;
}

export interface RenderProvidersSectionArgs {
  content: HTMLElement;
  appendSectionIntro: AppendSectionIntro;
  appendOverviewGrid: AppendOverviewGrid;
  appendSectionGroup: AppendSectionGroup;
  appendSectionCard: AppendSectionCard;
  closeWideModal: () => void;
  rerenderProviders: () => void;
  modalBody: HTMLElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  registerModalCleanup: (cleanup: () => void) => void;
  buildCheckpointRestoreConfirm: (
    projectId: string,
    projectPath: string,
    checkpointDocument: ProjectCheckpointDocument,
    restoreSummaryText: string,
  ) => HTMLElement;
  isProvidersSectionActive: () => boolean;
  onApplySetupBadge: (hasIssue: boolean) => void;
  onFixProvider: (providerId?: ProviderId) => Promise<void>;
  onInstallMobileDependency: (dependencyId: MobileDependencyId) => Promise<void>;
}

export interface ProviderAvailabilitySnapshot {
  providers: Array<{ id: ProviderId; displayName: string }>;
  availability: Map<ProviderId, boolean>;
}
