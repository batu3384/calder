import { t } from '../../i18n.js';
import { applyTabularNums } from '../surface-services/dom-utils.js';
import {
  beginEvidenceViewGeneration,
  isEvidenceViewGenerationCurrent,
} from './evidence-view-support.js';
import { renderEvidenceReviewSummary } from './evidence-view-ui.js';
import { inspectorState } from './session-inspector-state-ui.js';
import { emptyMessage, renderInspectorEmpty } from './session-inspector-utils.js';

export function renderReview(container: HTMLElement): void {
  const sessionId = inspectorState.inspectedSessionId;
  if (!sessionId) return;

  const generation = beginEvidenceViewGeneration();
  container.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'inspector-empty';
  loading.textContent = t('Loading review…');
  container.appendChild(loading);

  void (async () => {
    try {
      const [meta, settings, summaryResult, storageBytes, review, health] = await Promise.all([
        window.calder.evidence.getMeta(sessionId),
        window.calder.evidence.getSettings(),
        window.calder.evidence.getSummary(sessionId),
        window.calder.evidence.getStorageUsage(),
        window.calder.evidence.getReview(sessionId),
        window.calder.evidence.getHealth(sessionId),
      ]);
      if (!isEvidenceViewGenerationCurrent(generation)) return;

      if (!settings.enabled) {
        container.replaceChildren();
        renderInspectorEmpty(
          container,
          emptyMessage(
            t('Session evidence capture is disabled. Enable it in Preferences → Safety.'),
          ),
        );
        return;
      }

      if (!meta) {
        container.replaceChildren();
        renderInspectorEmpty(container, emptyMessage(t('No evidence run for review')));
        return;
      }

      container.replaceChildren();
      container.appendChild(renderEvidenceReviewSummary(summaryResult?.summary ?? null, health));

      const form = document.createElement('div');
      form.className = 'inspector-evidence-review-form';
      container.appendChild(form);

      const statusRow = document.createElement('div');
      statusRow.className = 'inspector-evidence-review-row';
      const statusLabel = document.createElement('label');
      statusLabel.textContent = t('Review status');
      statusRow.appendChild(statusLabel);

      const statusSelect = document.createElement('select');
      statusSelect.className = 'inspector-evidence-review-select';
      for (const status of ['pending', 'approved', 'rejected', 'needs_changes'] as const) {
        const opt = document.createElement('option');
        opt.value = status;
        opt.textContent = t(status.replace(/_/g, ' '));
        statusSelect.appendChild(opt);
      }
      if (review?.status) statusSelect.value = review.status;
      statusRow.appendChild(statusSelect);
      form.appendChild(statusRow);

      const notesLabel = document.createElement('label');
      notesLabel.textContent = t('Notes');
      notesLabel.className = 'inspector-evidence-review-label';
      form.appendChild(notesLabel);

      const notesArea = document.createElement('textarea');
      notesArea.className = 'inspector-evidence-review-notes';
      notesArea.rows = 4;
      if (review?.notes) notesArea.value = review.notes;
      form.appendChild(notesArea);

      const saveStatus = document.createElement('div');
      saveStatus.className = 'inspector-evidence-review-save-status';
      saveStatus.hidden = true;
      form.appendChild(saveStatus);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'inspector-evidence-save-btn';
      saveBtn.textContent = t('Save review');
      saveBtn.addEventListener('click', () => {
        void window.calder.evidence
          .updateReview(
            meta.runId,
            statusSelect.value as 'pending' | 'approved' | 'rejected' | 'needs_changes',
            notesArea.value || undefined,
          )
          .then(() => {
            saveStatus.textContent = t('Review saved');
            saveStatus.hidden = false;
          });
      });
      form.appendChild(saveBtn);

      const exportNote = document.createElement('div');
      exportNote.className = 'inspector-evidence-export-note';
      exportNote.textContent = t(
        'Exports are sanitized and only run when you click a button below.',
      );
      container.appendChild(exportNote);

      const exportRow = document.createElement('div');
      exportRow.className = 'inspector-evidence-export-row';
      const exportJson = document.createElement('button');
      exportJson.textContent = t('Export JSON');
      exportJson.addEventListener('click', () => {
        void window.calder.evidence.export(meta.runId, 'json');
      });
      const exportMd = document.createElement('button');
      exportMd.textContent = t('Export Markdown');
      exportMd.addEventListener('click', () => {
        void window.calder.evidence.export(meta.runId, 'markdown');
      });
      exportRow.append(exportJson, exportMd);
      container.appendChild(exportRow);

      const storage = document.createElement('div');
      storage.className = 'inspector-evidence-storage';
      applyTabularNums(storage);
      storage.textContent = `${t('Evidence storage')}: ${(storageBytes / 1024).toFixed(1)} KB`;
      container.appendChild(storage);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'inspector-evidence-delete-btn';
      deleteBtn.textContent = t('Delete this run');
      deleteBtn.addEventListener('click', () => {
        void window.calder.evidence.deleteRun(meta.runId).then((result) => {
          if (result.ok && !result.canceled) renderReview(container);
        });
      });
      container.appendChild(deleteBtn);

      const deleteAllBtn = document.createElement('button');
      deleteAllBtn.className = 'inspector-evidence-delete-all-btn';
      deleteAllBtn.textContent = t('Delete all evidence');
      deleteAllBtn.addEventListener('click', () => {
        void window.calder.evidence.deleteAll().then((result) => {
          if (!result.canceled) renderReview(container);
        });
      });
      container.appendChild(deleteAllBtn);
    } catch {
      renderInspectorEmpty(container, t('Review unavailable'));
    }
  })();
}
