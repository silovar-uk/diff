/*
 * Text Review Studio v0.6.6
 * Local-only, dependency-free diff core.
 */
(function (root) {
  'use strict';

  const MAX_LINE_CELLS = 220000;
  const MAX_CHAR_CELLS = 240000;
  const HTML_TAG_RE = /<\/?[A-Za-z][^>]*>/g;

  function compact(parts) {
    const out = [];
    for (const part of parts) {
      if (!part || !part.value) continue;
      const previous = out[out.length - 1];
      if (previous && previous.type === part.type && previous.hunkId === part.hunkId) previous.value += part.value;
      else out.push({ ...part });
    }
    return out;
  }
  function splitLines(text) {
    if (text === '') return [];
    const raw = String(text).split('\n');
    return raw.map((line, index) => index < raw.length - 1 ? `${line}\n` : line);
  }
  function splitChars(text) { return Array.from(String(text)); }
  function commonEdgeDiff(a, b) {
    let start = 0;
    const min = Math.min(a.length, b.length);
    while (start < min && a[start] === b[start]) start += 1;
    let endA = a.length - 1;
    let endB = b.length - 1;
    while (endA >= start && endB >= start && a[endA] === b[endB]) { endA -= 1; endB -= 1; }
    const parts = [];
    if (start > 0) parts.push({ type: 'same', values: a.slice(0, start) });
    if (endA >= start) parts.push({ type: 'remove', values: a.slice(start, endA + 1) });
    if (endB >= start) parts.push({ type: 'add', values: b.slice(start, endB + 1) });
    if (endA < a.length - 1) parts.push({ type: 'same', values: a.slice(endA + 1) });
    return parts;
  }
  function lcsDiff(a, b, maxCells) {
    const n = a.length;
    const m = b.length;
    if (!n && !m) return [];
    if (!n) return [{ type: 'add', values: b.slice() }];
    if (!m) return [{ type: 'remove', values: a.slice() }];
    if (n * m > maxCells) return commonEdgeDiff(a, b);
    const width = m + 1;
    const dp = new Uint32Array((n + 1) * (m + 1));
    const at = (i, j) => i * width + j;
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[at(i, j)] = a[i] === b[j] ? dp[at(i + 1, j + 1)] + 1 : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
      }
    }
    const raw = [];
    const push = (type, value) => {
      const last = raw[raw.length - 1];
      if (last && last.type === type) last.values.push(value);
      else raw.push({ type, values: [value] });
    };
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { push('same', a[i]); i += 1; j += 1; }
      else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) { push('remove', a[i]); i += 1; }
      else { push('add', b[j]); j += 1; }
    }
    while (i < n) { push('remove', a[i]); i += 1; }
    while (j < m) { push('add', b[j]); j += 1; }
    return raw;
  }
  function classifySeverity(before, after) {
    const combined = `${before}${after}`;
    if (/(https?:\/\/|www\.|@[\w.-]+\.|<\/?[A-Za-z][^>]*>|[0-9０-９]+\s*(年|月|日|時|分|円|%|％)|\b(?:AM|PM)\b)/i.test(combined)) return 'critical';
    if (/^[\s\n\r\t、。,.!！?？()（）\[\]【】「」『』]+$/u.test(combined)) return 'minor';
    return 'normal';
  }
  function textFromOps(ops) { return ops.map(op => op.values.join('')).join(''); }
  function diffChangedBlock(beforeText, afterText, hunkId, beforeStart, afterStart) {
    if (!beforeText && !afterText) return [];
    if (!beforeText) return [{ type: 'add', value: afterText, hunkId, beforeStart, afterStart }];
    if (!afterText) return [{ type: 'remove', value: beforeText, hunkId, beforeStart, afterStart }];
    const charOps = lcsDiff(splitChars(beforeText), splitChars(afterText), MAX_CHAR_CELLS);
    const parts = [];
    let bPos = beforeStart;
    let aPos = afterStart;
    for (const op of charOps) {
      const value = op.values.join('');
      if (!value) continue;
      parts.push({ type: op.type, value, hunkId: op.type === 'same' ? null : hunkId, beforeStart: bPos, afterStart: aPos });
      if (op.type !== 'add') bPos += value.length;
      if (op.type !== 'remove') aPos += value.length;
    }
    return parts;
  }
  function diffText(beforeText, afterText) {
    const before = String(beforeText || '');
    const after = String(afterText || '');
    const lineOps = lcsDiff(splitLines(before), splitLines(after), MAX_LINE_CELLS);
    const parts = [];
    const hunks = [];
    let beforePos = 0;
    let afterPos = 0;
    let index = 0;
    let hunkCounter = 0;
    while (index < lineOps.length) {
      const op = lineOps[index];
      if (op.type === 'same') {
        const value = textFromOps([op]);
        parts.push({ type: 'same', value, hunkId: null, beforeStart: beforePos, afterStart: afterPos });
        beforePos += value.length;
        afterPos += value.length;
        index += 1;
        continue;
      }
      const startBefore = beforePos;
      const startAfter = afterPos;
      let removed = '';
      let added = '';
      while (index < lineOps.length && lineOps[index].type !== 'same') {
        const current = lineOps[index];
        const value = textFromOps([current]);
        if (current.type === 'remove') { removed += value; beforePos += value.length; }
        else { added += value; afterPos += value.length; }
        index += 1;
      }
      const hunkId = `diff-${hunkCounter + 1}`;
      hunkCounter += 1;
      const kind = removed && added ? 'replace' : removed ? 'delete' : 'insert';
      hunks.push({ id: hunkId, kind, before: removed, after: added, beforeStart: startBefore, beforeEnd: startBefore + removed.length, afterStart: startAfter, afterEnd: startAfter + added.length, severity: classifySeverity(removed, added) });
      parts.push(...diffChangedBlock(removed, added, hunkId, startBefore, startAfter));
    }
    return { parts: compact(parts), hunks };
  }
  function prepareComparisonText(text, options = {}) {
    const raw = String(text || '');
    if (!options.ignoreHtmlTags) return { raw, text: raw, map: Array.from({ length: raw.length }, (_, index) => index) };
    let out = '';
    const map = [];
    let cursor = 0;
    const matcher = new RegExp(HTML_TAG_RE.source, 'g');
    let match;
    while ((match = matcher.exec(raw))) {
      for (let index = cursor; index < match.index; index += 1) { out += raw[index]; map.push(index); }
      cursor = match.index + match[0].length;
    }
    for (let index = cursor; index < raw.length; index += 1) { out += raw[index]; map.push(index); }
    return { raw, text: out, map };
  }
  function rawOffsetAt(prepared, normalizedOffset) {
    if (!prepared.text.length) return 0;
    if (normalizedOffset <= 0) return prepared.map[0] ?? 0;
    if (normalizedOffset >= prepared.text.length) return prepared.raw.length;
    return prepared.map[normalizedOffset] ?? prepared.raw.length;
  }
  function splitLineEntries(prepared) {
    const lines = splitLines(prepared.text);
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    let offset = 0;
    return lines.map((text, index) => {
      const start = offset;
      const end = start + text.length;
      offset = end;
      return { text, normalizedStart: start, normalizedEnd: end, rawStart: rawOffsetAt(prepared, start), rawEnd: rawOffsetAt(prepared, end), index };
    });
  }
  function makeRow(kind, beforeEntry, afterEntry, id, anchors = {}) {
    const before = beforeEntry?.text || '';
    const after = afterEntry?.text || '';
    const beforeStart = beforeEntry?.rawStart ?? anchors.before ?? 0;
    const beforeEnd = beforeEntry?.rawEnd ?? beforeStart;
    const afterStart = afterEntry?.rawStart ?? anchors.after ?? 0;
    const afterEnd = afterEntry?.rawEnd ?? afterStart;
    const parts = kind === 'same' ? [{ type: 'same', value: before, hunkId: null, beforeStart, afterStart }] : diffChangedBlock(before, after, id, beforeStart, afterStart);
    return { id, kind, before, after, beforeStart, beforeEnd, afterStart, afterEnd, severity: kind === 'same' ? 'minor' : classifySeverity(before, after), parts };
  }
  function diffRows(beforeText, afterText, options = {}) {
    const beforePrepared = prepareComparisonText(beforeText, options);
    const afterPrepared = prepareComparisonText(afterText, options);
    const beforeLines = splitLineEntries(beforePrepared);
    const afterLines = splitLineEntries(afterPrepared);
    const lineOps = lcsDiff(beforeLines.map(line => line.text), afterLines.map(line => line.text), MAX_LINE_CELLS);
    const rows = [];
    const hunks = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    let rowCounter = 0;
    let hunkCounter = 0;
    const anchors = () => ({ before: beforeLines[beforeIndex]?.rawStart ?? beforePrepared.raw.length, after: afterLines[afterIndex]?.rawStart ?? afterPrepared.raw.length });
    const addChangedRow = (kind, beforeEntry, afterEntry) => {
      hunkCounter += 1;
      const id = `compare-diff-${hunkCounter}`;
      const row = makeRow(kind, beforeEntry, afterEntry, id, anchors());
      rows.push(row);
      hunks.push({ id, kind, before: row.before, after: row.after, beforeStart: row.beforeStart, beforeEnd: row.beforeEnd, afterStart: row.afterStart, afterEnd: row.afterEnd, severity: row.severity });
    };
    let opIndex = 0;
    while (opIndex < lineOps.length) {
      const op = lineOps[opIndex];
      if (op.type === 'same') {
        for (let count = 0; count < op.values.length; count += 1) {
          const beforeEntry = beforeLines[beforeIndex++];
          const afterEntry = afterLines[afterIndex++];
          rowCounter += 1;
          rows.push(makeRow('same', beforeEntry, afterEntry, `compare-same-${rowCounter}`, anchors()));
        }
        opIndex += 1;
        continue;
      }
      const removed = [];
      const added = [];
      while (opIndex < lineOps.length && lineOps[opIndex].type !== 'same') {
        const changed = lineOps[opIndex];
        if (changed.type === 'remove') for (let count = 0; count < changed.values.length; count += 1) removed.push(beforeLines[beforeIndex++]);
        else for (let count = 0; count < changed.values.length; count += 1) added.push(afterLines[afterIndex++]);
        opIndex += 1;
      }
      const paired = Math.min(removed.length, added.length);
      for (let index = 0; index < paired; index += 1) addChangedRow('replace', removed[index], added[index]);
      for (let index = paired; index < removed.length; index += 1) addChangedRow('delete', removed[index], null);
      for (let index = paired; index < added.length; index += 1) addChangedRow('insert', null, added[index]);
    }
    const parts = [];
    rows.forEach(row => parts.push(...row.parts));
    return { rows, hunks, parts: compact(parts), before: beforePrepared.text, after: afterPrepared.text, ignoredTags: Boolean(options.ignoreHtmlTags) };
  }
  function reconstructBefore(parts) { return parts.filter(part => part.type !== 'add').map(part => part.value).join(''); }
  function reconstructAfter(parts) { return parts.filter(part => part.type !== 'remove').map(part => part.value).join(''); }

  const api = { diffText, diffRows, prepareComparisonText, reconstructBefore, reconstructAfter, _lcsDiff: lcsDiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextReviewDiffCore = api;

  function installCompareAddon() {
    if (typeof document === 'undefined' || document.querySelector('#v066TagIgnore')) return;
    const $ = selector => document.querySelector(selector);
    const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const trimNl = value => String(value || '').replace(/\n$/, '');
    const key = 'text-review-studio-v066-ignore-html-tags';
    let ignoreTags = true;
    let timer = 0;
    let syncing = false;
    try { ignoreTags = localStorage.getItem(key) !== 'false'; } catch (_) {}
    const compareOn = () => $('#compareModeButton')?.classList.contains('is-active');
    const partHtml = (row, side) => row.parts.map(part => {
      if ((side === 'before' && part.type === 'add') || (side === 'after' && part.type === 'remove')) return '';
      const value = trimNl(part.value);
      if (!value) return '';
      if (part.type === 'same') return esc(value);
      return side === 'before' ? `<span class="source-diff source-diff-remove">${esc(value)}</span>` : `<span class="cms-diff cms-diff-add">${esc(value)}</span>`;
    }).join('') || '&nbsp;';
    const marker = row => {
      const symbol = row.kind === 'insert' ? '+' : row.kind === 'delete' ? '−' : row.kind === 'replace' ? '↔' : '·';
      const css = row.kind === 'insert' ? 'add' : row.kind === 'delete' ? 'remove' : row.kind === 'replace' ? 'replace' : 'same';
      return `<button class="gutter-marker ${css}" data-v066-row="${esc(row.id)}" aria-label="${row.kind}">${symbol}</button>`;
    };
    const align = () => {
      const left = [...document.querySelectorAll('#baselineCompare .compare-row')];
      const right = [...document.querySelectorAll('#afterCompare .compare-row')];
      const count = Math.min(left.length, right.length);
      for (let index = 0; index < count; index += 1) left[index].style.minHeight = right[index].style.minHeight = '';
      for (let index = 0; index < count; index += 1) {
        const height = Math.max(31, Math.ceil(left[index].getBoundingClientRect().height), Math.ceil(right[index].getBoundingClientRect().height));
        left[index].style.minHeight = right[index].style.minHeight = `${height}px`;
      }
    };
    const render = () => {
      const before = $('#baselineText');
      const after = $('#workingText');
      const left = $('#baselineCompare');
      const right = $('#afterCompare');
      const gutter = $('#gutterMap');
      const control = $('#v066TagIgnore');
      if (!before || !after || !left || !right || !gutter || !control) return;
      control.hidden = !compareOn();
      if (!compareOn()) return;
      const rows = diffRows(before.value, after.value, { ignoreHtmlTags: ignoreTags }).rows;
      left.innerHTML = rows.map(row => `<div class="compare-row" data-v066-id="${esc(row.id)}">${partHtml(row, 'before')}</div>`).join('');
      right.innerHTML = rows.map(row => `<div class="compare-row" data-v066-id="${esc(row.id)}">${partHtml(row, 'after')}</div>`).join('');
      const changed = rows.filter(row => row.kind !== 'same');
      gutter.innerHTML = changed.length ? changed.map(marker).join('') : '<span class="gutter-marker same">✓</span>';
      left.hidden = false;
      right.hidden = false;
      requestAnimationFrame(align);
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 30); };
    const toolbar = $('.desk-toolbar');
    if (!toolbar) return;
    const control = document.createElement('div');
    control.id = 'v066TagIgnore';
    control.hidden = true;
    control.style.cssText = 'display:flex;align-items:center;gap:8px;margin:-2px 0 12px;padding:8px 11px;border:1px solid #d8deea;border-radius:9px;background:#fff;color:#53627e;font-size:12px';
    control.innerHTML = '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;color:#17213a;font-weight:700"><input id="v066IgnoreTags" type="checkbox"> タグを無視</label><span>&lt;&gt;内が英字で始まるHTMLタグを比較対象から外します</span>';
    toolbar.insertAdjacentElement('afterend', control);
    const checkbox = $('#v066IgnoreTags');
    checkbox.checked = ignoreTags;
    checkbox.addEventListener('change', () => { ignoreTags = checkbox.checked; try { localStorage.setItem(key, String(ignoreTags)); } catch (_) {} schedule(); });
    const before = $('#baselineText');
    const after = $('#workingText');
    const compare = $('#compareModeButton');
    const edit = $('#editModeButton');
    const left = $('#baselineCompare');
    const right = $('#afterCompare');
    const gutter = $('#gutterMap');
    if (!before || !after || !compare || !edit || !left || !right || !gutter) return;
    [before, after].forEach(node => node.addEventListener('input', schedule));
    [compare, edit].forEach(node => node.addEventListener('click', () => setTimeout(render, 0)));
    new MutationObserver(schedule).observe(compare, { attributes: true, attributeFilter: ['class'] });
    const sync = source => {
      if (syncing) return;
      syncing = true;
      const top = source.scrollTop;
      [left, right].forEach(node => { if (node !== source) node.scrollTop = top; });
      requestAnimationFrame(() => { syncing = false; });
    };
    left.addEventListener('scroll', () => sync(left), { passive: true });
    right.addEventListener('scroll', () => sync(right), { passive: true });
    gutter.addEventListener('click', event => {
      const button = event.target.closest('[data-v066-row]');
      if (!button) return;
      const id = button.dataset.v066Row;
      document.querySelectorAll('[data-v066-id], [data-v066-row]').forEach(node => node.classList.toggle('is-active', node.dataset.v066Id === id || node.dataset.v066Row === id));
      right.querySelector(`[data-v066-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    render();
  }
  if (typeof document !== 'undefined') {
    const startAddon = () => setTimeout(installCompareAddon, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAddon, { once: true });
    else startAddon();
  }
})(typeof window !== 'undefined' ? window : globalThis);
