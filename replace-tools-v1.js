/* Text Review Studio v1 – search, replace, width conversion, and session history. */
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
  const ACTION_LABELS = {
    'transform-space': '空白を整理',
    'transform-symbol': '記号を統一',
    'transform-notation': '表記を統一',
    'transform-newline': '空行を整理'
  };

  let history = [];
  let booted = false;

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

  function toHalfwidthAscii(text) {
    let count = 0;
    const output = Array.from(String(text || '')).map((character) => {
      const code = character.codePointAt(0);
      if (code === 0x3000) {
        count += 1;
        return ' ';
      }
      if (code >= 0xFF01 && code <= 0xFF5E) {
        count += 1;
        return String.fromCodePoint(code - 0xFEE0);
      }
      return character;
    }).join('');
    return { text: output, count };
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
    if (entry.kind === 'width') return `全角英数・記号→半角・${entry.count}文字`;
    return `${entry.count || 1}文字程度を変更`;
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

    [...history].reverse().forEach((entry) => {
      const item = document.createElement('article');
      item.className = 'replace-history-item';
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
      item.append(head, detail);
      target.appendChild(item);
    });
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
    addHistory({ kind: 'replace', label: '次を置換', from: query, to: replacement, count: 1 });
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
    addHistory({ kind: 'replace', label: 'すべて置換', from: query, to: replacement, count: result.count });
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
    addHistory({ kind: 'width', label: '全角英数・記号を半角へ', count: result.count });
    notify(`${result.count}文字を半角へ変換しました`);
  }

  function clearHistory() {
    if (!history.length) return;
    history = [];
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
        count: countChangedSpan(before, after)
      });
    }, 0);
  }

  function boot() {
    if (booted || typeof document === 'undefined') return;
    booted = true;
    const required = ['searchInput', 'replaceInput', 'workingText', 'replaceHistory', 'replaceHistoryCount'];
    if (required.some((id) => !document.getElementById(id))) {
      console.error('Text Review Studio: replacement tools could not start because required UI is missing.');
      return;
    }

    loadHistory();
    renderHistory();

    document.addEventListener('click', (event) => {
      const action = event.target.closest('[data-replace-action]')?.dataset.replaceAction;
      if (!action) return;
      event.preventDefault();
      if (action === 'replace-next') replaceNext();
      if (action === 'replace-all') replaceAll();
      if (action === 'fullwidth-to-halfwidth') convertFullwidth();
      if (action === 'clear-history') clearHistory();
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
    toHalfwidthAscii,
    countChangedSpan
  };
});
