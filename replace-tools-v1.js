/* Text Review Studio v1 – search, replace, invisible cleanup, width conversion, and session history. */
(function (root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextReviewReplaceTools = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.boot, { once: true });
    else api.boot();
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const SESSION_KEY = 'text-review-studio-v1-replace-history';
  const MAX_HISTORY = 50;
  const MAX_VISIBLE_CHANGES = 18;
  const HALFWIDTH_EXCEPTIONS = new Set(['～', '？']);

  // ZWNJ / ZWJ are excluded here because they can be meaningful in scripts and emoji.
  const INLINE_INVISIBLE_PATTERN = /[\u00AD\u180E\u200B\u200E\u200F\u2060\uFEFF]/g;
  const SPECIAL_SPACE_PATTERN = /[\u00A0\u2007\u202F]/g;
  const BLANKISH_LINE_PATTERN = /^[ \t\u3000\u00A0\u2007\u202F\u00AD\u180E\u200B-\u200F\u2060\uFEFF]+$/;

  const ACTION_LABELS = {
    'transform-space': '空白を整理',
    'transform-symbol': '記号を統一',
    'transform-notation': '表記を統一',
    'transform-newline': '空行を整理'
  };

  let history = [];
  let booted = false;
  const expandedHistoryIds = new Set();

  function $(selector) {
    return document.querySelector(selector);
  }

  function notify(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = root.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function replaceAllLiteral(text, query, replacement) {
    const source = String(text || '');
    const needle = String(query || '');
    if (!needle) return { text: source, count: 0 };

    let cursor = 0;
    let count = 0;
    let output = '';
    while (cursor <= source.length) {
      const found = source.indexOf(needle, cursor);
      if (found < 0) {
        output += source.slice(cursor);
        break;
      }
      output += source.slice(cursor, found) + replacement;
      cursor = found + needle.length;
      count += 1;
    }
    return { text: output, count };
  }

  function replaceOneAtOrAfter(text, query, replacement, start = 0, selectionStart = -1, selectionEnd = -1) {
    const source = String(text || '');
    const needle = String(query || '');
    if (!needle) return { text: source, count: 0, start: -1, end: -1, wrapped: false };

    let found = -1;
    let wrapped = false;
    if (selectionStart >= 0 && selectionEnd >= selectionStart && source.slice(selectionStart, selectionEnd) === needle) {
      found = selectionStart;
    } else {
      found = source.indexOf(needle, Math.max(0, start));
      if (found < 0 && start > 0) {
        found = source.indexOf(needle, 0);
        wrapped = found >= 0;
      }
    }

    if (found < 0) return { text: source, count: 0, start: -1, end: -1, wrapped: false };
    const next = source.slice(0, found) + replacement + source.slice(found + needle.length);
    return { text: next, count: 1, start: found, end: found + String(replacement).length, wrapped };
  }

  function recordChange(changes, from, to) {
    const key = `${from}\u0000${to}`;
    const current = changes.get(key) || { from, to, count: 0 };
    current.count += 1;
    changes.set(key, current);
  }

  function collectChangeBlock(changes, removedValues, addedValues) {
    const removed = Array.from(removedValues || '');
    const added = Array.from(addedValues || '');
    const length = Math.max(removed.length, added.length);
    for (let index = 0; index < length; index += 1) {
      const from = removed[index] || '';
      const to = added[index] || '';
      if (from !== to) recordChange(changes, from, to);
    }
  }

  function fallbackCharacterDiff(before, after) {
    const left = Array.from(before);
    const right = Array.from(after);
    const n = left.length;
    const m = right.length;
    const parts = [];
    const push = (type, value) => {
      if (!value) return;
      const previous = parts[parts.length - 1];
      if (previous && previous.type === type) previous.value += value;
      else parts.push({ type, value });
    };

    if (n * m <= 220000) {
      const width = m + 1;
      const matrix = new Uint32Array((n + 1) * (m + 1));
      const at = (i, j) => i * width + j;
      for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
          matrix[at(i, j)] = left[i] === right[j]
            ? matrix[at(i + 1, j + 1)] + 1
            : Math.max(matrix[at(i + 1, j)], matrix[at(i, j + 1)]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (left[i] === right[j]) {
          push('same', left[i]);
          i += 1;
          j += 1;
        } else if (matrix[at(i + 1, j)] >= matrix[at(i, j + 1)]) {
          push('remove', left[i++]);
        } else {
          push('add', right[j++]);
        }
      }
      while (i < n) push('remove', left[i++]);
      while (j < m) push('add', right[j++]);
      return parts;
    }

    let prefix = 0;
    const short = Math.min(n, m);
    while (prefix < short && left[prefix] === right[prefix]) prefix += 1;
    let endLeft = n - 1;
    let endRight = m - 1;
    while (endLeft >= prefix && endRight >= prefix && left[endLeft] === right[endRight]) {
      endLeft -= 1;
      endRight -= 1;
    }
    push('same', left.slice(0, prefix).join(''));
    push('remove', left.slice(prefix, endLeft + 1).join(''));
    push('add', right.slice(prefix, endRight + 1).join(''));
    push('same', left.slice(endLeft + 1).join(''));
    return parts;
  }

  function changeParts(before, after) {
    const core = root.TextReviewDiffCore;
    if (core && typeof core.diffText === 'function') {
      try {
        const result = core.diffText(before, after, { ignoreHtmlTags: false });
        if (Array.isArray(result?.parts)) return result.parts;
      } catch (_) { /* Fall through to the smaller character diff. */ }
    }

    if (core && typeof core._lcsDiff === 'function') {
      try {
        return core._lcsDiff(Array.from(before), Array.from(after)).map((part) => ({
          type: part.type,
          value: Array.isArray(part.values) ? part.values.join('') : String(part.value || '')
        }));
      } catch (_) { /* Fall through to the local character diff. */ }
    }

    return fallbackCharacterDiff(before, after);
  }

  function summarizeTextChanges(beforeText, afterText) {
    const before = String(beforeText || '');
    const after = String(afterText || '');
    if (before === after) return [];

    const changes = new Map();
    const parts = changeParts(before, after);
    let removed = '';
    let added = '';
    const flush = () => {
      collectChangeBlock(changes, removed, added);
      removed = '';
      added = '';
    };

    parts.forEach((part) => {
      const value = Array.isArray(part.values) ? part.values.join('') : String(part.value || '');
      if (part.type === 'same') {
        flush();
        return;
      }
      if (part.type === 'remove') removed += value;
      if (part.type === 'add') added += value;
    });
    flush();
    return [...changes.values()];
  }

  function toHalfwidthAscii(text) {
    let count = 0;
    const changes = new Map();
    const output = Array.from(String(text || '')).map((character) => {
      if (HALFWIDTH_EXCEPTIONS.has(character)) return character;

      const code = character.codePointAt(0);
      let converted = character;
      if (code === 0x3000) converted = ' ';
      if (code >= 0xFF01 && code <= 0xFF5E) converted = String.fromCodePoint(code - 0xFEE0);
      if (converted === character) return character;

      count += 1;
      recordChange(changes, character, converted);
      return converted;
    }).join('');
    return { text: output, count, changes: [...changes.values()] };
  }

  function removeInvisibleCharacters(text) {
    const parts = String(text || '').split(/(\r\n|\r|\n)/);
    const changes = new Map();
    let count = 0;
    let lines = 0;

    for (let index = 0; index < parts.length; index += 2) {
      const line = parts[index];
      if (!line) continue;

      if (BLANKISH_LINE_PATTERN.test(line)) {
        Array.from(line).forEach((character) => recordChange(changes, character, ''));
        count += Array.from(line).length;
        lines += 1;
        parts[index] = '';
        continue;
      }

      let lineChanges = 0;
      let cleaned = line.replace(INLINE_INVISIBLE_PATTERN, (character) => {
        recordChange(changes, character, '');
        count += 1;
        lineChanges += 1;
        return '';
      });
      cleaned = cleaned.replace(SPECIAL_SPACE_PATTERN, (character) => {
        recordChange(changes, character, ' ');
        count += 1;
        lineChanges += 1;
        return ' ';
      });

      if (lineChanges) {
        lines += 1;
        parts[index] = cleaned;
      }
    }

    return { text: parts.join(''), count, lines, changes: [...changes.values()] };
  }

  // Compatibility alias for callers from the first cleanup implementation.
  function removeWhitespaceOnlyLines(text) {
    return removeInvisibleCharacters(text);
  }

  function countChangedSpan(before, after) {
    const left = String(before || '');
    const right = String(after || '');
    let prefix = 0;
    const limit = Math.min(left.length, right.length);
    while (prefix < limit && left[prefix] === right[prefix]) prefix += 1;
    let leftEnd = left.length - 1;
    let rightEnd = right.length - 1;
    while (leftEnd >= prefix && rightEnd >= prefix && left[leftEnd] === right[rightEnd]) {
      leftEnd -= 1;
      rightEnd -= 1;
    }
    return Math.max(leftEnd - prefix + 1, rightEnd - prefix + 1, 0);
  }

  function compactValue(value, max = 34) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ');
    return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
  }

  function visibleCharacter(value) {
    const labels = {
      '': '削除',
      ' ': '半角スペース',
      '　': '全角スペース',
      '\t': 'タブ',
      '\n': '改行',
      '\r': '復帰',
      '\u00A0': 'NBSP',
      '\u2007': '数字幅スペース',
      '\u202F': '細い改行禁止スペース',
      '\u00AD': 'ソフトハイフン',
      '\u180E': 'モンゴル語母音区切り',
      '\u200B': 'ゼロ幅スペース',
      '\u200C': 'ゼロ幅非接合子',
      '\u200D': 'ゼロ幅接合子',
      '\u200E': '左から右マーク',
      '\u200F': '右から左マーク',
      '\u2060': 'ワードジョイナー',
      '\uFEFF': 'BOM'
    };
    return labels[value] || String(value ?? '');
  }

  function timeLabel(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
  }

  function loadHistory() {
    try {
      const parsed = JSON.parse(root.sessionStorage?.getItem(SESSION_KEY) || '[]');
      history = Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
    } catch (_) {
      history = [];
    }
  }

  function saveHistory() {
    try {
      root.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
    } catch (_) { /* Session history is optional. */ }
  }

  function addHistory(entry) {
    history.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      ...entry
    });
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
    saveHistory();
    renderHistory();
  }

  function historyDescription(entry) {
    if (entry.kind === 'replace') {
      return `「${compactValue(entry.from)}」→「${compactValue(entry.to)}」・${entry.count}件`;
    }
    if (entry.kind === 'width') {
      const types = Array.isArray(entry.changes) ? entry.changes.length : 0;
      return types ? `${entry.count}文字を半角へ変換・${types}種類` : `全角英数・記号→半角・${entry.count}文字`;
    }
    if (entry.kind === 'invisible') {
      const types = Array.isArray(entry.changes) ? entry.changes.length : 0;
      return `${entry.lines}行・${entry.count}文字を削除／整理${types ? `・${types}種類` : ''}`;
    }
    if (entry.kind === 'blank-line-whitespace') {
      return `${entry.lines}行から空白${entry.count}文字を削除`;
    }
    if (entry.kind === 'transform') {
      const types = Array.isArray(entry.changes) ? entry.changes.length : 0;
      return `${entry.count || 1}文字程度を変更${types ? `・${types}種類` : ''}`;
    }
    return `${entry.count || 1}文字程度を変更`;
  }

  function createChangeList(entry) {
    if (!Array.isArray(entry.changes) || !entry.changes.length) return null;
    const list = document.createElement('div');
    list.className = 'replace-history-changes';
    list.setAttribute('aria-label', '変更した文字の一覧');

    entry.changes.slice(0, MAX_VISIBLE_CHANGES).forEach((change) => {
      const chip = document.createElement('span');
      chip.className = 'replace-history-change';
      const from = document.createElement('b');
      from.textContent = visibleCharacter(change.from);
      const arrow = document.createElement('span');
      arrow.textContent = '→';
      const to = document.createElement('b');
      to.textContent = visibleCharacter(change.to);
      const amount = document.createElement('small');
      amount.textContent = `×${change.count}`;
      chip.append(from, arrow, to, amount);
      list.appendChild(chip);
    });

    if (entry.changes.length > MAX_VISIBLE_CHANGES) {
      const rest = document.createElement('span');
      rest.className = 'replace-history-change is-rest';
      rest.textContent = `ほか${entry.changes.length - MAX_VISIBLE_CHANGES}種類`;
      list.appendChild(rest);
    }
    return list;
  }

  function createHistoryToggle(entry, isLatest, hasChanges) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-toggle-button';

    if (!hasChanges) {
      button.textContent = '変更文字の記録なし';
      button.disabled = true;
      return button;
    }

    button.dataset.replaceAction = 'toggle-history-changes';
    button.dataset.historyId = entry.id;
    button.setAttribute('aria-expanded', isLatest || expandedHistoryIds.has(entry.id) ? 'true' : 'false');
    if (isLatest) {
      button.textContent = '最新の変更文字を表示中';
      button.disabled = true;
    } else {
      button.textContent = expandedHistoryIds.has(entry.id) ? '変更文字を閉じる' : '変更文字を確認';
    }
    return button;
  }

  function renderHistory() {
    const target = $('#replaceHistory');
    const count = $('#replaceHistoryCount');
    if (!target || !count) return;
    count.textContent = `${history.length}件`;
    target.replaceChildren();

    if (!history.length) {
      const empty = document.createElement('p');
      empty.className = 'replace-history-empty';
      empty.textContent = 'このタブで行った置換・一括変換がここに残ります。';
      target.appendChild(empty);
      return;
    }

    [...history].reverse().forEach((entry, index) => {
      const isLatest = index === 0;
      const item = document.createElement('article');
      item.className = `replace-history-item${isLatest ? ' is-latest' : ''}`;
      item.dataset.historyId = entry.id;

      const head = document.createElement('div');
      head.className = 'replace-history-head';
      const title = document.createElement('strong');
      title.textContent = entry.label;
      const time = document.createElement('time');
      time.dateTime = entry.at;
      time.textContent = timeLabel(entry.at);
      head.append(title, time);

      const detail = document.createElement('p');
      detail.textContent = historyDescription(entry);
      const changes = createChangeList(entry);
      const toggleRow = document.createElement('div');
      toggleRow.className = 'history-toggle-row';
      toggleRow.appendChild(createHistoryToggle(entry, isLatest, Boolean(changes)));
      item.append(head, detail, toggleRow);

      if (changes) {
        changes.hidden = !isLatest && !expandedHistoryIds.has(entry.id);
        item.appendChild(changes);
      }
      target.appendChild(item);
    });
  }

  function toggleHistoryChanges(historyId) {
    if (!historyId || history[history.length - 1]?.id === historyId) return;
    if (expandedHistoryIds.has(historyId)) expandedHistoryIds.delete(historyId);
    else expandedHistoryIds.add(historyId);
    renderHistory();
  }

  function dispatchEditorInput(editor, nextText, selectionStart, selectionEnd) {
    editor.value = nextText;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    root.requestAnimationFrame(() => {
      editor.focus({ preventScroll: true });
      if (Number.isFinite(selectionStart)) editor.setSelectionRange(selectionStart, Number.isFinite(selectionEnd) ? selectionEnd : selectionStart);
    });
  }

  function searchValues() {
    return {
      query: $('#searchInput')?.value || '',
      replacement: $('#replaceInput')?.value || '',
      editor: $('#workingText')
    };
  }

  function replaceNext() {
    const { query, replacement, editor } = searchValues();
    if (!editor) return;
    if (!query) {
      notify('検索する文字列を入力してください');
      $('#searchInput')?.focus();
      return;
    }

    const result = replaceOneAtOrAfter(
      editor.value,
      query,
      replacement,
      editor.selectionEnd,
      editor.selectionStart,
      editor.selectionEnd
    );
    if (!result.count) {
      notify('置換できる文字列がありません');
      return;
    }

    dispatchEditorInput(editor, result.text, result.start, result.end);
    addHistory({
      kind: 'replace',
      label: '次を置換',
      from: query,
      to: replacement,
      count: 1,
      changes: [{ from: query, to: replacement, count: 1 }]
    });
    notify(result.wrapped ? '先頭へ戻って1件置換しました' : '1件置換しました');
  }

  function replaceAll() {
    const { query, replacement, editor } = searchValues();
    if (!editor) return;
    if (!query) {
      notify('検索する文字列を入力してください');
      $('#searchInput')?.focus();
      return;
    }

    const result = replaceAllLiteral(editor.value, query, replacement);
    if (!result.count) {
      notify('置換できる文字列がありません');
      return;
    }

    dispatchEditorInput(editor, result.text, 0, 0);
    addHistory({
      kind: 'replace',
      label: 'すべて置換',
      from: query,
      to: replacement,
      count: result.count,
      changes: [{ from: query, to: replacement, count: result.count }]
    });
    notify(`${result.count}件置換しました`);
  }

  function convertFullwidth() {
    const editor = $('#workingText');
    if (!editor) return;
    const result = toHalfwidthAscii(editor.value);
    if (!result.count) {
      notify('半角へ変換できる全角英数・記号はありません');
      return;
    }

    const cursor = editor.selectionStart;
    dispatchEditorInput(editor, result.text, Math.min(cursor, result.text.length), Math.min(cursor, result.text.length));
    addHistory({ kind: 'width', label: '全角を半角へ', count: result.count, changes: result.changes });
    notify(`${result.count}文字を半角へ変換しました（～・？は対象外）`);
  }

  function cleanupInvisibleCharacters() {
    const editor = $('#workingText');
    if (!editor) return;
    const result = removeInvisibleCharacters(editor.value);
    if (!result.count) {
      notify('削除・整理できる見えない文字はありません');
      return;
    }

    const cursor = editor.selectionStart;
    dispatchEditorInput(editor, result.text, Math.min(cursor, result.text.length), Math.min(cursor, result.text.length));
    addHistory({
      kind: 'invisible',
      label: '見えない文字を削除',
      count: result.count,
      lines: result.lines,
      changes: result.changes
    });
    notify(`${result.lines}行から見えない文字${result.count}文字を削除・整理しました`);
  }

  function clearHistory() {
    if (!history.length) return;
    history = [];
    expandedHistoryIds.clear();
    saveHistory();
    renderHistory();
    notify('今回の置換履歴を消去しました');
  }

  function watchQuickPolish(event) {
    const button = event.target.closest('[data-action^="transform-"]');
    if (!button || !ACTION_LABELS[button.dataset.action]) return;
    const editor = $('#workingText');
    if (!editor) return;
    const before = editor.value;
    root.setTimeout(() => {
      const after = editor.value;
      if (before === after) return;
      addHistory({
        kind: 'transform',
        label: ACTION_LABELS[button.dataset.action],
        count: countChangedSpan(before, after),
        changes: summarizeTextChanges(before, after)
      });
    }, 0);
  }

  function ensureInvisibleCleanupButton() {
    const grid = document.querySelector('.tool-grid');
    if (!grid || grid.querySelector('[data-replace-action="remove-invisible-characters"]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.replaceAction = 'remove-invisible-characters';
    button.textContent = '見えない文字を削除';
    button.title = '空行は残したまま、ゼロ幅スペース、NBSP、BOMや、空行に紛れたスペース・タブを削除します';
    button.style.gridColumn = '1 / -1';
    grid.appendChild(button);

    const countLabel = grid.closest('.tool-section')?.querySelector('summary em');
    if (countLabel) countLabel.textContent = `${grid.querySelectorAll('button').length}項目`;
  }

  function boot() {
    if (booted || typeof document === 'undefined') return;
    booted = true;
    const required = ['searchInput', 'replaceInput', 'workingText', 'replaceHistory', 'replaceHistoryCount'];
    if (required.some((id) => !document.getElementById(id))) {
      console.error('Text Review Studio: replacement tools could not start because required UI is missing.');
      return;
    }

    ensureInvisibleCleanupButton();
    loadHistory();
    renderHistory();

    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-replace-action]');
      const action = target?.dataset.replaceAction;
      if (!action) return;
      event.preventDefault();
      if (action === 'replace-next') replaceNext();
      if (action === 'replace-all') replaceAll();
      if (action === 'fullwidth-to-halfwidth') convertFullwidth();
      if (action === 'remove-invisible-characters') cleanupInvisibleCharacters();
      if (action === 'clear-history') clearHistory();
      if (action === 'toggle-history-changes') toggleHistoryChanges(target.dataset.historyId);
    });
    document.addEventListener('click', watchQuickPolish, true);

    $('#replaceInput').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.shiftKey ? replaceAll() : replaceNext();
    });
  }

  return {
    boot,
    replaceAllLiteral,
    replaceOneAtOrAfter,
    summarizeTextChanges,
    toHalfwidthAscii,
    removeInvisibleCharacters,
    removeWhitespaceOnlyLines,
    countChangedSpan,
    visibleCharacter
  };
});
