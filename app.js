(() => {
  'use strict';

  const Diff = window.TextReviewDiffCore;
  if (!Diff) {
    document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">diff-core.js を読み込めませんでした。</p>';
    return;
  }

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const RULES = [
    { id: 'safe-space', label: '連続する半角スペースを1つに統一', pattern: / {2,}/g, replacement: ' ', mode: 'auto', category: '空白・改行' },
    { id: 'safe-trailing', label: '行末の空白を削除', pattern: /[ \t]+(?=\n|$)/g, replacement: '', mode: 'auto', category: '空白・改行' },
    { id: 'style-paren-l', label: '全角の左かっこを半角に統一', pattern: /（/g, replacement: '(', mode: 'review', category: '記号' },
    { id: 'style-paren-r', label: '全角の右かっこを半角に統一', pattern: /）/g, replacement: ')', mode: 'review', category: '記号' },
    { id: 'style-exclamation', label: '全角感嘆符を半角に統一', pattern: /！/g, replacement: '!', mode: 'review', category: '記号' },
    { id: 'style-nyudan', label: '入団を加入に統一', pattern: /入団/g, replacement: '加入', mode: 'review', category: '社内用語' },
    { id: 'style-yoroshiku', label: '宜しくお願いしますをよろしくお願いしますに統一', pattern: /宜しくお願いします/g, replacement: 'よろしくお願いします', mode: 'review', category: '表記統一' },
    { id: 'style-itashimasu', label: '致すをいたすに統一', pattern: /致す/g, replacement: 'いたす', mode: 'review', category: '表記統一' },
    { id: 'style-arakajime', label: '予めをあらかじめに統一', pattern: /予め/g, replacement: 'あらかじめ', mode: 'review', category: '表記統一' },
    { id: 'style-samazama', label: '様々をさまざまに統一', pattern: /様々/g, replacement: 'さまざま', mode: 'review', category: '表記統一' },
    { id: 'style-seiippai', label: '精一杯を精いっぱいに統一', pattern: /精一杯/g, replacement: '精いっぱい', mode: 'review', category: '表記統一' },
    { id: 'style-month', label: 'か月／ヶ月をヵ月に統一', pattern: /([0-9０-９]+)(か月|ヶ月)/g, replacement: '$1ヵ月', mode: 'review', category: '数字・単位' }
  ];

  const state = {
    title: '名称未設定の原稿',
    working: '',
    baseline: '',
    normDecisions: {},
    labelDecisions: {},
    manualReviews: {},
    existingTagMode: 'keep',
    labelDefault: 'tag',
    filter: 'pending',
    activeId: null,
    outputTab: 'plain',
    derived: null,
    analyzing: false,
    debounceTimer: null,
    history: [],
    future: []
  };

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const truncate = (value = '', max = 34) => {
    const text = String(value).replace(/\n/g, '↵');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text || '（なし）';
  };

  const cleanContext = (text = '') => text.replace(/\n/g, '\n');

  function textStats(text) {
    const source = String(text || '');
    return {
      chars: [...source].length,
      lines: source ? source.split('\n').length : 0,
      urls: (source.match(/https?:\/\/[^\s<]+/g) || []).length,
      tags: (source.match(/<[^>]*>/g) || []).length
    };
  }

  function protectedRanges(text) {
    const ranges = [];
    const pattern = /https?:\/\/[^\s<]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|<[^>]*>/g;
    let match;
    while ((match = pattern.exec(text))) {
      ranges.push([match.index, match.index + match[0].length]);
    }
    return ranges;
  }

  function overlaps(start, end, ranges) {
    return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart);
  }

  function rangeContext(text, start, end, radius = 52) {
    return String(text).slice(Math.max(0, start - radius), Math.min(text.length, end + radius));
  }

  function classifyTextSeverity(before, after) {
    const combined = `${before}${after}`;
    if (/(https?:\/\/|www\.|@[\w.-]+\.|<\/?[A-Za-z][^>]*>|[0-9０-９]+\s*(年|月|日|時|分|円|%|％))/i.test(combined)) return 'critical';
    if (/^[\s\n\r\t、。,.!！?？()（）\[\]【】「」『』]+$/u.test(combined)) return 'minor';
    return 'normal';
  }

  function candidateId(kind, ...parts) {
    return `${kind}:${parts.map(value => encodeURIComponent(String(value))).join(':')}`;
  }

  function makeNormalizationCandidates(text) {
    const candidates = [];
    const protectedAreas = protectedRanges(text);

    for (const rule of RULES) {
      const scan = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`);
      const replaceOne = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', ''));
      let match;
      let occurrence = 0;

      while ((match = scan.exec(text))) {
        if (!match[0]) {
          scan.lastIndex += 1;
          continue;
        }
        const before = match[0];
        const after = before.replace(replaceOne, rule.replacement);
        if (!overlaps(match.index, match.index + before.length, protectedAreas)) {
          const id = candidateId('norm', rule.id, match.index, before, after, occurrence);
          candidates.push({
            id,
            type: 'normalize',
            ruleId: rule.id,
            category: rule.category,
            label: rule.label,
            mode: rule.mode,
            before,
            after,
            start: match.index,
            end: match.index + before.length,
            severity: classifyTextSeverity(before, after),
            context: rangeContext(text, match.index, match.index + before.length)
          });
        }
        occurrence += 1;
      }
    }
    return candidates;
  }

  function applyAcceptedNormalizations(text, candidates) {
    let output = String(text);
    const accepted = candidates
      .filter(candidate => (state.normDecisions[candidate.id] || (candidate.mode === 'auto' ? 'accepted' : 'pending')) === 'accepted')
      .sort((a, b) => b.start - a.start);

    for (const candidate of accepted) {
      if (output.slice(candidate.start, candidate.end) === candidate.before) {
        output = `${output.slice(0, candidate.start)}${candidate.after}${output.slice(candidate.end)}`;
      }
    }
    return output;
  }

  function makeLabelCandidates(text) {
    const candidates = [];
    let offset = 0;
    const lines = String(text).split('\n');

    lines.forEach((line, index) => {
      const match = line.match(/^([ \t]*)【([^\n】]{1,40})】([ \t]*)$/);
      if (match) {
        const before = line;
        const id = candidateId('label', index, offset, before, match[2]);
        candidates.push({
          id,
          type: 'label',
          category: 'HTMLラベル',
          label: '【ラベル】の扱い',
          before,
          after: `<span class="info24-label">${escapeHTML(match[2])}</span>`,
          line: index + 1,
          start: offset,
          end: offset + line.length,
          leading: match[1],
          value: match[2],
          trailing: match[3],
          severity: 'normal',
          context: `${index + 1}行目：${line}`
        });
      }
      offset += line.length + 1;
    });
    return candidates;
  }

  function effectiveLabelAction(candidate) {
    return state.labelDecisions[candidate.id] || state.labelDefault;
  }

  function applyLabels(text, candidates, outputKind) {
    let output = String(text);
    const sorted = [...candidates].sort((a, b) => b.start - a.start);

    for (const candidate of sorted) {
      let action = effectiveLabelAction(candidate);
      if (outputKind === 'plain' && action === 'tag') action = 'plain';

      if (output.slice(candidate.start, candidate.end) !== candidate.before) continue;
      let replacement = candidate.before;
      if (action === 'tag') replacement = `${candidate.leading}<span class="info24-label">${escapeHTML(candidate.value)}</span>${candidate.trailing}`;
      if (action === 'plain') replacement = `${candidate.leading}${candidate.value}${candidate.trailing}`;
      output = `${output.slice(0, candidate.start)}${replacement}${output.slice(candidate.end)}`;
    }
    return output;
  }

  function stripExistingTagsKeepingGenerated(text) {
    const placeholders = [];
    const held = String(text).replace(/<span class="info24-label">[\s\S]*?<\/span>/g, (match) => {
      const marker = `___TRS_GENERATED_LABEL_${placeholders.length}___`;
      placeholders.push(match);
      return marker;
    });
    let stripped = held.replace(/<[^>]*>/g, '');
    placeholders.forEach((value, index) => {
      stripped = stripped.replace(`___TRS_GENERATED_LABEL_${index}___`, value);
    });
    return stripped;
  }

  function safePreviewHTML(html) {
    let safe = escapeHTML(html);
    safe = safe.replace(
      /&lt;span class=&quot;info24-label&quot;&gt;([\s\S]*?)&lt;\/span&gt;/g,
      '<span class="info24-label">$1</span>'
    );
    return safe.replace(/\n/g, '<br>');
  }

  function derive() {
    const manualDiff = state.baseline
      ? Diff.diffText(state.baseline, state.working)
      : { parts: [], hunks: [] };

    const normalizationCandidates = makeNormalizationCandidates(state.working);
    const normalizedText = applyAcceptedNormalizations(state.working, normalizationCandidates);
    const labelCandidates = makeLabelCandidates(normalizedText);
    const labelledForHtml = applyLabels(normalizedText, labelCandidates, 'html');
    const htmlOutput = state.existingTagMode === 'strip'
      ? stripExistingTagsKeepingGenerated(labelledForHtml)
      : labelledForHtml;
    const plainOutput = applyLabels(normalizedText, labelCandidates, 'plain').replace(/<[^>]*>/g, '');

    const manualCandidates = manualDiff.hunks.map((hunk, index) => ({
      id: `manual:${hunk.id}`,
      sourceId: hunk.id,
      type: 'manual',
      category: '手動修正',
      label: '原文と修正文の差分',
      order: index + 1,
      before: hunk.before,
      after: hunk.after,
      start: hunk.afterStart,
      end: hunk.afterEnd,
      severity: hunk.severity,
      context: rangeContext(state.working, hunk.afterStart, hunk.afterEnd || hunk.afterStart)
    }));

    return {
      manualDiff,
      normalizationCandidates,
      normalizedText,
      labelCandidates,
      htmlOutput,
      plainOutput,
      manualCandidates
    };
  }

  function candidateStatus(candidate) {
    if (candidate.type === 'manual') return state.manualReviews[candidate.sourceId] === 'reviewed' ? 'done' : 'pending';
    if (candidate.type === 'normalize') {
      const decision = state.normDecisions[candidate.id] || (candidate.mode === 'auto' ? 'accepted' : 'pending');
      return decision === 'pending' ? 'pending' : 'done';
    }
    if (candidate.type === 'label') return state.labelDecisions[candidate.id] ? 'done' : 'pending';
    return 'pending';
  }

  function candidateStatusText(candidate) {
    if (candidate.type === 'manual') return candidateStatus(candidate) === 'done' ? '確認済み' : '未確認';
    if (candidate.type === 'normalize') {
      const decision = state.normDecisions[candidate.id] || (candidate.mode === 'auto' ? 'accepted' : 'pending');
      if (decision === 'accepted') return candidate.mode === 'auto' ? '自動適用' : '採用';
      if (decision === 'skipped') return '除外';
      return '未確認';
    }
    if (candidate.type === 'label') {
      const decision = state.labelDecisions[candidate.id];
      if (decision === 'tag') return 'タグ化';
      if (decision === 'plain') return 'かっこなし';
      if (decision === 'keep') return 'そのまま';
      return '未確認';
    }
    return '';
  }

  function allCandidates() {
    const raw = [
      ...(state.derived?.manualCandidates || []),
      ...(state.derived?.normalizationCandidates || []),
      ...(state.derived?.labelCandidates || [])
    ];
    const severityRank = { critical: 0, normal: 1, minor: 2 };
    const typeRank = { manual: 0, normalize: 1, label: 2 };
    return raw.sort((a, b) => {
      const severityDiff = severityRank[a.severity] - severityRank[b.severity];
      if (severityDiff) return severityDiff;
      const statusDiff = (candidateStatus(a) === 'pending' ? 0 : 1) - (candidateStatus(b) === 'pending' ? 0 : 1);
      if (statusDiff) return statusDiff;
      return typeRank[a.type] - typeRank[b.type];
    });
  }

  function getCandidate(id) {
    return allCandidates().find(candidate => candidate.id === id) || null;
  }

  function filterCandidates(candidates) {
    if (state.filter === 'all') return candidates;
    if (state.filter === 'critical') return candidates.filter(candidate => candidate.severity === 'critical');
    if (state.filter === 'done') return candidates.filter(candidate => candidateStatus(candidate) === 'done');
    return candidates.filter(candidate => candidateStatus(candidate) === 'pending');
  }

  function ensureActiveCandidate() {
    const candidates = allCandidates();
    if (!candidates.length) {
      state.activeId = null;
      return;
    }
    if (!candidates.some(candidate => candidate.id === state.activeId)) {
      state.activeId = candidates.find(candidate => candidateStatus(candidate) === 'pending')?.id || candidates[0].id;
    }
  }

  function snapshot() {
    return JSON.stringify({
      normDecisions: state.normDecisions,
      labelDecisions: state.labelDecisions,
      manualReviews: state.manualReviews,
      existingTagMode: state.existingTagMode,
      labelDefault: state.labelDefault
    });
  }

  function commitHistory() {
    state.history.push(snapshot());
    if (state.history.length > 60) state.history.shift();
    state.future = [];
  }

  function restoreSnapshot(json) {
    const restored = JSON.parse(json);
    state.normDecisions = restored.normDecisions || {};
    state.labelDecisions = restored.labelDecisions || {};
    state.manualReviews = restored.manualReviews || {};
    state.existingTagMode = restored.existingTagMode || 'keep';
    state.labelDefault = restored.labelDefault || 'tag';
  }

  function undo() {
    if (!state.history.length) return;
    state.future.push(snapshot());
    restoreSnapshot(state.history.pop());
    renderAll();
    notify('直前の判断を元に戻しました');
  }

  function redo() {
    if (!state.future.length) return;
    state.history.push(snapshot());
    restoreSnapshot(state.future.pop());
    renderAll();
    notify('やり直しました');
  }

  function renderMeta() {
    const stats = textStats(state.working);
    $('#workingStats').textContent = `${stats.chars.toLocaleString()}文字・${stats.lines.toLocaleString()}行`;
    $('#workingMeta').textContent = `URL ${stats.urls}件・HTMLタグ ${stats.tags}件`;
    $('#analysisState').textContent = state.analyzing
      ? '確認内容を更新中…'
      : state.working ? '確認内容は最新' : '入力待ち';
  }

  function renderTagSettings() {
    $$('#tagSettings [data-action="set-existing-tags"]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.value === state.existingTagMode);
    });
    $$('#tagSettings [data-action="set-label-default"]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.value === state.labelDefault);
    });
  }

  function renderSummary() {
    const candidates = allCandidates();
    const critical = candidates.filter(candidate => candidate.severity === 'critical' && candidateStatus(candidate) === 'pending').length;
    const pending = candidates.filter(candidate => candidateStatus(candidate) === 'pending').length;
    const done = candidates.filter(candidate => candidateStatus(candidate) === 'done').length;
    $('#reviewSummary').innerHTML = `
      <div class="summary-tile critical"><strong>${critical}</strong><span>重要</span></div>
      <div class="summary-tile pending"><strong>${pending}</strong><span>未確認</span></div>
      <div class="summary-tile done"><strong>${done}</strong><span>完了</span></div>
    `;
  }

  function kindText(candidate) {
    if (candidate.type === 'manual') return '差分';
    if (candidate.type === 'normalize') return '表記';
    return 'タグ';
  }

  function candidateTitle(candidate) {
    if (candidate.type === 'manual') {
      if (!candidate.before) return `追加：${truncate(candidate.after)}`;
      if (!candidate.after) return `削除：${truncate(candidate.before)}`;
      return `${truncate(candidate.before)} → ${truncate(candidate.after)}`;
    }
    if (candidate.type === 'normalize') return `${truncate(candidate.before)} → ${truncate(candidate.after)}`;
    return `【${truncate(candidate.value, 28)}】`;
  }

  function candidateSubtext(candidate) {
    if (candidate.type === 'manual') return `変更 ${candidate.order} ・ ${candidate.label}`;
    if (candidate.type === 'normalize') return `${candidate.category} ・ ${candidate.label}`;
    return `${candidate.line}行目 ・ 初期方針：${labelActionText(state.labelDefault)}`;
  }

  function renderCandidateList() {
    const all = allCandidates();
    const candidates = filterCandidates(all);
    const container = $('#candidateList');

    $$('.filter-tabs button').forEach(button => button.classList.toggle('is-active', button.dataset.filter === state.filter));

    if (!all.length) {
      container.innerHTML = '<p class="empty-list">原稿を入力すると、ここに確認が必要なことだけが並びます。</p>';
      return;
    }
    if (!candidates.length) {
      const label = state.filter === 'pending' ? '未確認の項目はありません。' : 'この条件に合う項目はありません。';
      container.innerHTML = `<p class="empty-list">${label}</p>`;
      return;
    }

    container.innerHTML = candidates.map(candidate => {
      const status = candidateStatus(candidate);
      const statusText = candidateStatusText(candidate);
      const isCritical = candidate.severity === 'critical';
      return `
        <button class="candidate-row ${candidate.id === state.activeId ? 'is-selected' : ''}" data-action="select-candidate" data-candidate-id="${escapeHTML(candidate.id)}">
          <span class="row-top">
            <span class="row-kind ${candidate.type}">${kindText(candidate)}</span>
            ${isCritical ? '<span class="row-status critical">重要</span>' : ''}
            <span class="row-status ${status === 'done' ? 'done' : ''}">${escapeHTML(statusText)}</span>
          </span>
          <strong>${escapeHTML(candidateTitle(candidate))}</strong>
          <small>${escapeHTML(candidateSubtext(candidate))}</small>
        </button>
      `;
    }).join('');
  }

  function labelActionText(action) {
    return ({ tag: 'タグにする', plain: 'かっこを外す', keep: 'そのまま' }[action] || '未確認');
  }

  function renderCandidateDetail() {
    const candidate = getCandidate(state.activeId);
    const detail = $('#candidateDetail');
    if (!candidate) {
      detail.innerHTML = '<p class="detail-empty">右側の候補を選ぶと、変更前後と判断ボタンがここに出ます。</p>';
      return;
    }

    const status = candidateStatus(candidate);
    const detailHeader = `
      <div class="detail-title">
        <span class="detail-label">${escapeHTML(kindText(candidate))}</span>
        <strong>${escapeHTML(candidate.label)}</strong>
        <span class="detail-location">${candidate.type === 'label' ? `${candidate.line}行目` : candidate.type === 'manual' ? `変更 ${candidate.order}` : `${candidate.start + 1}文字目`}</span>
      </div>
    `;

    let change = '';
    let actions = '';

    if (candidate.type === 'manual') {
      change = `
        <div class="focus-diff">
          <div><label>変更前</label><span class="focus-before">${escapeHTML(candidate.before || '（追加）')}</span></div>
          <div><label>変更後</label><span class="focus-after">${escapeHTML(candidate.after || '（削除）')}</span></div>
        </div>
      `;
      actions = status === 'done'
        ? `<button data-action="set-manual" data-value="pending" data-candidate-id="${escapeHTML(candidate.id)}">未確認に戻す</button>`
        : `<button class="accept" data-action="set-manual" data-value="reviewed" data-candidate-id="${escapeHTML(candidate.id)}">確認済みにする</button>`;
    }

    if (candidate.type === 'normalize') {
      change = `
        <div class="focus-diff">
          <div><label>変更前</label><span class="focus-before">${escapeHTML(candidate.before)}</span></div>
          <div><label>変更後</label><span class="focus-after">${escapeHTML(candidate.after)}</span></div>
        </div>
      `;
      const decision = state.normDecisions[candidate.id] || (candidate.mode === 'auto' ? 'accepted' : 'pending');
      actions = `
        <button class="accept ${decision === 'accepted' ? 'active-choice' : ''}" data-action="set-normalize" data-value="accepted" data-candidate-id="${escapeHTML(candidate.id)}">採用</button>
        <button class="skip ${decision === 'skipped' ? 'active-choice' : ''}" data-action="set-normalize" data-value="skipped" data-candidate-id="${escapeHTML(candidate.id)}">除外</button>
      `;
    }

    if (candidate.type === 'label') {
      const selected = state.labelDecisions[candidate.id] || '';
      change = `
        <div class="focus-diff">
          <div><label>対象</label><span class="focus-before" style="text-decoration:none">${escapeHTML(candidate.before)}</span></div>
          <div><label>タグ化</label><span class="focus-after">${escapeHTML(candidate.after)}</span></div>
        </div>
      `;
      actions = `
        <button class="tag ${selected === 'tag' ? 'active-choice' : ''}" data-action="set-label" data-value="tag" data-candidate-id="${escapeHTML(candidate.id)}">タグにする</button>
        <button class="accept ${selected === 'plain' ? 'active-choice' : ''}" data-action="set-label" data-value="plain" data-candidate-id="${escapeHTML(candidate.id)}">かっこを外す</button>
        <button class="skip ${selected === 'keep' ? 'active-choice' : ''}" data-action="set-label" data-value="keep" data-candidate-id="${escapeHTML(candidate.id)}">そのまま</button>
      `;
    }

    const doneNote = status === 'done'
      ? '<button class="subtle-button" data-action="next-pending">次の未確認へ →</button>'
      : '';

    detail.innerHTML = `
      ${detailHeader}
      <p class="detail-context">${escapeHTML(cleanContext(candidate.context))}</p>
      ${change}
      <div class="detail-actions">${actions}</div>
      ${doneNote}
      <p class="keyboard-note">A：採用／確認　S：除外　← →：候補移動</p>
    `;
  }

  function renderFocusCard() {
    const candidate = getCandidate(state.activeId);
    const card = $('#focusCard');
    if (!candidate) {
      card.innerHTML = `
        <div class="focus-empty">
          <strong>原稿を読んで、右側の候補を必要な分だけ確認。</strong>
          <span>候補を選ぶと、ここに変更前後と文脈が出ます。</span>
        </div>
      `;
      return;
    }

    const status = candidateStatusText(candidate);
    const before = candidate.before || '（追加）';
    const after = candidate.after || '（削除）';
    const heading = candidate.type === 'label'
      ? `【${candidate.value}】の扱い：${status}`
      : `${candidate.label}：${status}`;

    card.innerHTML = `
      <div class="focus-title">
        <span class="focus-type">${escapeHTML(kindText(candidate))} ・ ${candidate.severity === 'critical' ? '重要確認' : '確認項目'}</span>
        <strong>${escapeHTML(heading)}</strong>
      </div>
      <p class="focus-context">${escapeHTML(candidate.context)}</p>
      <div class="focus-diff">
        <div><label>${candidate.type === 'label' ? '対象' : '変更前'}</label><span class="focus-before">${escapeHTML(before)}</span></div>
        <div><label>${candidate.type === 'label' ? '現在の方針' : '変更後'}</label><span class="focus-after">${escapeHTML(candidate.type === 'label' ? labelActionText(state.labelDecisions[candidate.id] || state.labelDefault) : after)}</span></div>
      </div>
    `;
  }

  function renderCompare() {
    const compareToggle = $('#compareToggle');
    compareToggle.disabled = !state.baseline;
    compareToggle.style.opacity = state.baseline ? '1' : '.45';
    if (!state.baseline) {
      $('#compareStats').innerHTML = '';
      $('#beforeDiff').textContent = '比較元の原文を追加すると、ここに差分が出ます。';
      $('#afterDiff').textContent = '比較元の原文を追加すると、ここに差分が出ます。';
      return;
    }

    const hunks = state.derived.manualDiff.hunks;
    const critical = hunks.filter(hunk => hunk.severity === 'critical').length;
    $('#compareStats').innerHTML = `
      <span class="compare-stat ${critical ? 'critical' : ''}">差分 ${hunks.length}件</span>
      <span class="compare-stat">重要 ${critical}件</span>
    `;

    const active = getCandidate(state.activeId);
    const activeHunk = active?.type === 'manual' ? active.sourceId : null;
    const parts = state.derived.manualDiff.parts;
    $('#beforeDiff').innerHTML = renderDiffPane(parts, 'before', activeHunk);
    $('#afterDiff').innerHTML = renderDiffPane(parts, 'after', activeHunk);
  }

  function renderDiffPane(parts, side, activeHunk) {
    if (!parts.length) return '<span style="color:#7c899c">差分はありません。</span>';
    return parts.map(part => {
      if (side === 'before' && part.type === 'add') return '';
      if (side === 'after' && part.type === 'remove') return '';
      const className = part.type === 'remove'
        ? 'diff-del'
        : part.type === 'add'
          ? 'diff-add'
          : '';
      const focus = part.hunkId && part.hunkId === activeHunk ? ' diff-focus' : '';
      return className
        ? `<mark class="${className}${focus}" data-hunk-id="${escapeHTML(part.hunkId)}">${escapeHTML(part.value)}</mark>`
        : escapeHTML(part.value);
    }).join('');
  }

  function renderOutput() {
    const output = $('#outputPanel');
    const current = state.outputTab;
    $$('.output-tabs button').forEach(button => button.classList.toggle('is-active', button.dataset.outputTab === current));

    if (current === 'plain') {
      $('#outputDescription').textContent = 'タグを外した、貼り付け用のプレーンテキストです。';
      output.innerHTML = `
        <div class="output-toolbar">
          <p class="output-note">既存HTMLタグは文字を残して除去します。ラベルは個別の判断に応じて、文字だけまたは【】のまま出力します。</p>
          <button class="primary-button" data-action="copy" data-copy-type="plain">コピー</button>
        </div>
        <pre class="plain-output">${escapeHTML(state.derived.plainOutput)}</pre>
      `;
      return;
    }

    if (current === 'html') {
      const tagMode = state.existingTagMode === 'keep' ? '既存HTMLタグを保持' : '既存HTMLタグを外す';
      $('#outputDescription').textContent = `${tagMode}。ラベルの個別判断と初期方針を反映した掲載用HTMLです。`;
      output.innerHTML = `
        <div class="output-toolbar">
          <p class="output-note">タグ設定は右側の「タグの扱い」からいつでも変更できます。</p>
          <button class="primary-button" data-action="copy" data-copy-type="html">HTMLをコピー</button>
        </div>
        <pre class="output-code">${escapeHTML(state.derived.htmlOutput)}</pre>
      `;
      return;
    }

    $('#outputDescription').textContent = '安全のため、生成した info24-label だけを装飾として表示します。その他の既存HTMLはコードとして見えます。';
    output.innerHTML = `
      <div class="preview-frame">${safePreviewHTML(state.derived.htmlOutput)}</div>
      <p class="preview-note">これはHTML構造の簡易プレビューです。本番CMSや本番CSSの完全再現ではありません。</p>
    `;
  }

  function renderAudit() {
    const baseline = state.baseline || '— 比較元なし —';
    $('#auditGrid').innerHTML = `
      <section class="audit-column"><header>比較元</header><pre>${escapeHTML(baseline)}</pre></section>
      <section class="audit-column"><header>原稿</header><pre>${escapeHTML(state.working || '—')}</pre></section>
      <section class="audit-column"><header>タグなしテキスト</header><pre>${escapeHTML(state.derived.plainOutput || '—')}</pre></section>
      <section class="audit-column"><header>掲載用HTML</header><pre>${escapeHTML(state.derived.htmlOutput || '—')}</pre></section>
    `;
  }

  function renderUndoButtons() {
    $('#undoButton').disabled = !state.history.length;
    $('#redoButton').disabled = !state.future.length;
  }

  function renderAll() {
    state.derived = derive();
    ensureActiveCandidate();
    renderMeta();
    renderTagSettings();
    renderSummary();
    renderCandidateList();
    renderCandidateDetail();
    renderFocusCard();
    renderCompare();
    renderOutput();
    renderAudit();
    renderUndoButtons();
  }

  function selectCandidate(id, focusEditor = true) {
    state.activeId = id;
    renderAll();
    const candidate = getCandidate(id);
    if (focusEditor && candidate) {
      requestAnimationFrame(() => focusCandidateInEditor(candidate));
    }
  }

  function focusCandidateInEditor(candidate) {
    const editor = $('#workingText');
    if (!editor || !state.working) return;
    let start = candidate.start || 0;
    let end = candidate.end || start;

    if (candidate.type === 'manual' && !candidate.after) {
      start = candidate.start || 0;
      end = start;
    }
    if (candidate.type === 'label') return;

    editor.focus({ preventScroll: true });
    editor.setSelectionRange(start, end);
    const priorLines = state.working.slice(0, start).split('\n').length;
    editor.scrollTop = Math.max(0, (priorLines - 4) * 27);
  }

  function nextPending() {
    const candidates = allCandidates();
    const pending = candidates.filter(candidate => candidateStatus(candidate) === 'pending');
    if (!pending.length) {
      notify('未確認の項目はありません');
      return;
    }
    const currentIndex = pending.findIndex(candidate => candidate.id === state.activeId);
    const next = pending[(currentIndex + 1 + pending.length) % pending.length];
    selectCandidate(next.id);
  }

  function moveCandidate(direction) {
    const candidates = filterCandidates(allCandidates());
    if (!candidates.length) return;
    const currentIndex = candidates.findIndex(candidate => candidate.id === state.activeId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + candidates.length) % candidates.length;
    selectCandidate(candidates[nextIndex].id);
  }

  function setManual(candidateId, value) {
    const candidate = getCandidate(candidateId);
    if (!candidate) return;
    commitHistory();
    state.manualReviews[candidate.sourceId] = value === 'reviewed' ? 'reviewed' : 'pending';
    renderAll();
    notify(value === 'reviewed' ? '差分を確認済みにしました' : '未確認に戻しました');
  }

  function setNormalization(candidateId, value) {
    const candidate = getCandidate(candidateId);
    if (!candidate) return;
    commitHistory();
    state.normDecisions[candidate.id] = value;
    renderAll();
    notify(value === 'accepted' ? '表記統一を採用しました' : 'この原稿では除外しました');
  }

  function setLabel(candidateId, value) {
    const candidate = getCandidate(candidateId);
    if (!candidate) return;
    commitHistory();
    state.labelDecisions[candidate.id] = value;
    renderAll();
    notify(`ラベルを「${labelActionText(value)}」にしました`);
  }

  function resetDecisions(message) {
    const hadDecisions = Object.keys(state.normDecisions).length || Object.keys(state.labelDecisions).length || Object.keys(state.manualReviews).length;
    state.normDecisions = {};
    state.labelDecisions = {};
    state.manualReviews = {};
    state.history = [];
    state.future = [];
    if (hadDecisions) notify(message || '原稿変更により、確認内容を更新しました');
  }

  function scheduleWorkingAnalysis() {
    state.analyzing = true;
    renderMeta();
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => {
      state.analyzing = false;
      resetDecisions('原稿変更により、候補の判断を更新しました');
      renderAll();
    }, 550);
  }

  function scheduleBaselineAnalysis() {
    state.analyzing = true;
    renderMeta();
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => {
      state.analyzing = false;
      state.manualReviews = {};
      renderAll();
    }, 450);
  }

  function toggleBaseline(force) {
    const panel = $('#baselinePanel');
    const shouldOpen = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !shouldOpen;
    $('#baselineToggle').textContent = shouldOpen ? '比較元を閉じる' : '原文を追加して比較';
    if (shouldOpen) setTimeout(() => $('#baselineText').focus(), 0);
  }

  function toggleDrawer(id, buttonId) {
    const drawer = $(id);
    const willOpen = drawer.hidden;
    drawer.hidden = !willOpen;
    const button = $(buttonId);
    if (button) button.classList.toggle('is-active', willOpen);
    if (willOpen) setTimeout(() => drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
  }

  function toggleTagSettings() {
    const panel = $('#tagSettings');
    const button = $('#tagSettingsButton');
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
  }

  function toggleCopyMenu() {
    const menu = $('#copyMenu');
    const button = $('#copyMenuButton');
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
  }

  async function copyText(kind) {
    const pendingCount = allCandidates().filter(candidate => candidateStatus(candidate) === 'pending').length;
    if (pendingCount && !window.confirm(`未確認の項目が${pendingCount}件あります。\nこのままコピーしますか？`)) return;

    let value = '';
    let message = '';
    if (kind === 'plain') {
      value = state.derived.plainOutput;
      message = 'タグなしテキストをコピーしました';
    }
    if (kind === 'html') {
      value = state.derived.htmlOutput;
      message = '掲載用HTMLをコピーしました';
    }
    if (kind === 'report') {
      value = buildReport();
      message = '差分一覧をコピーしました';
    }

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const temporary = document.createElement('textarea');
      temporary.value = value;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.appendChild(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
    }
    $('#copyMenu').hidden = true;
    $('#copyMenuButton').setAttribute('aria-expanded', 'false');
    notify(message);
  }

  function buildReport() {
    const lines = [];
    lines.push(`Text Review Studio v0.4.0｜${state.title}`);
    lines.push(`作成日時：${new Date().toLocaleString('ja-JP')}`);
    lines.push('');
    const candidates = allCandidates();
    if (!candidates.length) lines.push('確認対象はありません。');
    candidates.forEach((candidate, index) => {
      lines.push(`${index + 1}. [${kindText(candidate)}／${candidateStatusText(candidate)}${candidate.severity === 'critical' ? '／重要' : ''}] ${candidateTitle(candidate)}`);
      if (candidate.type !== 'label') {
        lines.push(`   変更前：${candidate.before || '（追加）'}`);
        lines.push(`   変更後：${candidate.after || '（削除）'}`);
      } else {
        lines.push(`   方針：${labelActionText(state.labelDecisions[candidate.id] || state.labelDefault)}`);
      }
    });
    return lines.join('\n');
  }

  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function exportWork() {
    const payload = {
      version: '0.4.0',
      title: state.title,
      baseline: state.baseline,
      working: state.working,
      normDecisions: state.normDecisions,
      labelDecisions: state.labelDecisions,
      manualReviews: state.manualReviews,
      existingTagMode: state.existingTagMode,
      labelDefault: state.labelDefault,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `v0.4.0-${(state.title || 'text-review').replace(/[\\/:*?"<>|]/g, '_')}-work.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    notify('作業データを書き出しました');
  }

  function importWork(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (typeof data.working !== 'string') throw new Error('invalid');
        state.title = data.title || '名称未設定の原稿';
        state.baseline = data.baseline || '';
        state.working = data.working;
        state.normDecisions = data.normDecisions || {};
        state.labelDecisions = data.labelDecisions || {};
        state.manualReviews = data.manualReviews || {};
        state.existingTagMode = data.existingTagMode || 'keep';
        state.labelDefault = data.labelDefault || 'tag';
        state.history = [];
        state.future = [];
        $('#projectTitle').value = state.title;
        $('#workingText').value = state.working;
        $('#baselineText').value = state.baseline;
        toggleBaseline(Boolean(state.baseline));
        $('#moreDialog').close();
        renderAll();
        notify('作業データを読み込みました');
      } catch {
        notify('読み込めませんでした。Text Review StudioのJSONか確認してください。');
      }
    };
    reader.readAsText(file);
  }

  function loadSample() {
    if (state.working && !window.confirm('現在の内容をサンプルに置き換えますか？')) return;
    state.title = 'サンプル｜ポケモンJリーグフェス告知';
    state.baseline = `浦和レッズは、8月15日（土）サンフレッチェ広島戦にて「ポケモンJリーグフェス」を開催いたします。\n\n当日は来場者先着52,000名さまにEVO BAGをプレゼントいたします。\n\n【対象試合】\n8月15日(土) サンフレッチェ広島戦\n\n詳細は https://example.com/ticket?foo=1&bar=2 をご確認ください。\n\n宜しくお願いします！`;
    state.working = `浦和レッズは、8/15(土)サンフレッチェ広島戦にて「ポケモンJリーグフェス」を開催いたします。\n\n当日は、来場者先着52,000名さまにEVO BAGをプレゼントいたします。様々なイベントを予定しております。\n\n【対象試合】\n8/15(土) サンフレッチェ広島戦\n\n詳細は https://example.com/ticket?foo=1&bar=2 をご確認ください。\n\n<span class="note">宜しくお願いします！</span>\n\n新加入選手は精一杯プレーいたします。`;
    state.normDecisions = {};
    state.labelDecisions = {};
    state.manualReviews = {};
    state.history = [];
    state.future = [];
    $('#projectTitle').value = state.title;
    $('#workingText').value = state.working;
    $('#baselineText').value = state.baseline;
    toggleBaseline(true);
    if ($('#moreDialog').open) $('#moreDialog').close();
    renderAll();
    notify('サンプルを読み込みました');
  }

  function clearWork() {
    if (!window.confirm('原稿・判断・設定をこの画面から消去しますか？')) return;
    state.title = '名称未設定の原稿';
    state.working = '';
    state.baseline = '';
    state.normDecisions = {};
    state.labelDecisions = {};
    state.manualReviews = {};
    state.history = [];
    state.future = [];
    state.activeId = null;
    $('#projectTitle').value = state.title;
    $('#workingText').value = '';
    $('#baselineText').value = '';
    toggleBaseline(false);
    if ($('#moreDialog').open) $('#moreDialog').close();
    renderAll();
    notify('この画面の内容を消去しました');
  }

  function setExistingTagMode(value) {
    if (value === state.existingTagMode) return;
    commitHistory();
    state.existingTagMode = value;
    renderAll();
    notify(value === 'keep' ? '既存HTMLタグを保持します' : '既存HTMLタグを外します');
  }

  function setLabelDefault(value) {
    if (value === state.labelDefault) return;
    commitHistory();
    state.labelDefault = value;
    renderAll();
    notify(`ラベルの初期方針を「${labelActionText(value)}」にしました`);
  }

  function applyLabelDefault() {
    const pending = state.derived.labelCandidates.filter(candidate => !state.labelDecisions[candidate.id]);
    if (!pending.length) {
      notify('未確認のラベルはありません');
      return;
    }
    commitHistory();
    pending.forEach(candidate => { state.labelDecisions[candidate.id] = state.labelDefault; });
    renderAll();
    notify(`${pending.length}件のラベルに初期方針を適用しました`);
  }

  function openAudit() {
    renderAudit();
    $('#auditDialog').showModal();
  }

  function actionForActive(kind) {
    const candidate = getCandidate(state.activeId);
    if (!candidate) return;
    if (kind === 'accept') {
      if (candidate.type === 'manual') setManual(candidate.id, 'reviewed');
      if (candidate.type === 'normalize') setNormalization(candidate.id, 'accepted');
      if (candidate.type === 'label') setLabel(candidate.id, 'tag');
    }
    if (kind === 'skip') {
      if (candidate.type === 'normalize') setNormalization(candidate.id, 'skipped');
      if (candidate.type === 'label') setLabel(candidate.id, 'plain');
    }
  }

  function handleAction(action, target) {
    switch (action) {
      case 'scroll-top': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'toggle-copy-menu': toggleCopyMenu(); break;
      case 'toggle-more': $('#moreDialog').showModal(); break;
      case 'close-more': $('#moreDialog').close(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'paste-working': navigator.clipboard?.readText().then(text => { $('#workingText').value = text; state.working = text; scheduleWorkingAnalysis(); }).catch(() => notify('貼り付けられませんでした。ブラウザの貼り付けをご利用ください。')); break;
      case 'clear-working':
        if (state.working && window.confirm('原稿を消去しますか？')) { $('#workingText').value = ''; state.working = ''; resetDecisions(); renderAll(); }
        break;
      case 'paste-baseline': navigator.clipboard?.readText().then(text => { $('#baselineText').value = text; state.baseline = text; scheduleBaselineAnalysis(); }).catch(() => notify('貼り付けられませんでした。ブラウザの貼り付けをご利用ください。')); break;
      case 'remove-baseline':
        state.baseline = ''; state.manualReviews = {}; $('#baselineText').value = ''; toggleBaseline(false); renderAll(); notify('比較元を外しました');
        break;
      case 'toggle-baseline': toggleBaseline(); break;
      case 'toggle-compare':
        if (!state.baseline) { toggleBaseline(true); notify('比較元の原文を追加してください'); }
        else toggleDrawer('#compareDrawer', '#compareToggle');
        break;
      case 'toggle-output': toggleDrawer('#outputDrawer', '#outputToggle'); break;
      case 'open-audit': openAudit(); break;
      case 'close-audit': $('#auditDialog').close(); break;
      case 'toggle-tag-settings': toggleTagSettings(); break;
      case 'set-existing-tags': setExistingTagMode(target.dataset.value); break;
      case 'set-label-default': setLabelDefault(target.dataset.value); break;
      case 'apply-label-default': applyLabelDefault(); break;
      case 'set-filter': state.filter = target.dataset.filter; renderCandidateList(); break;
      case 'select-candidate': selectCandidate(target.dataset.candidateId); break;
      case 'set-manual': setManual(target.dataset.candidateId, target.dataset.value); break;
      case 'set-normalize': setNormalization(target.dataset.candidateId, target.dataset.value); break;
      case 'set-label': setLabel(target.dataset.candidateId, target.dataset.value); break;
      case 'next-pending': nextPending(); break;
      case 'set-output-tab': state.outputTab = target.dataset.outputTab; renderOutput(); break;
      case 'copy': copyText(target.dataset.copyType); break;
      case 'load-sample': loadSample(); break;
      case 'download-work': exportWork(); break;
      case 'upload-work': $('#workFile').click(); break;
      case 'clear-work': clearWork(); break;
      default: break;
    }
  }

  document.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    if (control) {
      event.preventDefault();
      handleAction(control.dataset.action, control);
      return;
    }
    if (!event.target.closest('.copy-wrap')) {
      $('#copyMenu').hidden = true;
      $('#copyMenuButton').setAttribute('aria-expanded', 'false');
    }
  });

  $('#workingText').addEventListener('input', (event) => {
    state.working = event.target.value;
    scheduleWorkingAnalysis();
  });

  $('#baselineText').addEventListener('input', (event) => {
    state.baseline = event.target.value;
    scheduleBaselineAnalysis();
  });

  $('#projectTitle').addEventListener('input', (event) => {
    state.title = event.target.value || '名称未設定の原稿';
  });

  $('#workFile').addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (file) importWork(file);
    event.target.value = '';
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isEditing = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target.isContentEditable;
    if (isEditing) return;
    if ($('#auditDialog').open || $('#moreDialog').open) return;

    if (event.key === 'ArrowRight') { event.preventDefault(); moveCandidate(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); moveCandidate(-1); }
    if (event.key.toLowerCase() === 'a') { event.preventDefault(); actionForActive('accept'); }
    if (event.key.toLowerCase() === 's') { event.preventDefault(); actionForActive('skip'); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    }
  });

  $('#auditDialog').addEventListener('click', (event) => {
    if (event.target === $('#auditDialog')) $('#auditDialog').close();
  });

  $('#moreDialog').addEventListener('click', (event) => {
    if (event.target === $('#moreDialog')) $('#moreDialog').close();
  });

  renderAll();
})();
