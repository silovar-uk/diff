(() => {
  'use strict';

  const Diff = window.TextReviewDiffCore;
  if (!Diff?.diffRows) {
    document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">差分エンジンを読み込めませんでした。</p>';
    return;
  }

  const STORAGE_KEY = 'text-review-studio-v1';
  const LEGACY_KEYS = ['text-review-studio-v0.6.3', 'text-review-studio-v0.6.2', 'text-review-studio-v0.6.1', 'text-review-studio-v0.6.0'];
  const REQUIRED_IDS = [
    'baselineText', 'workingText', 'editModeButton', 'compareModeButton',
    'ignoreHtmlTagsToggle', 'editorView', 'compareView', 'diffRows',
    'copyButton', 'copyMenu', 'displayDialog', 'displayShowTags',
    'displayWhitespace', 'displayUrls', 'searchInput', 'searchCount', 'toast',
    'workflowStrip', 'diffSummary', 'diffMap', 'selectionToolbar', 'moreMenu', 'moreMenuButton',
    'reviewProgress', 'reviewSidebarProgress', 'finalPreviewDialog', 'finalPreviewText', 'finalPreviewButton'
  ];
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const SAMPLE = {
    before: `日ごろより浦和レッズをサポートいただき、ありがとうございます。
ホーム開幕戦8月15日(土)第2節 サンフレッチェ広島戦【MATCH PARTNER ポラスグループ】のチケット販売についてご案内いたします。

<span class="info24-t2">8/15(土)広島戦  “ポケモンJリーグフェス”開催決定! 来場者先着52,000名さまにEVO BAG(ポケモンのエコバッグ)をプレゼント!</span>
<img src="https://www.urawa-reds.co.jp/wp-content/uploads/2026/07/jp_bag_03-1.jpg" alt="" width="1920" height="1080" />

浦和レッズは、8/15(土)サンフレッチェ広島戦【MATCH PARTNER ポラスグループ】にて“ポケモンJリーグフェス”を開催いたします。
試合当日、ピカチュウとクラブパートナーポケモン「ガオガエン」がデザインされたEVO BAGを先着52,000名さまにプレゼントいたします。
※ビジターチームを応援するご来場者を除く

詳細はこちら
<a href="https://www.urawa-reds.co.jp/clubinfo/243121/">https://www.urawa-reds.co.jp/clubinfo/243121/</a>

<span class="info24-t2">販売対象試合と販売スケジュール</span>
※当試合はシーズンチケット対象試合となります。
※REX CLUBマイページに配信されている「デジタルクーポン」から、各対象試合のチケット取得が必要となります。`,
    after: `【タイトル】
ホームゲーム(J1リーグ) 8月開催試合のチケット販売について

【本文】
日頃より浦和レッズをサポートいただき、ありがとうございます。
ホーム開幕戦8月15日(土)第2節 サンフレッチェ広島戦【MATCH PARTNER ポラスグループ】のチケット販売についてご案内いたします。

◆8/15(土)広島戦  “ポケモンJリーグフェス”開催決定! 来場者先着52,000名さまにEVO BAG(ポケモンのエコバッグ)をプレゼント!
 
浦和レッズは、8/15(土)サンフレッチェ広島戦【MATCH PARTNER ポラスグループ】にて“ポケモンJリーグフェス”を開催いたします。
試合当日、ピカチュウとクラブパートナーポケモン「ガオガエン」がデザインされたEVO BAGを先着52,000名さまにプレゼントいたします。
※ビジターチームを応援するご来場者を除く
詳細はコチラ　https://www.urawa-reds.co.jp/clubinfo/243121/

◆販売対象試合と販売スケジュール
 
※当試合はシーズンチケット対象試合となります。
※REX CLUB マイページに配信されている「デジタルクーポン」から各対象試合のチケット取得が必要となります。`
  };

  const TAGS = {
    t1: ['<span class="info24-t1">', '</span>'],
    t2: ['<span class="info24-t2">', '</span>'],
    t3: ['<span class="info24-t3">', '</span>'],
    t3red: ['<span class="info24-t3-red">', '</span>'],
    label: ['<span class="info24-label">', '</span>'],
    strong: ['<strong>', '</strong>'],
    photo2: ['<div class="info25__photo-2col">\n', '\n</div>'],
    hr: ['<hr class="info26__hr1" />', '']
  };

  const emptySummary = () => ({ changes: 0, replaces: 0, inserts: 0, deletes: 0 });
  const state = {
    before: '',
    after: '',
    mode: 'edit',
    compareOptions: { ignoreHtmlTags: true },
    displayOptions: { showTags: false, showWhitespace: false, highlightUrls: false },
    comparison: { rows: [], summary: emptySummary() },
    activeRowIndex: -1,
    reviewedKeys: new Set(),
    expandedSameRuns: new Set(),
    reviewFocus: false,
    undoStack: [],
    redoStack: [],
    search: { query: '', matches: [], current: -1 },
    analyzing: false
  };

  let compareTimer = 0;
  let typingBase = null;
  let typingTimer = 0;

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function assertDomContract() {
    const missing = REQUIRED_IDS.filter((id) => !document.getElementById(id));
    if (!missing.length) return true;
    document.body.innerHTML = `<p style="padding:24px;font-family:sans-serif">画面の読み込みに失敗しました。<br><small>不足要素: ${escapeHTML(missing.join(', '))}</small></p>`;
    console.error('Text Review Studio DOM contract failed:', missing);
    return false;
  }

  function snapshotData() {
    return JSON.stringify({
      before: state.before,
      after: state.after,
      mode: state.mode,
      compareOptions: state.compareOptions,
      displayOptions: state.displayOptions
    });
  }

  function restoreSnapshot(raw) {
    const data = JSON.parse(raw);
    state.before = typeof data.before === 'string' ? data.before : '';
    state.after = typeof data.after === 'string' ? data.after : '';
    state.mode = data.mode === 'compare' ? 'compare' : 'edit';
    state.compareOptions = { ...state.compareOptions, ...(data.compareOptions || {}) };
    state.displayOptions = { ...state.displayOptions, ...(data.displayOptions || {}) };
    syncEditors();
    calculateComparison();
    renderAll();
    persist();
  }

  function pushSnapshot(raw) {
    if (!raw || raw === snapshotData()) return;
    const previous = state.undoStack[state.undoStack.length - 1];
    if (previous !== raw) state.undoStack.push(raw);
    if (state.undoStack.length > 80) state.undoStack.shift();
    state.redoStack = [];
  }

  function beginTyping() {
    if (!typingBase) typingBase = snapshotData();
    clearTimeout(typingTimer);
    typingTimer = window.setTimeout(flushTypingHistory, 700);
  }

  function flushTypingHistory() {
    clearTimeout(typingTimer);
    if (typingBase) pushSnapshot(typingBase);
    typingBase = null;
    renderUndo();
  }

  function commit(mutator, message = '') {
    flushTypingHistory();
    const before = snapshotData();
    mutator();
    if (before === snapshotData()) return false;
    pushSnapshot(before);
    syncEditors();
    calculateComparison();
    renderAll();
    persist();
    if (message) notify(message);
    return true;
  }

  function undo() {
    flushTypingHistory();
    if (!state.undoStack.length) return;
    state.redoStack.push(snapshotData());
    restoreSnapshot(state.undoStack.pop());
    notify('直前の操作を元に戻しました');
  }

  function redo() {
    flushTypingHistory();
    if (!state.redoStack.length) return;
    state.undoStack.push(snapshotData());
    restoreSnapshot(state.redoStack.pop());
    notify('やり直しました');
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        schemaVersion: 1,
        before: state.before,
        after: state.after,
        mode: state.mode,
        compareOptions: state.compareOptions,
        displayOptions: state.displayOptions,
        reviewedKeys: [...state.reviewedKeys],
        updatedAt: new Date().toISOString()
      }));
    } catch (_) { /* The app remains usable without storage. */ }
  }

  function hydrate() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) || '';
      if (!raw) return;
      const data = JSON.parse(raw);
      state.before = typeof data.before === 'string' ? data.before : typeof data.baseline === 'string' ? data.baseline : '';
      state.after = typeof data.after === 'string' ? data.after : typeof data.working === 'string' ? data.working : '';
      state.mode = data.mode === 'compare' ? 'compare' : 'edit';
      state.compareOptions = { ...state.compareOptions, ...(data.compareOptions || {}) };
      state.displayOptions = { ...state.displayOptions, ...(data.displayOptions || data.display || {}) };
      state.reviewedKeys = new Set(Array.isArray(data.reviewedKeys) ? data.reviewedKeys : []);
    } catch (_) { /* Ignore malformed legacy data. */ }
  }

  function syncEditors() {
    const before = $('#baselineText');
    const after = $('#workingText');
    if (before.value !== state.before) before.value = state.before;
    if (after.value !== state.after) after.value = state.after;
  }

  function textStats(value) {
    const text = String(value || '');
    return { chars: Array.from(text).length, lines: text ? text.split('\n').length : 0 };
  }

  function summaryFromRows(rows) {
    return {
      changes: rows.filter((row) => row.kind !== 'same').length,
      replaces: rows.filter((row) => row.kind === 'replace').length,
      inserts: rows.filter((row) => row.kind === 'insert').length,
      deletes: rows.filter((row) => row.kind === 'delete').length
    };
  }

  function calculateComparison() {
    if (!state.before || !state.after) {
      state.comparison = { rows: [], summary: emptySummary() };
      state.activeRowIndex = -1;
      state.reviewFocus = false;
      return;
    }
    const result = Diff.diffRows(state.before, state.after, {
      ignoreHtmlTags: state.compareOptions.ignoreHtmlTags,
      ignoreSoftFormatting: false
    });
    const rows = Array.isArray(result.rows) ? result.rows : [];
    state.comparison = {
      rows,
      summary: result.summary || summaryFromRows(rows)
    };
    reconcileReviewedKeys();
    state.expandedSameRuns.clear();
    const changed = changedIndexes();
    if (!changed.length) state.reviewFocus = false;
    if (!changed.includes(state.activeRowIndex)) state.activeRowIndex = changed[0] ?? -1;
  }

  function scheduleComparison() {
    state.analyzing = true;
    updateStatus();
    clearTimeout(compareTimer);
    compareTimer = window.setTimeout(() => {
      state.analyzing = false;
      calculateComparison();
      renderAll();
      persist();
    }, 240);
  }

  function changedIndexes() {
    return state.comparison.rows.reduce((indexes, row, index) => {
      if (row.kind !== 'same') indexes.push(index);
      return indexes;
    }, []);
  }

  function reviewKey(row) {
    const source = `${row?.kind || ''}\u0000${row?.beforeRaw ?? row?.before ?? ''}\u0000${row?.afterRaw ?? row?.after ?? ''}`;
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `r${(hash >>> 0).toString(36)}`;
  }

  function reconcileReviewedKeys() {
    const valid = new Set(
      state.comparison.rows
        .filter((row) => row.kind !== 'same')
        .map(reviewKey)
    );
    state.reviewedKeys.forEach((key) => {
      if (!valid.has(key)) state.reviewedKeys.delete(key);
    });
  }

  function reviewedCount() {
    return state.comparison.rows.reduce((count, row) =>
      row.kind !== 'same' && state.reviewedKeys.has(reviewKey(row)) ? count + 1 : count, 0);
  }

  function unreviewedIndexes() {
    return changedIndexes().filter((index) => !state.reviewedKeys.has(reviewKey(state.comparison.rows[index])));
  }

  function toggleReviewed(index) {
    const row = state.comparison.rows[index];
    if (!row || row.kind === 'same') return;
    const key = reviewKey(row);
    if (state.reviewedKeys.has(key)) state.reviewedKeys.delete(key);
    else state.reviewedKeys.add(key);
    renderAll();
    persist();
  }

  function moveNextUnreviewed() {
    const indexes = unreviewedIndexes();
    if (!indexes.length) {
      notify('すべての変更を確認済みです');
      return;
    }
    const next = indexes.find((index) => index > state.activeRowIndex) ?? indexes[0];
    selectDiff(next);
  }

  function marker(kind) {
    return ({ replace: '↔', insert: '＋', delete: '−' }[kind] || '');
  }

  function formatWhitespace(text) {
    let output = escapeHTML(text);
    if (!state.displayOptions.showWhitespace) return output;
    return output
      .replace(/　/g, '<span class="visible-space">□</span>')
      .replace(/ /g, '<span class="visible-space">·</span>')
      .replace(/\n/g, '<span class="visible-newline">↵</span>\n');
  }

  function formatText(text) {
    const input = String(text || '');
    if (!state.displayOptions.highlightUrls) return formatWhitespace(input);
    const pattern = /https?:\/\/[^\s<]+/g;
    let output = '';
    let cursor = 0;
    let match;
    while ((match = pattern.exec(input))) {
      output += formatWhitespace(input.slice(cursor, match.index));
      output += `<span class="highlight-url">${escapeHTML(match[0])}</span>`;
      cursor = match.index + match[0].length;
    }
    output += formatWhitespace(input.slice(cursor));
    return output;
  }

  function rowRaw(row, side) {
    const direct = side === 'before' ? row.beforeRaw : row.afterRaw;
    if (typeof direct === 'string') return direct;
    const source = side === 'before' ? state.before : state.after;
    const start = side === 'before' ? row.beforeStart : row.afterStart;
    const end = side === 'before' ? row.beforeEnd : row.afterEnd;
    return source.slice(start || 0, end || start || 0);
  }

  function tagChips(row, side) {
    if (!state.displayOptions.showTags) return '';
    const known = side === 'before' ? row.beforeTags : row.afterTags;
    const tags = Array.isArray(known) ? known : (rowRaw(row, side).match(/<\/?[A-Za-z][^>]*>/g) || []);
    if (!tags.length) return '';
    return `<div class="tag-context">${tags.map((tag) => `<code class="tag-chip">${escapeHTML(tag)}</code>`).join('')}</div>`;
  }

  function htmlDiffDetail(row, index) {
    if (state.compareOptions.ignoreHtmlTags || !row.htmlChanged) return '';
    const beforeTags = Array.isArray(row.beforeTags) ? row.beforeTags : [];
    const afterTags = Array.isArray(row.afterTags) ? row.afterTags : [];
    const renderTags = (tags) => tags.length
      ? tags.map((tag) => `<code>${escapeHTML(tag)}</code>`).join('')
      : '<span class="html-diff-none">（タグなし）</span>';
    return `<div class="html-diff-detail" data-html-detail="${index}" hidden>
      <div><strong>変更前のHTML</strong><div class="html-diff-code">${renderTags(beforeTags)}</div></div>
      <div><strong>修正後のHTML</strong><div class="html-diff-code">${renderTags(afterTags)}</div></div>
    </div>`;
  }

  function toggleHtmlDetail(index) {
    const detail = document.querySelector(`[data-html-detail="${index}"]`);
    if (!detail) return;
    const opening = detail.hidden;
    detail.hidden = !opening;
    const button = document.querySelector(`[data-html-diff-index="${index}"]`);
    if (button) button.setAttribute('aria-expanded', String(opening));
  }

  function renderInline(row, side) {
    const include = side === 'before' ? new Set(['same', 'remove']) : new Set(['same', 'add']);
    const changed = side === 'before' ? 'remove' : 'add';
    const css = side === 'before' ? 'diff-before-change' : 'diff-after-change';
    const parts = Array.isArray(row.parts) ? row.parts : [];
    let html = parts.filter((part) => include.has(part.type)).map((part) => {
      const text = formatText(part.value);
      return part.type === changed ? `<span class="${css}">${text}</span>` : text;
    }).join('');
    if (!html) {
      const fallback = side === 'before' ? row.before : row.after;
      if (fallback) html = row.kind === 'same' ? formatText(fallback) : `<span class="${css}">${formatText(fallback)}</span>`;
    }
    return `${tagChips(row, side)}${html || '<span class="diff-empty">&nbsp;</span>'}`;
  }

  function renderDiffRow(row, index) {
    const beforeEmpty = !row.before ? ' is-empty' : '';
    const afterEmpty = !row.after ? ' is-empty' : '';
    const active = index === state.activeRowIndex ? ' is-active' : '';
    const htmlVisible = !state.compareOptions.ignoreHtmlTags && row.htmlChanged;
    const htmlOnly = htmlVisible && !row.textChanged;
    const symbol = htmlOnly ? '◇' : marker(row.kind);
    const label = htmlOnly ? 'HTML変更' : row.kind === 'replace' ? '置換' : row.kind === 'insert' ? '追加' : row.kind === 'delete' ? '削除' : '';
    const htmlAttrs = htmlVisible ? ` data-html-diff-index="${index}" aria-expanded="false"` : '';
    const htmlLabel = htmlVisible ? '<small>HTML</small>' : '';
    const markerClass = htmlOnly ? 'html' : row.kind;
    const markerButton = symbol
      ? `<button type="button" class="diff-marker ${markerClass}${htmlVisible ? ' has-html' : ''}" data-diff-index="${index}"${htmlAttrs} title="${htmlVisible ? 'HTML変更の詳細を表示' : label}" aria-label="${htmlVisible ? label + '。HTML変更の詳細を表示' : label}"><span>${symbol}</span>${htmlLabel}</button>`
      : '';
    const reviewed = row.kind !== 'same' && state.reviewedKeys.has(reviewKey(row));
    const reviewButton = row.kind !== 'same'
      ? `<button type="button" class="review-toggle${reviewed ? ' is-reviewed' : ''}" data-review-index="${index}" aria-pressed="${String(reviewed)}" title="${reviewed ? '未確認に戻す' : '確認済みにする'}" aria-label="${label}を${reviewed ? '未確認に戻す' : '確認済みにする'}">${reviewed ? '✓' : '○'}</button>`
      : '';
    const rail = markerButton || reviewButton ? `<div class="diff-rail-stack">${markerButton}${reviewButton}</div>` : '';
    return `<article class="diff-row${active}${htmlOnly ? ' is-html-only' : ''}${reviewed ? ' is-reviewed' : ''}" data-diff-row="${index}">
      <div class="diff-cell before${beforeEmpty}">${renderInline(row, 'before')}</div>
      <div class="diff-rail-cell">${rail}</div>
      <div class="diff-cell after${afterEmpty}">${renderInline(row, 'after')}</div>
      ${htmlDiffDetail(row, index)}
    </article>`;
  }

  function renderCollapsedRows() {
    const rows = state.comparison.rows;
    const output = [];
    let index = 0;
    while (index < rows.length) {
      if (rows[index].kind !== 'same') {
        output.push(renderDiffRow(rows[index], index));
        index += 1;
        continue;
      }
      let end = index;
      while (end + 1 < rows.length && rows[end + 1].kind === 'same') end += 1;
      const count = end - index + 1;
      const key = `${index}-${end}`;
      if (count >= 5 && !state.expandedSameRuns.has(key)) {
        output.push(renderDiffRow(rows[index], index));
        const hiddenCount = Math.max(0, count - 2);
        output.push(`<div class="unchanged-fold" data-same-run="${key}"><button type="button" data-expand-same="${key}">同一 ${hiddenCount}行 <span>展開</span></button></div>`);
        output.push(renderDiffRow(rows[end], end));
      } else {
        for (let rowIndex = index; rowIndex <= end; rowIndex += 1) output.push(renderDiffRow(rows[rowIndex], rowIndex));
      }
      index = end + 1;
    }
    return output.join('');
  }

  function renderComparison() {
    const rowsTarget = $('#diffRows');
    if (!state.before || !state.after) {
      const title = !state.before && !state.after ? '原稿を入力してください' : !state.before ? '変更前の原稿を入力してください' : '修正後の原稿を入力してください';
      rowsTarget.innerHTML = `<div class="diff-empty-state"><div><strong>${title}</strong><p>左右に原稿を入れると、レビューすべき変更を並べます。</p></div></div>`;
      renderDiffNavigation();
      return;
    }
    if (!state.comparison.rows.length || !state.comparison.summary.changes) {
      rowsTarget.innerHTML = '<div class="diff-empty-state"><div><strong>差分はありません</strong><p>比較対象の本文は一致しています。</p></div></div>';
      renderDiffNavigation();
      return;
    }
    rowsTarget.innerHTML = renderCollapsedRows();
    renderDiffNavigation();
  }

  function renderDiffNavigation() {
    renderDiffMap();
    const changed = changedIndexes();
    const status = $('#diffNavStatus');
    const previous = $('#diffPrev');
    const next = $('#diffNext');
    if (!changed.length) {
      status.textContent = '0 / 0';
      previous.disabled = true;
      next.disabled = true;
      return;
    }
    const position = Math.max(0, changed.indexOf(state.activeRowIndex));
    status.textContent = `${position + 1} / ${changed.length}`;
    previous.disabled = changed.length < 2;
    next.disabled = changed.length < 2;
  }

  function selectDiff(index, scroll = true) {
    const row = state.comparison.rows[index];
    if (!row || row.kind === 'same') return;
    state.activeRowIndex = index;
    $$('.diff-row').forEach((node) => node.classList.toggle('is-active', Number(node.dataset.diffRow) === index));
    renderDiffNavigation();
    if (scroll) $(`[data-diff-row="${index}"]`)?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  function moveDiff(direction) {
    const changed = changedIndexes();
    if (!changed.length) return;
    const current = changed.indexOf(state.activeRowIndex);
    const position = current < 0 ? 0 : (current + direction + changed.length) % changed.length;
    selectDiff(changed[position]);
  }

  function updateWorkflowVisibility() {
    const empty = !state.before.trim() && !state.after.trim();
    $('#workflowStrip').hidden = !empty;
    document.body.dataset.workspaceState = empty ? 'empty' : state.mode;
  }

  function applyWorkspaceMode(mode) {
    document.body.dataset.workspaceMode = mode;
    document.body.classList.toggle('review-focus', mode === 'compare' && state.reviewFocus);
    $('.control-sidebar').dataset.workspaceMode = mode;
    $('.control-sidebar').setAttribute('aria-label', 'レビュー概要');
    $('#chatgptReviewButton').hidden = mode !== 'compare';
    $('#diffSummary').hidden = mode !== 'compare';
    $('#compareOptions').hidden = mode !== 'compare';
    $('#editModeButton').setAttribute('aria-pressed', String(mode === 'edit'));
    $('#compareModeButton').setAttribute('aria-pressed', String(mode === 'compare'));
    $('#reviewFocusButton').setAttribute('aria-pressed', String(mode === 'compare' && state.reviewFocus));
    $('#reviewFocusButton').textContent = state.reviewFocus ? '集中を終了' : '集中';
    updateWorkflowVisibility();
    updateSelectionToolbar();
  }

  function renderReviewSummary() {
    const summary = state.comparison.summary;
    [['diffTotal', 'changes'], ['diffReplace', 'replaces'], ['diffInsert', 'inserts'], ['diffDelete', 'deletes']].forEach(([id, key]) => {
      $(`#${id}`).textContent = summary[key];
    });
    const total = changedIndexes().length;
    const reviewed = reviewedCount();
    const remaining = Math.max(0, total - reviewed);
    $('#reviewOverview').textContent = !state.before || !state.after
      ? '左右に原稿を入力するとレビューできます。'
      : !total ? '変更はありません'
      : remaining ? `未確認 ${remaining}件` : 'すべて確認済み';
    $('#reviewSidebarProgress').textContent = `${reviewed} / ${total}`;
    $('#reviewDistribution').innerHTML = [['replace', 'replaces', '置換'], ['insert', 'inserts', '追加'], ['delete', 'deletes', '削除']].map(([kind, key, label]) =>
      `<div class="review-stat ${kind}"><span>${marker(kind)} ${label}</span><strong>${summary[key]}</strong><div class="review-bar"><span style="width:${summary.changes ? summary[key] / summary.changes * 100 : 0}%"></span></div></div>`
    ).join('');
  }

  function renderReviewProgress() {
    const total = changedIndexes().length;
    const reviewed = reviewedCount();
    const remaining = Math.max(0, total - reviewed);
    const target = $('#reviewProgress');
    target.classList.toggle('is-complete', total > 0 && remaining === 0);
    target.innerHTML = !total
      ? '<span>変更なし</span>'
      : remaining
        ? `<span><strong>${reviewed}</strong> / ${total} 確認</span>`
        : `<span><strong>✓ ${reviewed}</strong> / ${total} 確認完了</span>`;

    const preview = $('#finalPreviewButton');
    const previewReady = state.mode === 'compare' && Boolean(state.after) && total > 0 && remaining === 0;
    preview.hidden = !previewReady;
    preview.disabled = !previewReady;
    preview.classList.toggle('is-ready', previewReady);
    $('#reviewFocusButton').disabled = !total;

    const warning = $('#copyReviewWarning');
    if (warning) {
      warning.hidden = !remaining;
      warning.textContent = remaining ? `未確認の変更が${remaining}件あります。そのまま出力もできます。` : '';
    }
  }

  function renderDiffMap() {
    const map = $('#diffMap');
    const indexes = changedIndexes();
    const signature = indexes.map(index => {
      const row = state.comparison.rows[index];
      return `${index}:${row.kind}:${row.htmlChanged ? 1 : 0}`;
    }).join(',') + `/${state.comparison.rows.length}/${state.compareOptions.ignoreHtmlTags ? 1 : 0}`;
    if (map.dataset.signature !== signature) {
      map.dataset.signature = signature;
      map.innerHTML = indexes.map((index, position) => {
        const row = state.comparison.rows[index];
        const htmlOnly = !state.compareOptions.ignoreHtmlTags && row.htmlChanged && !row.textChanged;
        const kind = htmlOnly ? 'html' : row.kind;
        const label = htmlOnly ? 'HTML変更' : { replace: '置換', insert: '追加', delete: '削除' }[row.kind];
        return `<button type="button" class="diff-map-marker ${kind}" data-diff-index="${index}" style="top:${index / Math.max(1, state.comparison.rows.length) * 100}%" title="差分${position + 1}：${label}" aria-label="差分${position + 1}へ移動（${label}）">${htmlOnly ? '◇' : marker(row.kind)}</button>`;
      }).join('');
    }
    map.querySelectorAll('button').forEach((button) => {
      const index = Number(button.dataset.diffIndex);
      const row = state.comparison.rows[index];
      button.setAttribute('aria-current', String(index === state.activeRowIndex));
      button.classList.toggle('is-reviewed', Boolean(row && state.reviewedKeys.has(reviewKey(row))));
    });
  }

  function updateSelectionToolbar() {
    const editor = $('#workingText');
    const focus = document.activeElement;
    const relevant = focus === editor || $('#selectionToolbar').contains(focus);
    $('#selectionToolbar').hidden = state.mode !== 'edit' || !relevant || editor.selectionStart === editor.selectionEnd;
  }

  function closeMoreMenu(restoreFocus = false) {
    $('#moreMenu').hidden = true;
    $('#moreMenuButton').setAttribute('aria-expanded', 'false');
    if (restoreFocus) $('#moreMenuButton').focus();
  }

  function closePaneMenus(except = null) {
    $$('[data-pane-menu]').forEach((details) => {
      if (details !== except) details.open = false;
    });
  }

  function closeReviewMenu() {
    const menu = $('.review-menu');
    if (menu) menu.open = false;
  }

  function renderMode() {
    applyWorkspaceMode(state.mode);
    renderReviewSummary();
    const compare = state.mode === 'compare';
    $('#editModeButton').classList.toggle('is-active', !compare);
    $('#compareModeButton').classList.toggle('is-active', compare);
    $('#editorView').hidden = compare;
    $('#compareView').hidden = !compare;
    window.TextReviewChatGPT?.updateButtonState($('#chatgptReviewButton'), $('#baselineText'), $('#workingText'));
    if (compare) renderComparison();
  }

  function updateStatus() {
    updateWorkflowVisibility();
    const status = $('#analysisState');
    const summary = $('#toolbarSummary');
    $('#copyButton').disabled = !state.after;
    if (state.analyzing) {
      status.textContent = '差分を更新中…';
      summary.textContent = '入力内容を反映しています';
      return;
    }
    if (!state.before && !state.after) {
      status.textContent = '変更前と修正後を入力してください';
      summary.textContent = 'まず左右に原稿を貼ります';
      return;
    }
    if (!state.before) {
      status.textContent = '変更前を入力すると比較できます';
      summary.textContent = '右側だけでも編集・コピーできます';
      return;
    }
    if (!state.after) {
      status.textContent = '修正後を入力してください';
      summary.textContent = '右側へ修正後の原稿を貼ります';
      return;
    }
    const summaryValue = state.comparison.summary;
    status.textContent = summaryValue.changes ? `差分 ${summaryValue.changes}件` : '差分なし';
    summary.textContent = `置換 ${summaryValue.replaces}・追加 ${summaryValue.inserts}・削除 ${summaryValue.deletes}`;
  }

  function renderStats() {
    const before = textStats(state.before);
    const after = textStats(state.after);
    $('#baselineStats').textContent = `${before.chars.toLocaleString()}文字・${before.lines.toLocaleString()}行`;
    $('#workingStats').textContent = `${after.chars.toLocaleString()}文字・${after.lines.toLocaleString()}行`;
  }

  function renderUndo() {
    $('#undoButton').disabled = !state.undoStack.length && !typingBase;
    $('#redoButton').disabled = !state.redoStack.length;
  }

  function renderSearch() {
    $('#searchCount').textContent = state.search.query ? `${state.search.matches.length}件` : '検索語を入力';
    $('#searchPrev').disabled = !state.search.matches.length;
    $('#searchNext').disabled = !state.search.matches.length;
  }

  function renderDisplayStateSummary() {
    const target = $('#displayStateSummary');
    if (!target) return;
    const compareLabel = state.compareOptions.ignoreHtmlTags ? '本文のみ' : 'HTMLも比較';
    const tagLabel = state.displayOptions.showTags ? 'タグ表示' : 'タグ非表示';
    target.innerHTML = `<button type="button" data-action="open-display" title="比較と表示の設定を変更"><span>${escapeHTML(compareLabel)}</span><span>${escapeHTML(tagLabel)}</span></button>`;
  }

  function syncDisplayControls() {
    $('#ignoreHtmlTagsToggle').checked = state.compareOptions.ignoreHtmlTags;
    $('#displayShowTags').checked = state.displayOptions.showTags;
    $('#displayWhitespace').checked = state.displayOptions.showWhitespace;
    $('#displayUrls').checked = state.displayOptions.highlightUrls;
  }

  function renderAll() {
    renderMode();
    updateStatus();
    renderStats();
    renderUndo();
    renderSearch();
    renderReviewProgress();
    renderDisplayStateSummary();
    syncDisplayControls();
  }

  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function setMode(mode) {
    state.mode = mode === 'compare' ? 'compare' : 'edit';
    if (state.mode === 'compare') calculateComparison();
    else state.reviewFocus = false;
    renderAll();
    persist();
  }

  function toggleReviewFocus() {
    if (state.mode !== 'compare') return;
    state.reviewFocus = !state.reviewFocus;
    renderAll();
    if (state.reviewFocus && state.activeRowIndex >= 0) {
      requestAnimationFrame(() => $('[data-diff-row="' + state.activeRowIndex + '"]')?.scrollIntoView({ block: 'center' }));
    }
  }

  function loadSample() {
    if ((state.before || state.after) && !window.confirm('現在の入力内容をサンプルテキストで上書きしますか？')) return;
    commit(() => {
      state.before = SAMPLE.before;
      state.after = SAMPLE.after;
      state.mode = 'compare';
      state.activeRowIndex = -1;
    }, 'サンプルテキストを入れました');
  }

  async function pasteInto(side) {
    try {
      const text = await navigator.clipboard.readText();
      commit(() => { state[side] = text; }, side === 'before' ? '変更前へ貼り付けました' : '修正後へ貼り付けました');
    } catch (_) {
      notify('自動で貼り付けられませんでした。入力欄で通常の貼り付けをご利用ください');
    }
  }

  function clearSide(side) {
    if (!state[side]) return;
    if (!window.confirm(side === 'before' ? '変更前の原稿を消去しますか？' : '修正後の原稿を消去しますか？')) return;
    commit(() => { state[side] = ''; }, '原稿を消去しました');
  }

  function protectedTransform(text, transform) {
    const tokens = [];
    const safe = String(text).replace(/https?:\/\/[^\s<]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|<[^>]*>/g, (match) => {
      const token = `\uE000TRS${tokens.length}\uE001`;
      tokens.push(match);
      return token;
    });
    const changed = transform(safe);
    return tokens.reduce((output, token, index) => output.replaceAll(`\uE000TRS${index}\uE001`, token), changed);
  }

  function runTransform(kind) {
    let next = state.after;
    let label = '';
    if (!next) { notify('修正後の原稿を入力してください'); return; }
    if (kind === 'space') {
      label = '空白を整理しました';
      next = protectedTransform(next, (text) => text.replace(/　/g, ' ').replace(/ {2,}/g, ' ').replace(/[ \t]+(?=\n|$)/g, ''));
    }
    if (kind === 'symbol') {
      label = '記号を統一しました';
      next = protectedTransform(next, (text) => text.replace(/！/g, '!').replace(/？/g, '?').replace(/（/g, '(').replace(/）/g, ')'));
    }
    if (kind === 'notation') {
      label = '表記を統一しました';
      next = protectedTransform(next, (text) => text.replace(/様々/g, 'さまざま').replace(/予め/g, 'あらかじめ').replace(/精一杯/g, '精いっぱい').replace(/宜しくお願いします/g, 'よろしくお願いします'));
    }
    if (kind === 'newline') {
      label = '空行を整理しました';
      next = next.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
    }
    if (next === state.after) { notify('変更対象はありません'); return; }
    commit(() => { state.after = next; }, label);
  }

  function wrapSelection(kind) {
    const editor = $('#workingText');
    const tag = TAGS[kind];
    if (!tag) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const open = tag[0];
    const close = tag[1];
    const selected = editor.value.slice(start, end);
    if (kind === 'hr') {
      const prefix = start > 0 && editor.value[start - 1] !== '\n' ? '\n' : '';
      const suffix = start < editor.value.length && editor.value[start] !== '\n' ? '\n' : '';
      const insert = `${prefix}${open}${suffix}`;
      commit(() => { state.after = `${editor.value.slice(0, start)}${insert}${editor.value.slice(start)}`; });
      requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(start + insert.length, start + insert.length); });
      return;
    }
    if (!selected) { notify('タグを付ける文字を修正後から選択してください'); return; }
    const replacement = `${open}${selected}${close}`;
    commit(() => { state.after = `${editor.value.slice(0, start)}${replacement}${editor.value.slice(end)}`; }, 'タグを追加しました');
    requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(start, start + replacement.length); });
  }

  function computeSearch() {
    const query = state.search.query;
    const matches = [];
    if (query) {
      let position = 0;
      while (position <= state.after.length) {
        const found = state.after.indexOf(query, position);
        if (found < 0) break;
        matches.push(found);
        position = found + Math.max(query.length, 1);
      }
    }
    state.search.matches = matches;
    state.search.current = matches.length ? 0 : -1;
    renderSearch();
  }

  function moveSearch(direction) {
    if (!state.search.matches.length) { notify('該当はありません'); return; }
    state.search.current = (state.search.current + direction + state.search.matches.length) % state.search.matches.length;
    const start = state.search.matches[state.search.current];
    setMode('edit');
    requestAnimationFrame(() => {
      const editor = $('#workingText');
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(start, start + state.search.query.length);
      const line = state.after.slice(0, start).split('\n').length;
      editor.scrollTop = Math.max(0, (line - 4) * 29);
    });
  }

  function openDisplayDialog() {
    $('#ignoreHtmlTagsToggle').checked = state.compareOptions.ignoreHtmlTags;
    $('#displayShowTags').checked = state.displayOptions.showTags;
    $('#displayWhitespace').checked = state.displayOptions.showWhitespace;
    $('#displayUrls').checked = state.displayOptions.highlightUrls;
    $('#displayDialog').showModal();
  }

  function applyDisplay() {
    state.compareOptions.ignoreHtmlTags = $('#ignoreHtmlTagsToggle').checked;
    state.displayOptions = {
      showTags: $('#displayShowTags').checked,
      showWhitespace: $('#displayWhitespace').checked,
      highlightUrls: $('#displayUrls').checked
    };
    // Read the complete configuration first, then recalculate once.
    calculateComparison();
    $('#displayDialog').close();
    renderAll();
    persist();
    notify('比較・表示設定を反映しました');
  }

  function openFinalPreview() {
    if (!state.after) {
      notify('修正後の原稿を入力してください');
      return;
    }
    const total = changedIndexes().length;
    const reviewed = reviewedCount();
    const remaining = Math.max(0, total - reviewed);
    $('#finalPreviewStatus').textContent = !total
      ? '変更はありません。最終稿を通して確認できます。'
      : remaining
        ? `未確認の変更が${remaining}件あります。差分色を外した最終稿として読めます。`
        : `✓ ${reviewed}件の変更をすべて確認済みです。`;
    $('#finalPreviewText').textContent = decodeEntities(stripTags(state.after));
    $('#finalPreviewDialog').showModal();
  }

  function closeFinalPreview() {
    if ($('#finalPreviewDialog').open) $('#finalPreviewDialog').close();
  }

  function stripTags(value) {
    return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, '');
  }

  function decodeEntities(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value || '');
    return textarea.value;
  }

  function reportText() {
    const summary = state.comparison.summary;
    const lines = ['差分確認', `置換 ${summary.replaces}件／追加 ${summary.inserts}件／削除 ${summary.deletes}件`, ''];
    state.comparison.rows.filter((row) => row.kind !== 'same').forEach((row, index) => {
      const htmlOnly = !state.compareOptions.ignoreHtmlTags && row.htmlChanged && !row.textChanged;
      const prefix = htmlOnly ? '◇ HTML' : marker(row.kind);
      lines.push(`${index + 1}. ${prefix} ${row.before ? row.before.trim() : '（なし）'} → ${row.after ? row.after.trim() : '（なし）'}`);
    });
    return lines.join('\n');
  }

  async function copyText(kind) {
    const values = {
      plain: decodeEntities(stripTags(state.after)),
      html: state.after,
      report: reportText()
    };
    const labels = { plain: 'CMS本文', html: 'HTML', report: '差分確認記録' };
    const value = values[kind] || '';
    if (!value) { notify('コピーできる内容がありません'); return; }
    try {
      await navigator.clipboard.writeText(value);
    } catch (_) {
      const field = document.createElement('textarea');
      field.value = value;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    closeCopyMenu();
    notify(`${labels[kind]}をコピーしました`);
  }

  function closeCopyMenu() {
    $('#copyMenu').hidden = true;
    $('#copyButton').setAttribute('aria-expanded', 'false');
  }

  function toggleCopyMenu() {
    if ($('#copyButton').disabled) return;
    const menu = $('#copyMenu');
    menu.hidden = !menu.hidden;
    $('#copyButton').setAttribute('aria-expanded', String(!menu.hidden));
  }

  function bind() {
    const mobile = window.matchMedia('(max-width: 767px)');
    $('#otherEditTools').open = false;
    const syncOtherTools = () => {
      if (mobile.matches) closePaneMenus();
    };
    syncOtherTools();
    mobile.addEventListener('change', syncOtherTools);
    document.addEventListener('selectionchange', updateSelectionToolbar);
    document.addEventListener('focusin', updateSelectionToolbar);
    $('#workingText').addEventListener('select', updateSelectionToolbar);
    $('#workingText').addEventListener('input', updateSelectionToolbar);
    $$('[data-pane-menu]').forEach((details) => {
      details.addEventListener('toggle', () => {
        if (details.open) closePaneMenus(details);
      });
    });
    $('#moreMenuButton').addEventListener('click', () => {
      const opening = $('#moreMenu').hidden;
      $('#moreMenu').hidden = !opening;
      $('#moreMenuButton').setAttribute('aria-expanded', String(opening));
      if (opening) $('#moreMenu button').focus();
    });
    document.addEventListener('focusin', event => {
      if (!event.target.closest('.more-menu-wrap')) closeMoreMenu();
    });
    // Capture runs before clear-all's own handler; closing does not cancel its action.
    document.addEventListener('click', event => {
      if (!event.target.closest('.more-menu-wrap') || event.target.closest('[data-clear-all]')) closeMoreMenu();
      if (!event.target.closest('[data-pane-menu]')) closePaneMenus();
      if (!event.target.closest('.review-menu')) closeReviewMenu();
    }, true);

    $('#baselineText').addEventListener('input', (event) => {
      beginTyping();
      state.before = event.target.value;
      scheduleComparison();
      renderStats();
      updateStatus();
    });
    $('#workingText').addEventListener('input', (event) => {
      beginTyping();
      state.after = event.target.value;
      scheduleComparison();
      renderStats();
      updateStatus();
      computeSearch();
    });
    $('#searchInput').addEventListener('input', (event) => {
      state.search.query = event.target.value;
      computeSearch();
    });

    document.addEventListener('click', (event) => {
      const reviewButton = event.target.closest('[data-review-index]');
      if (reviewButton) {
        toggleReviewed(Number(reviewButton.dataset.reviewIndex));
        return;
      }
      const expandSame = event.target.closest('[data-expand-same]');
      if (expandSame) {
        state.expandedSameRuns.add(expandSame.dataset.expandSame);
        renderComparison();
        return;
      }
      const htmlButton = event.target.closest('[data-html-diff-index]');
      if (htmlButton) {
        const index = Number(htmlButton.dataset.htmlDiffIndex);
        selectDiff(index, false);
        toggleHtmlDetail(index);
        return;
      }
      const diffButton = event.target.closest('[data-diff-index]');
      if (diffButton) { selectDiff(Number(diffButton.dataset.diffIndex)); return; }
      const tagButton = event.target.closest('[data-tag]');
      if (tagButton) { wrapSelection(tagButton.dataset.tag); return; }
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) {
        if (!event.target.closest('.copy-wrap')) closeCopyMenu();
        return;
      }
      const actions = {
        undo,
        redo,
        'mode-edit': () => setMode('edit'),
        'mode-compare': () => setMode('compare'),
        'load-sample': loadSample,
        'paste-before': () => pasteInto('before'),
        'paste-after': () => pasteInto('after'),
        'clear-before': () => clearSide('before'),
        'clear-after': () => clearSide('after'),
        'transform-space': () => runTransform('space'),
        'transform-symbol': () => runTransform('symbol'),
        'transform-notation': () => runTransform('notation'),
        'transform-newline': () => runTransform('newline'),
        'search-prev': () => moveSearch(-1),
        'search-next': () => moveSearch(1),
        'search-clear': () => { state.search.query = ''; $('#searchInput').value = ''; computeSearch(); },
        'diff-prev': () => moveDiff(-1),
        'diff-next': () => moveDiff(1),
        'review-next-unreviewed': moveNextUnreviewed,
        'toggle-review-focus': toggleReviewFocus,
        'open-final-preview': openFinalPreview,
        'close-final-preview': closeFinalPreview,
        'open-display': openDisplayDialog,
        'close-display': () => $('#displayDialog').close(),
        'apply-display': applyDisplay,
        'toggle-copy-menu': toggleCopyMenu,
        'copy-plain': () => copyText('plain'),
        'copy-html': () => copyText('html'),
        'copy-report': () => copyText('report')
      };
      if (actions[action]) {
        event.preventDefault();
        actions[action]();
      }
    });

    $('#displayDialog').addEventListener('close', () => {
      $('#ignoreHtmlTagsToggle').checked = state.compareOptions.ignoreHtmlTags;
    });
    $('#displayDialog').addEventListener('click', (event) => {
      if (event.target === $('#displayDialog')) $('#displayDialog').close();
    });
    $('#finalPreviewDialog').addEventListener('click', (event) => {
      if (event.target === $('#finalPreviewDialog')) closeFinalPreview();
    });
    document.addEventListener('keydown', (event) => {
      const editing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement || event.target.isContentEditable;
      if (event.key === 'Escape') {
        closeCopyMenu();
        if (!$('#moreMenu').hidden) closeMoreMenu(true);
        closePaneMenus();
        closeReviewMenu();
        if ($('#displayDialog').open) $('#displayDialog').close();
        if ($('#finalPreviewDialog').open) closeFinalPreview();
      }
      if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if (!editing && !event.isComposing && !document.querySelector('dialog[open]') && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && state.mode === 'compare') {
        if (event.key.toLowerCase() === 'j') { event.preventDefault(); moveDiff(1); }
        if (event.key.toLowerCase() === 'k') { event.preventDefault(); moveDiff(-1); }
        if (event.key.toLowerCase() === 'v' && state.activeRowIndex >= 0) { event.preventDefault(); toggleReviewed(state.activeRowIndex); }
      }
      if (!editing && state.mode === 'compare' && event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); moveDiff(-1); }
      if (!editing && state.mode === 'compare' && event.altKey && event.key === 'ArrowRight') { event.preventDefault(); moveDiff(1); }
    });
  }

  function boot() {
    if (!assertDomContract()) return;
    hydrate();
    syncEditors();
    calculateComparison();
    bind();
    renderAll();
  }

  window.TextReviewApp = {
    getComparison() {
      return {
        before: state.before,
        after: state.after,
        rows: state.comparison.rows,
        summary: { ...state.comparison.summary }
      };
    },
    getState() { return JSON.parse(snapshotData()); },
    recalculate() { calculateComparison(); renderAll(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
