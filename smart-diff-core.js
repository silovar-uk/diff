/* Text Review Studio v0.6.7 – quiet, tag-aware comparison core. */
(function (root) {
  'use strict';

  const MAX_LINE_CELLS = 180000;
  const MAX_CHAR_CELLS = 220000;
  const HTML_TAG_RE = /<\/?[A-Za-z][^>]*>/g;
  const SOFT_FORMATTING_KEY = 'text-review-studio-v067-ignore-soft-formatting';
  const IGNORE_TAGS_KEY = 'text-review-studio-v066-ignore-html-tags';

  function browserFlag(key, fallback) {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return fallback;
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value !== 'false';
    } catch (_) {
      return fallback;
    }
  }

  function resolveOptions(options) {
    const hasDom = typeof document !== 'undefined';
    return {
      ignoreHtmlTags: typeof options?.ignoreHtmlTags === 'boolean'
        ? options.ignoreHtmlTags
        : hasDom ? browserFlag(IGNORE_TAGS_KEY, true) : false,
      ignoreSoftFormatting: typeof options?.ignoreSoftFormatting === 'boolean'
        ? options.ignoreSoftFormatting
        : hasDom ? browserFlag(SOFT_FORMATTING_KEY, true) : false
    };
  }

  function compact(parts) {
    const output = [];
    for (const part of parts) {
      if (!part || !part.value) continue;
      const previous = output[output.length - 1];
      if (previous && previous.type === part.type && previous.hunkId === part.hunkId) previous.value += part.value;
      else output.push({ ...part });
    }
    return output;
  }

  function lcsDiff(a, b, maxCells) {
    const n = a.length;
    const m = b.length;
    if (!n && !m) return [];
    if (!n) return [{ type: 'add', values: b.slice() }];
    if (!m) return [{ type: 'remove', values: a.slice() }];

    if (n * m > maxCells) {
      let prefix = 0;
      const short = Math.min(n, m);
      while (prefix < short && a[prefix] === b[prefix]) prefix += 1;
      let endA = n - 1;
      let endB = m - 1;
      while (endA >= prefix && endB >= prefix && a[endA] === b[endB]) {
        endA -= 1;
        endB -= 1;
      }
      const fallback = [];
      if (prefix) fallback.push({ type: 'same', values: a.slice(0, prefix) });
      if (endA >= prefix) fallback.push({ type: 'remove', values: a.slice(prefix, endA + 1) });
      if (endB >= prefix) fallback.push({ type: 'add', values: b.slice(prefix, endB + 1) });
      if (endA < n - 1) fallback.push({ type: 'same', values: a.slice(endA + 1) });
      return fallback;
    }

    const width = m + 1;
    const matrix = new Uint32Array((n + 1) * (m + 1));
    const at = (i, j) => i * width + j;
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        matrix[at(i, j)] = a[i] === b[j]
          ? matrix[at(i + 1, j + 1)] + 1
          : Math.max(matrix[at(i + 1, j)], matrix[at(i, j + 1)]);
      }
    }

    const output = [];
    const push = (type, value) => {
      const previous = output[output.length - 1];
      if (previous && previous.type === type) previous.values.push(value);
      else output.push({ type, values: [value] });
    };

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        push('same', a[i]);
        i += 1;
        j += 1;
      } else if (matrix[at(i + 1, j)] >= matrix[at(i, j + 1)]) {
        push('remove', a[i]);
        i += 1;
      } else {
        push('add', b[j]);
        j += 1;
      }
    }
    while (i < n) {
      push('remove', a[i]);
      i += 1;
    }
    while (j < m) {
      push('add', b[j]);
      j += 1;
    }
    return output;
  }

  function isHorizontalSpace(character) {
    return character === ' ' || character === '\t';
  }

  function isAsciiWord(character) {
    return /^[A-Za-z0-9]$/.test(character || '');
  }

  function entriesWithoutTags(raw, ignoreHtmlTags) {
    const entries = [];
    if (!ignoreHtmlTags) {
      for (let index = 0; index < raw.length; index += 1) entries.push({ char: raw[index], rawIndex: index });
      return entries;
    }

    const matcher = new RegExp(HTML_TAG_RE.source, 'g');
    let cursor = 0;
    let match;
    while ((match = matcher.exec(raw))) {
      for (let index = cursor; index < match.index; index += 1) entries.push({ char: raw[index], rawIndex: index });
      cursor = match.index + match[0].length;
    }
    for (let index = cursor; index < raw.length; index += 1) entries.push({ char: raw[index], rawIndex: index });
    return entries;
  }

  function condenseSoftFormatting(entries) {
    const output = [];
    let index = 0;

    const append = (entry) => output.push(entry);
    const trimTrailingSpaces = () => {
      while (output.length && isHorizontalSpace(output[output.length - 1].char)) output.pop();
    };

    while (index < entries.length) {
      const entry = entries[index];
      if (entry.char === '\r') {
        index += 1;
        continue;
      }
      if (entry.char !== '\n') {
        append(entry);
        index += 1;
        continue;
      }

      trimTrailingSpaces();
      const firstBreak = entry;
      let lastBreak = entry;
      let breaks = 0;
      let cursor = index;
      while (cursor < entries.length) {
        if (entries[cursor].char === '\r') {
          cursor += 1;
          continue;
        }
        if (entries[cursor].char === '\n') {
          breaks += 1;
          lastBreak = entries[cursor];
          cursor += 1;
          while (cursor < entries.length && isHorizontalSpace(entries[cursor].char)) cursor += 1;
          continue;
        }
        break;
      }

      if (breaks >= 2) {
        append({ char: '\n', rawIndex: firstBreak.rawIndex });
        append({ char: '\n', rawIndex: lastBreak.rawIndex });
      } else {
        const previous = output[output.length - 1]?.char || '';
        const next = entries[cursor]?.char || '';
        if (isAsciiWord(previous) && isAsciiWord(next)) append({ char: ' ', rawIndex: firstBreak.rawIndex });
      }
      index = cursor;
    }
    return output;
  }

  function prepareComparisonText(text, options = {}) {
    const resolved = resolveOptions(options);
    const raw = String(text || '');
    const base = entriesWithoutTags(raw, resolved.ignoreHtmlTags);
    const entries = resolved.ignoreSoftFormatting ? condenseSoftFormatting(base) : base.filter(entry => entry.char !== '\r');
    return {
      raw,
      text: entries.map(entry => entry.char).join(''),
      map: entries.map(entry => entry.rawIndex),
      options: resolved
    };
  }

  function rawOffsetAt(prepared, offset) {
    if (!prepared.text.length) return 0;
    if (offset <= 0) return prepared.map[0] ?? 0;
    if (offset >= prepared.text.length) return prepared.raw.length;
    return prepared.map[offset] ?? prepared.raw.length;
  }

  function splitUnits(prepared) {
    const text = prepared.text;
    if (!text) return [];
    const separator = prepared.options.ignoreSoftFormatting ? /\n{2,}/g : /\n/g;
    const units = [];
    let start = 0;
    let match;
    while ((match = separator.exec(text))) {
      const end = match.index + match[0].length;
      units.push({
        text: text.slice(start, end),
        start,
        end,
        rawStart: rawOffsetAt(prepared, start),
        rawEnd: rawOffsetAt(prepared, end)
      });
      start = end;
    }
    if (start < text.length) {
      units.push({
        text: text.slice(start),
        start,
        end: text.length,
        rawStart: rawOffsetAt(prepared, start),
        rawEnd: rawOffsetAt(prepared, text.length)
      });
    }
    return units;
  }

  function classifySeverity(before, after) {
    const all = `${before}${after}`;
    if (/(https?:\/\/|www\.|@[\w.-]+\.|<\/?[A-Za-z][^>]*>|[0-9０-９]+\s*(年|月|日|時|分|円|%|％))/i.test(all)) return 'critical';
    if (/^[\s\n\r\t、。,.!！?？()（）\[\]【】「」『』]+$/u.test(all)) return 'minor';
    return 'normal';
  }

  function inlineDiff(beforeText, afterText, hunkId, beforeStart, afterStart) {
    if (!beforeText && !afterText) return [];
    if (!beforeText) return [{ type: 'add', value: afterText, hunkId, beforeStart, afterStart }];
    if (!afterText) return [{ type: 'remove', value: beforeText, hunkId, beforeStart, afterStart }];

    const operations = lcsDiff(Array.from(beforeText), Array.from(afterText), MAX_CHAR_CELLS);
    const commonCount = operations
      .filter(operation => operation.type === 'same')
      .reduce((count, operation) => count + operation.values.length, 0);
    const size = Math.max([...beforeText].length, [...afterText].length);
    const similarity = size ? commonCount / size : 1;

    if (size >= 18 && similarity < 0.28) {
      return [
        { type: 'remove', value: beforeText, hunkId, beforeStart, afterStart },
        { type: 'add', value: afterText, hunkId, beforeStart, afterStart }
      ];
    }

    const parts = [];
    let beforeCursor = beforeStart;
    let afterCursor = afterStart;
    for (const operation of operations) {
      const value = operation.values.join('');
      if (!value) continue;
      parts.push({
        type: operation.type,
        value,
        hunkId: operation.type === 'same' ? null : hunkId,
        beforeStart: beforeCursor,
        afterStart: afterCursor
      });
      if (operation.type !== 'add') beforeCursor += value.length;
      if (operation.type !== 'remove') afterCursor += value.length;
    }
    return parts;
  }

  function makeRow(kind, beforeUnit, afterUnit, id, anchors) {
    const before = beforeUnit?.text || '';
    const after = afterUnit?.text || '';
    const beforeStart = beforeUnit?.rawStart ?? anchors.before;
    const afterStart = afterUnit?.rawStart ?? anchors.after;
    const parts = kind === 'same'
      ? [{ type: 'same', value: before, hunkId: null, beforeStart, afterStart }]
      : inlineDiff(before, after, id, beforeStart, afterStart);
    return {
      id,
      kind,
      before,
      after,
      beforeStart,
      beforeEnd: beforeUnit?.rawEnd ?? beforeStart,
      afterStart,
      afterEnd: afterUnit?.rawEnd ?? afterStart,
      severity: kind === 'same' ? 'minor' : classifySeverity(before, after),
      parts
    };
  }

  function diffRows(beforeText, afterText, options = {}) {
    const beforePrepared = prepareComparisonText(beforeText, options);
    const afterPrepared = prepareComparisonText(afterText, options);
    const beforeUnits = splitUnits(beforePrepared);
    const afterUnits = splitUnits(afterPrepared);
    const operations = lcsDiff(beforeUnits.map(unit => unit.text), afterUnits.map(unit => unit.text), MAX_LINE_CELLS);
    const rows = [];
    const hunks = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    let sameCount = 0;
    let changeCount = 0;

    const anchors = () => ({
      before: beforeUnits[beforeIndex]?.rawStart ?? beforePrepared.raw.length,
      after: afterUnits[afterIndex]?.rawStart ?? afterPrepared.raw.length
    });

    const addRow = (kind, beforeUnit, afterUnit) => {
      const id = kind === 'same' ? `same-${++sameCount}` : `diff-${++changeCount}`;
      const row = makeRow(kind, beforeUnit, afterUnit, id, anchors());
      rows.push(row);
      if (kind !== 'same') {
        hunks.push({
          id,
          kind,
          before: row.before,
          after: row.after,
          beforeStart: row.beforeStart,
          beforeEnd: row.beforeEnd,
          afterStart: row.afterStart,
          afterEnd: row.afterEnd,
          severity: row.severity
        });
      }
    };

    let operationIndex = 0;
    while (operationIndex < operations.length) {
      const operation = operations[operationIndex];
      if (operation.type === 'same') {
        for (let count = 0; count < operation.values.length; count += 1) addRow('same', beforeUnits[beforeIndex++], afterUnits[afterIndex++]);
        operationIndex += 1;
        continue;
      }

      const removed = [];
      const added = [];
      while (operationIndex < operations.length && operations[operationIndex].type !== 'same') {
        const changed = operations[operationIndex];
        if (changed.type === 'remove') {
          for (let count = 0; count < changed.values.length; count += 1) removed.push(beforeUnits[beforeIndex++]);
        } else {
          for (let count = 0; count < changed.values.length; count += 1) added.push(afterUnits[afterIndex++]);
        }
        operationIndex += 1;
      }

      const paired = Math.min(removed.length, added.length);
      for (let count = 0; count < paired; count += 1) addRow('replace', removed[count], added[count]);
      for (let count = paired; count < removed.length; count += 1) addRow('delete', removed[count], null);
      for (let count = paired; count < added.length; count += 1) addRow('insert', null, added[count]);
    }

    return {
      rows,
      hunks,
      parts: compact(rows.flatMap(row => row.parts)),
      before: beforePrepared.text,
      after: afterPrepared.text,
      ignoredTags: beforePrepared.options.ignoreHtmlTags,
      ignoredSoftFormatting: beforePrepared.options.ignoreSoftFormatting
    };
  }

  function diffText(beforeText, afterText, options = {}) {
    const result = diffRows(beforeText, afterText, options);
    return { parts: result.parts, hunks: result.hunks };
  }

  function reconstructBefore(parts) {
    return parts.filter(part => part.type !== 'add').map(part => part.value).join('');
  }

  function reconstructAfter(parts) {
    return parts.filter(part => part.type !== 'remove').map(part => part.value).join('');
  }

  const api = { diffText, diffRows, prepareComparisonText, reconstructBefore, reconstructAfter, _lcsDiff: lcsDiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextReviewDiffCore = api;

  function ensureCompatibilityAnchors() {
    if (typeof document === 'undefined' || !document.body) return;
    const add = (parent, markup) => parent.insertAdjacentHTML('beforeend', markup);
    const afterPane = document.querySelector('.after-pane') || document.body;
    if (!document.querySelector('#searchBar')) {
      add(afterPane, '<div id="searchBar" class="search-bar" hidden><span>検索</span><input id="searchInput"><span id="searchCount">0件</span><button data-action="search-prev">←</button><button data-action="search-next">→</button><button data-action="toggle-replace">置換</button><button data-action="close-search">×</button><div id="replaceControls" hidden><input id="replaceInput"><input id="replaceProtect" type="checkbox" checked><button data-action="replace-one">1件置換</button><button data-action="replace-all">すべて置換</button></div></div>');
    }
    const ids = ['baselineEmptyText', 'workingEmptyText', 'workingMeta', 'railTotal', 'railSub', 'railDots', 'reviewCounts', 'activeReview', 'queueListCount', 'queueList', 'outputSettingsButton', 'historyButton', 'exceptionsButton', 'outputSettings', 'outputPreview', 'historyDrawer', 'historyList', 'exceptionsDrawer', 'exceptionList'];
    if (ids.some(id => !document.getElementById(id))) {
      const hidden = document.createElement('div');
      hidden.id = 'trs-compat-anchors';
      hidden.hidden = true;
      hidden.innerHTML = '<span id="baselineEmptyText"></span><span id="workingEmptyText"></span><span id="workingMeta"></span><span id="railTotal"></span><span id="railSub"></span><div id="railDots"></div><div id="reviewCounts"></div><div id="activeReview"></div><span id="queueListCount"></span><div id="queueList"></div><button id="outputSettingsButton"></button><button id="historyButton"></button><button id="exceptionsButton"></button><section id="outputSettings" hidden><pre id="outputPreview"></pre></section><section id="historyDrawer" hidden><div id="historyList"></div></section><section id="exceptionsDrawer" hidden><div id="exceptionList"></div></section>';
      document.body.appendChild(hidden);
    }
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
    const optionsBox = $('#compareOptions');
    if (!before || !after || !left || !right || !gutter || !compareButton || !editButton || !optionsBox) return;

    let timer = 0;
    let syncing = false;
    let painting = false;

    const tagToggle = $('#ignoreHtmlTagsToggle');
    let formatToggle = $('#ignoreSoftFormattingToggle');
    if (!formatToggle) {
      const label = document.createElement('label');
      label.className = 'compare-option';
      label.innerHTML = '<input id="ignoreSoftFormattingToggle" type="checkbox" /><span class="compare-option-label">行末空白・折り返しを無視</span><small>単一改行と行末空白は比較しない</small>';
      optionsBox.appendChild(label);
      formatToggle = $('#ignoreSoftFormattingToggle');
    }
    tagToggle.checked = browserFlag(IGNORE_TAGS_KEY, true);
    formatToggle.checked = browserFlag(SOFT_FORMATTING_KEY, true);

    const optionState = () => ({ ignoreHtmlTags: tagToggle.checked, ignoreSoftFormatting: formatToggle.checked });
    const isCompare = () => compareButton.classList.contains('is-active');
    const escape = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const withoutTerminalBreak = value => String(value || '').replace(/\n+$/, '');

    function inline(row, side) {
      return row.parts.map(part => {
        if (side === 'before' && part.type === 'add') return '';
        if (side === 'after' && part.type === 'remove') return '';
        const text = withoutTerminalBreak(part.value);
        if (!text) return '';
        if (part.type === 'same') return escape(text);
        return side === 'before'
          ? `<span class="source-diff source-diff-remove">${escape(text)}</span>`
          : `<mark class="cms-diff cms-diff-add">${escape(text)}</mark>`;
      }).join('') || '&nbsp;';
    }

    function alignRows() {
      const leftRows = [...left.querySelectorAll('.quiet-compare-row')];
      const rightRows = [...right.querySelectorAll('.quiet-compare-row')];
      const gutterRows = [...gutter.querySelectorAll('.quiet-gutter-row')];
      for (let index = 0; index < leftRows.length; index += 1) {
        const height = Math.max(31, Math.ceil(leftRows[index].getBoundingClientRect().height), Math.ceil(rightRows[index]?.getBoundingClientRect().height || 0));
        leftRows[index].style.minHeight = `${height}px`;
        if (rightRows[index]) rightRows[index].style.minHeight = `${height}px`;
        if (gutterRows[index]) gutterRows[index].style.minHeight = `${height}px`;
      }
    }

    function paint() {
      if (!isCompare()) {
        optionsBox.hidden = true;
        return;
      }
      optionsBox.hidden = false;
      const result = diffRows(before.value, after.value, optionState());
      painting = true;
      left.innerHTML = result.rows.map(row => `<div class="compare-row quiet-compare-row" data-quiet-row="${escape(row.id)}">${inline(row, 'before')}</div>`).join('');
      right.innerHTML = result.rows.map(row => `<div class="compare-row quiet-compare-row" data-quiet-row="${escape(row.id)}">${inline(row, 'after')}</div>`).join('');
      gutter.innerHTML = result.rows.map(row => {
        const symbol = row.kind === 'replace' ? '↔' : row.kind === 'insert' ? '+' : row.kind === 'delete' ? '−' : '';
        const kind = row.kind === 'insert' ? 'add' : row.kind === 'delete' ? 'remove' : row.kind === 'replace' ? 'replace' : 'same';
        return `<div class="quiet-gutter-row"><button class="gutter-marker ${kind}" data-quiet-jump="${escape(row.id)}" aria-label="${symbol ? '該当差分へ移動' : '一致'}">${symbol}</button></div>`;
      }).join('');
      left.hidden = false;
      right.hidden = false;
      requestAnimationFrame(() => {
        alignRows();
        painting = false;
      });
    }

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(paint, 45);
    };

    function storeAndPaint() {
      try {
        localStorage.setItem(IGNORE_TAGS_KEY, String(tagToggle.checked));
        localStorage.setItem(SOFT_FORMATTING_KEY, String(formatToggle.checked));
      } catch (_) {}
      paint();
    }

    tagToggle.addEventListener('change', storeAndPaint);
    formatToggle.addEventListener('change', storeAndPaint);
    before.addEventListener('input', schedule);
    after.addEventListener('input', schedule);
    compareButton.addEventListener('click', () => setTimeout(paint, 0));
    editButton.addEventListener('click', () => setTimeout(paint, 0));

    const observer = new MutationObserver(() => {
      if (!painting && isCompare()) schedule();
    });
    observer.observe(left, { childList: true });
    observer.observe(right, { childList: true });

    function syncScroll(source) {
      if (syncing) return;
      syncing = true;
      const top = source.scrollTop;
      [left, right, gutter].forEach(node => { if (node && node !== source) node.scrollTop = top; });
      requestAnimationFrame(() => { syncing = false; });
    }
    left.addEventListener('scroll', () => syncScroll(left), { passive: true });
    right.addEventListener('scroll', () => syncScroll(right), { passive: true });
    gutter.addEventListener('click', event => {
      const button = event.target.closest('[data-quiet-jump]');
      if (!button) return;
      const id = button.dataset.quietJump;
      document.querySelectorAll('[data-quiet-row], [data-quiet-jump]').forEach(node => node.classList.toggle('is-active', node.dataset.quietRow === id || node.dataset.quietJump === id));
      right.querySelector(`[data-quiet-row="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    const style = document.createElement('style');
    style.textContent = `
      .compare-options:not([hidden]){display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-2px 0 12px;padding:8px 11px;border:1px solid #d8deea;border-radius:9px;background:#fff;color:#53627e;font-size:12px}
      .compare-option{display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-weight:750}.compare-option small{font-size:10px;color:#7b8aa2;font-weight:500}.compare-option input{accent-color:#3967d8}
      .quiet-compare-row{white-space:pre-wrap;overflow-wrap:anywhere}.quiet-compare-row.is-active{box-shadow:inset 3px 0 0 #17725a}
      .quiet-gutter-row{display:grid;place-items:center;min-height:31px}.quiet-gutter-row .gutter-marker.same{border:0;background:transparent;pointer-events:none}.quiet-gutter-row .gutter-marker.is-active{outline:2px solid rgba(57,103,216,.32);outline-offset:1px}
    `;
    document.head.appendChild(style);
    paint();
  }

  if (typeof document !== 'undefined') {
    ensureCompatibilityAnchors();
    const start = () => setTimeout(installCompareView, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
