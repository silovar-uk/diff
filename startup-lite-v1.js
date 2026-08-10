/* Text Review Studio v1 – lightweight startup and edit-mode comparison guard. */
(() => {
  'use strict';

  const STORAGE_KEY = 'text-review-studio-v1';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      data.mode = 'edit';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch (_) { /* Keep startup resilient if storage is unavailable or malformed. */ }

  const Diff = window.TextReviewDiffCore;
  if (!Diff?.diffRows) return;

  const originalDiffRows = Diff.diffRows.bind(Diff);
  let forceNextComparison = false;

  function emptyResult(options = {}) {
    return {
      rows: [], hunks: [], parts: [], before: '', after: '',
      summary: { changes: 0, replaces: 0, inserts: 0, deletes: 0 },
      ignoredTags: options.ignoreHtmlTags !== false,
      ignoredSoftFormatting: Boolean(options.ignoreSoftFormatting)
    };
  }

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'mode-compare' || action === 'load-sample') forceNextComparison = true;
    if (action === 'mode-edit') forceNextComparison = false;
  }, true);

  Diff.diffRows = function guardedDiffRows(before, after, options) {
    const compareView = document.getElementById('compareView');
    const compareVisible = compareView && !compareView.hidden;
    if (!forceNextComparison && !compareVisible) return emptyResult(options);
    forceNextComparison = false;
    return originalDiffRows(before, after, options);
  };

  function markComparePending() {
    const compareView = document.getElementById('compareView');
    if (!compareView?.hidden) return;
    const before = document.getElementById('baselineText')?.value || '';
    const after = document.getElementById('workingText')?.value || '';
    if (!before || !after) return;
    const status = document.getElementById('analysisState');
    const summary = document.getElementById('toolbarSummary');
    if (status) status.textContent = '差分は「差分を比較」で更新します';
    if (summary) summary.textContent = '編集中は差分計算を停止しています';
  }

  document.addEventListener('input', (event) => {
    if (!event.target.matches?.('#baselineText, #workingText')) return;
    window.setTimeout(markComparePending, 280);
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(markComparePending, 0), { once: true });
  } else {
    window.setTimeout(markComparePending, 0);
  }
})();
