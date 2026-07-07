/* Text Review Studio v0.6.6 – tag-aware difff-style comparison core. */
(function (root) {
  'use strict';

  const MAX_LINE_CELLS = 220000;
  const MAX_CHAR_CELLS = 240000;
  const TAG_RE = /<\/?[A-Za-z][^>]*>/g;

  function compact(parts) {
    const out = [];
    for (const part of parts) {
      if (!part || !part.value) continue;
      const prev = out[out.length - 1];
      if (prev && prev.type === part.type && prev.hunkId === part.hunkId) prev.value += part.value;
      else out.push({ ...part });
    }
    return out;
  }

  function splitLines(text) {
    if (!text) return [];
    const lines = String(text).split('\n');
    return lines.map((line, index) => index < lines.length - 1 ? `${line}\n` : line);
  }

  function lcsDiff(a, b, maxCells) {
    const n = a.length;
    const m = b.length;
    if (!n && !m) return [];
    if (!n) return [{ type: 'add', values: b.slice() }];
    if (!m) return [{ type: 'remove', values: a.slice() }];
    if (n * m > maxCells) {
      let start = 0;
      while (start < Math.min(n, m) && a[start] === b[start]) start += 1;
      let endA = n - 1;
      let endB = m - 1;
      while (endA >= start && endB >= start && a[endA] === b[endB]) { endA -= 1; endB -= 1; }
      const fallback = [];
      if (start) fallback.push({ type: 'same', values: a.slice(0, start) });
      if (endA >= start) fallback.push({ type: 'remove', values: a.slice(start, endA + 1) });
      if (endB >= start) fallback.push({ type: 'add', values: b.slice(start, endB + 1) });
      if (endA < n - 1) fallback.push({ type: 'same', values: a.slice(endA + 1) });
      return fallback;
    }

    const width = m + 1;
    const matrix = new Uint32Array((n + 1) * (m + 1));
    const at = (i, j) => i * width + j;
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        matrix[at(i, j)] = a[i] === b[j] ? matrix[at(i + 1, j + 1)] + 1 : Math.max(matrix[at(i + 1, j)], matrix[at(i, j + 1)]);
      }
    }

    const out = [];
    const push = (type, value) => {
      const prev = out[out.length - 1];
      if (prev && prev.type === type) prev.values.push(value);
      else out.push({ type, values: [value] });
    };
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { push('same', a[i]); i += 1; j += 1; }
      else if (matrix[at(i + 1, j)] >= matrix[at(i, j + 1)]) { push('remove', a[i]); i += 1; }
      else { push('add', b[j]); j += 1; }
    }
    while (i < n) { push('remove', a[i]); i += 1; }
    while (j < m) { push('add', b[j]); j += 1; }
    return out;
  }

  function classifySeverity(before, after) {
    const all = `${before}${after}`;
    if (/(https?:\/\/|www\.|@[\w.-]+\.|<\/?[A-Za-z][^>]*>|[0-9０-９]+\s*(年|月|日|時|分|円|%|％))/i.test(all)) return 'critical';
    if (/^[\s\n\r\t、。,.!！?？()（）\[\]【】「」『』]+$/u.test(all)) return 'minor';
    return 'normal';
  }

  function inlineDiff(before, after, id, beforeStart, afterStart) {
    if (!before && !after) return [];
    if (!before) return [{ type: 'add', value: after, hunkId: id, beforeStart, afterStart }];
    if (!after) return [{ type: 'remove', value: before, hunkId: id, beforeStart, afterStart }];
    const ops = lcsDiff(Array.from(before), Array.from(after), MAX_CHAR_CELLS);
    const parts = [];
    let b = beforeStart;
    let a = afterStart;
    for (const op of ops) {
      const value = op.values.join('');
      if (!value) continue;
      parts.push({ type: op.type, value, hunkId: op.type === 'same' ? null : id, beforeStart: b, afterStart: a });
      if (op.type !== 'add') b += value.length;
      if (op.type !== 'remove') a += value.length;
    }
    return parts;
  }

  function diffText(beforeText, afterText) {
    const before = String(beforeText || '');
    const after = String(afterText || '');
    const operations = lcsDiff(splitLines(before), splitLines(after), MAX_LINE_CELLS);
    const parts = [];
    const hunks = [];
    let bPos = 0;
    let aPos = 0;
    let index = 0;
    let count = 0;
    while (index < operations.length) {
      const op = operations[index];
      if (op.type === 'same') {
        const value = op.values.join('');
        parts.push({ type: 'same', value, hunkId: null, beforeStart: bPos, afterStart: aPos });
        bPos += value.length;
        aPos += value.length;
        index += 1;
        continue;
      }
      const startB = bPos;
      const startA = aPos;
      let removed = '';
      let added = '';
      while (index < operations.length && operations[index].type !== 'same') {
        const value = operations[index].values.join('');
        if (operations[index].type === 'remove') { removed += value; bPos += value.length; }
        else { added += value; aPos += value.length; }
        index += 1;
      }
      const id = `diff-${++count}`;
      const kind = removed && added ? 'replace' : removed ? 'delete' : 'insert';
      hunks.push({ id, kind, before: removed, after: added, beforeStart: startB, beforeEnd: startB + removed.length, afterStart: startA, afterEnd: startA + added.length, severity: classifySeverity(removed, added) });
      parts.push(...inlineDiff(removed, added, id, startB, startA));
    }
    return { parts: compact(parts), hunks };
  }

  function prepare(text, options) {
    const raw = String(text || '');
    if (!options?.ignoreHtmlTags) return { raw, plain: raw, map: Array.from({ length: raw.length }, (_, i) => i) };
    let plain = '';
    const map = [];
    let cursor = 0;
    const tags = new RegExp(TAG_RE.source, 'g');
    let match;
    while ((match = tags.exec(raw))) {
      for (let i = cursor; i < match.index; i += 1) { plain += raw[i]; map.push(i); }
      cursor = match.index + match[0].length;
    }
    for (let i = cursor; i < raw.length; i += 1) { plain += raw[i]; map.push(i); }
    return { raw, plain, map };
  }

  function offset(prepared, index) {
    if (!prepared.plain.length) return 0;
    if (index <= 0) return prepared.map[0] ?? 0;
    if (index >= prepared.plain.length) return prepared.raw.length;
    return prepared.map[index] ?? prepared.raw.length;
  }

  function lineEntries(prepared) {
    const lines = splitLines(prepared.plain);
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    let pos = 0;
    return lines.map((text, index) => {
      const start = pos;
      pos += text.length;
      return { text, index, start, end: pos, rawStart: offset(prepared, start), rawEnd: offset(prepared, pos) };
    });
  }

  function diffRows(beforeText, afterText, options = {}) {
    const before = prepare(beforeText, options);
    const after = prepare(afterText, options);
    const beforeLines = lineEntries(before);
    const afterLines = lineEntries(after);
    const operations = lcsDiff(beforeLines.map(line => line.text), afterLines.map(line => line.text), MAX_LINE_CELLS);
    const rows = [];
    const hunks = [];
    let b = 0;
    let a = 0;
    let sameCount = 0;
    let changeCount = 0;
    const addRow = (kind, left, right) => {
      const id = kind === 'same' ? `same-${++sameCount}` : `compare-${++changeCount}`;
      const beforeText = left?.text || '';
      const afterText = right?.text || '';
      const beforeStart = left?.rawStart ?? beforeLines[b]?.rawStart ?? before.raw.length;
      const afterStart = right?.rawStart ?? afterLines[a]?.rawStart ?? after.raw.length;
      const parts = kind === 'same' ? [{ type: 'same', value: beforeText, hunkId: null, beforeStart, afterStart }] : inlineDiff(beforeText, afterText, id, beforeStart, afterStart);
      const row = { id, kind, before: beforeText, after: afterText, beforeStart, beforeEnd: left?.rawEnd ?? beforeStart, afterStart, afterEnd: right?.rawEnd ?? afterStart, severity: kind === 'same' ? 'minor' : classifySeverity(beforeText, afterText), parts };
      rows.push(row);
      if (kind !== 'same') hunks.push({ id, kind, before: row.before, after: row.after, beforeStart: row.beforeStart, beforeEnd: row.beforeEnd, afterStart: row.afterStart, afterEnd: row.afterEnd, severity: row.severity });
    };

    let index = 0;
    while (index < operations.length) {
      const op = operations[index];
      if (op.type === 'same') {
        for (let n = 0; n < op.values.length; n += 1) addRow('same', beforeLines[b++], afterLines[a++]);
        index += 1;
        continue;
      }
      const removed = [];
      const added = [];
      while (index < operations.length && operations[index].type !== 'same') {
        const changed = operations[index];
        if (changed.type === 'remove') for (let n = 0; n < changed.values.length; n += 1) removed.push(beforeLines[b++]);
        else for (let n = 0; n < changed.values.length; n += 1) added.push(afterLines[a++]);
        index += 1;
      }
      const paired = Math.min(removed.length, added.length);
      for (let n = 0; n < paired; n += 1) addRow('replace', removed[n], added[n]);
      for (let n = paired; n < removed.length; n += 1) addRow('delete', removed[n], null);
      for (let n = paired; n < added.length; n += 1) addRow('insert', null, added[n]);
    }
    return { rows, hunks, parts: compact(rows.flatMap(row => row.parts)), before: before.plain, after: after.plain, ignoredTags: Boolean(options.ignoreHtmlTags) };
  }

  const api = {
    diffText,
    diffRows,
    prepareComparisonText: prepare,
    reconstructBefore(parts) { return parts.filter(part => part.type !== 'add').map(part => part.value).join(''); },
    reconstructAfter(parts) { return parts.filter(part => part.type !== 'remove').map(part => part.value).join(''); },
    _lcsDiff: lcsDiff
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextReviewDiffCore = api;

  function ensureCompatibilityAnchors() {
    if (typeof document === 'undefined' || !document.body) return;
    const add = (parent, markup) => parent.insertAdjacentHTML('beforeend', markup);
    const afterPane = document.querySelector('.after-pane') || document.body;
    if (!document.querySelector('#searchBar')) {
      add(afterPane, `<div id="searchBar" class="search-bar" hidden><span>検索</span><input id="searchInput"><span id="searchCount">0件</span><button data-action="search-prev">←</button><button data-action="search-next">→</button><button data-action="toggle-replace">置換</button><button data-action="close-search">×</button><div id="replaceControls" hidden><input id="replaceInput"><input id="replaceProtect" type="checkbox" checked><button data-action="replace-one">1件置換</button><button data-action="replace-all">すべて置換</button></div></div>`);
    }
    const hidden = document.createElement('div');
    hidden.id = 'trs-compat-anchors';
    hidden.hidden = true;
    hidden.innerHTML = `<span id="baselineEmptyText"></span><span id="workingEmptyText"></span><span id="workingMeta"></span><span id="railTotal"></span><span id="railSub"></span><div id="railDots"></div><div id="reviewCounts"></div><div id="activeReview"></div><span id="queueListCount"></span><div id="queueList"></div><button id="outputSettingsButton"></button><button id="historyButton"></button><button id="exceptionsButton"></button><section id="outputSettings" hidden><pre id="outputPreview"></pre></section><section id="historyDrawer" hidden><div id="historyList"></div></section><section id="exceptionsDrawer" hidden><div id="exceptionList"></div></section>`;
    const ids = ['baselineEmptyText', 'workingEmptyText', 'workingMeta', 'railTotal', 'railSub', 'railDots', 'reviewCounts', 'activeReview', 'queueListCount', 'queueList', 'outputSettingsButton', 'historyButton', 'exceptionsButton', 'outputSettings', 'outputPreview', 'historyDrawer', 'historyList', 'exceptionsDrawer', 'exceptionList'];
    if (ids.some(id => !document.getElementById(id))) document.body.appendChild(hidden);
    const transform = document.querySelector('#transformDialog');
    if (transform && !document.querySelector('#transformSummary')) add(transform, '<span id="transformSummary"></span><div id="transformExamples"></div><button id="applyTransformButton" data-action="apply-pending-transform"></button>');
    const pattern = document.querySelector('#patternDialog');
    if (pattern && !document.querySelector('#patternPreview')) add(pattern, '<div id="patternPreview"></div><button id="applyPatternButton" data-action="apply-pending-transform"></button>');
    const audit = document.querySelector('#auditDialog');
    if (audit && !document.querySelector('#auditGrid')) add(audit, '<div id="auditGrid"></div>');
  }

  function installCompareView() {
    if (typeof document === 'undefined') return;
    const $ = selector => document.querySelector(selector);
    const before = $('#baselineText');
    const after = $('#workingText');
    const left = $('#baselineCompare');
    const right = $('#afterCompare');
    const gutter = $('#gutterMap');
    const compareButton = $('#compareModeButton');
    const editButton = $('#editModeButton');
    if (!before || !after || !left || !right || !gutter || !compareButton || !editButton) return;

    let ignoreTags = true;
    let timer = 0;
    let syncing = false;
    let drawing = false;
    try { ignoreTags = localStorage.getItem('text-review-studio-v066-ignore-html-tags') !== 'false'; } catch (_) {}
    const escape = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const trimNewline = value => String(value || '').replace(/\n$/, '');
    const isCompare = () => compareButton.classList.contains('is-active');
    const control = $('#ignoreHtmlTagsToggle') || (() => {
      const box = document.createElement('div');
      box.id = 'v066TagIgnore';
      box.hidden = true;
      box.className = 'compare-options';
      box.innerHTML = '<label class="compare-option"><input id="v066IgnoreTags" type="checkbox"><span class="compare-option-label">タグを無視</span><small>&lt;&gt;の英字タグを本文比較から外す</small></label>';
      (document.querySelector('.desk-toolbar') || document.body).insertAdjacentElement('afterend', box);
      return $('#v066IgnoreTags');
    })();
    const toggle = control.id === 'ignoreHtmlTagsToggle' ? control : $('#v066IgnoreTags');
    toggle.checked = ignoreTags;
    const inline = (row, side) => row.parts.map(part => {
      if ((side === 'before' && part.type === 'add') || (side === 'after' && part.type === 'remove')) return '';
      const text = trimNewline(part.value);
      if (!text) return '';
      if (part.type === 'same') return escape(text);
      return side === 'before' ? `<span class="v066-before">${escape(text)}</span>` : `<mark class="v066-after">${escape(text)}</mark>`;
    }).join('') || '&nbsp;';
    const kindMark = kind => kind === 'replace' ? '↔' : kind === 'insert' ? '+' : kind === 'delete' ? '−' : '·';
    const render = () => {
      if (!isCompare()) return;
      const result = diffRows(before.value, after.value, { ignoreHtmlTags });
      drawing = true;
      left.innerHTML = result.rows.map(row => `<div class="compare-row v066-row" data-v066-id="${escape(row.id)}">${inline(row, 'before')}</div>`).join('');
      right.innerHTML = result.rows.map(row => `<div class="compare-row v066-row" data-v066-id="${escape(row.id)}">${inline(row, 'after')}</div>`).join('');
      gutter.classList.add('v066-gutter');
      gutter.innerHTML = result.rows.map(row => `<div class="v066-gutter-row" data-v066-id="${escape(row.id)}"><button class="gutter-marker ${row.kind === 'insert' ? 'add' : row.kind === 'delete' ? 'remove' : row.kind === 'replace' ? 'replace' : 'same'}" data-v066-jump="${escape(row.id)}">${kindMark(row.kind)}</button></div>`).join('');
      left.hidden = false;
      right.hidden = false;
      requestAnimationFrame(() => {
        const leftRows = [...left.querySelectorAll('.v066-row')];
        const rightRows = [...right.querySelectorAll('.v066-row')];
        const gutterRows = [...gutter.querySelectorAll('.v066-gutter-row')];
        leftRows.forEach((row, index) => {
          const height = Math.max(31, Math.ceil(row.getBoundingClientRect().height), Math.ceil(rightRows[index]?.getBoundingClientRect().height || 0));
          row.style.minHeight = `${height}px`;
          if (rightRows[index]) rightRows[index].style.minHeight = `${height}px`;
          if (gutterRows[index]) gutterRows[index].style.minHeight = `${height}px`;
        });
        drawing = false;
      });
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 260); };
    toggle.addEventListener('change', () => { ignoreTags = toggle.checked; try { localStorage.setItem('text-review-studio-v066-ignore-html-tags', String(ignoreTags)); } catch (_) {} render(); });
    [before, after].forEach(node => node.addEventListener('input', schedule));
    [compareButton, editButton].forEach(node => node.addEventListener('click', () => setTimeout(render, 30)));
    const observer = new MutationObserver(() => { if (!drawing && isCompare()) schedule(); });
    observer.observe(left, { childList: true });
    observer.observe(right, { childList: true });
    const sync = source => {
      if (syncing) return;
      syncing = true;
      const top = source.scrollTop;
      [left, right, gutter].forEach(node => { if (node && node !== source) node.scrollTop = top; });
      requestAnimationFrame(() => { syncing = false; });
    };
    left.addEventListener('scroll', () => sync(left), { passive: true });
    right.addEventListener('scroll', () => sync(right), { passive: true });
    gutter.addEventListener('click', event => {
      const button = event.target.closest('[data-v066-jump]');
      if (!button) return;
      const id = button.dataset.v066Jump;
      document.querySelectorAll('[data-v066-id], [data-v066-jump]').forEach(node => node.classList.toggle('is-active', node.dataset.v066Id === id || node.dataset.v066Jump === id));
      right.querySelector(`[data-v066-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const style = document.createElement('style');
    style.textContent = '.v066-before{color:#c3505f;background:transparent;text-decoration:none}.v066-after{background:rgba(188,234,210,.78);color:inherit;border-radius:3px;padding:1px}.v066-gutter{display:block!important;gap:0!important;padding:12px 0 44px!important;overflow:auto}.v066-gutter-row{display:grid;place-items:center;min-height:31px}.v066-row{white-space:pre-wrap;overflow-wrap:anywhere}.v066-row.is-active{box-shadow:inset 3px 0 0 #17725a}.compare-options:not([hidden]){display:flex;align-items:center;gap:8px;margin:-2px 0 12px;padding:8px 11px;border:1px solid #d8deea;border-radius:9px;background:#fff;color:#53627e;font-size:12px}.compare-option{display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-weight:700}.compare-option small{font-size:10px;color:#7b8aa2}';
    document.head.appendChild(style);
    render();
  }

  if (typeof document !== 'undefined') {
    ensureCompatibilityAnchors();
    const start = () => setTimeout(installCompareView, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
