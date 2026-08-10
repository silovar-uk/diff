/* Text Review Studio v1 – restore visible diff text while preserving AFTER-side HTML. */
(() => {
  'use strict';

  const Diff = window.TextReviewDiffCore;
  const App = window.TextReviewApp;
  if (!Diff?._lcsDiff || !App?.getComparison || !App?.getState) return;

  const NAMED_ENTITIES = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…'
  };

  function decodeEntity(entity) {
    const match = String(entity || '').match(/^&(#x?[0-9a-f]+|[a-z]+);$/i);
    if (!match) return entity;
    const body = match[1].toLowerCase();
    if (body.startsWith('#')) {
      const code = body[1] === 'x'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : entity; } catch (_) { return entity; }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : entity;
  }

  function tokenizeVisible(rawValue) {
    const raw = String(rawValue || '');
    const tokens = [];
    let index = 0;

    while (index < raw.length) {
      if (raw.startsWith('<!--', index)) {
        const end = raw.indexOf('-->', index + 4);
        index = end >= 0 ? end + 3 : raw.length;
        continue;
      }

      const scriptOrStyle = raw.slice(index).match(/^<(script|style)\b[^>]*>/i);
      if (scriptOrStyle) {
        const tagName = scriptOrStyle[1];
        const closePattern = new RegExp(`<\\/${tagName}\\s*>`, 'ig');
        closePattern.lastIndex = index + scriptOrStyle[0].length;
        const close = closePattern.exec(raw);
        index = close ? close.index + close[0].length : raw.length;
        continue;
      }

      if (raw[index] === '<') {
        const end = raw.indexOf('>', index + 1);
        if (end >= 0) {
          index = end + 1;
          continue;
        }
      }

      if (raw[index] === '&') {
        const entityMatch = raw.slice(index).match(/^&(?:#x?[0-9a-f]+|[a-z]+);/i);
        if (entityMatch) {
          const decoded = decodeEntity(entityMatch[0]);
          if (decoded !== entityMatch[0]) {
            const chars = Array.from(decoded);
            if (chars.length === 1) {
              tokens.push({ start: index, end: index + entityMatch[0].length, char: chars[0] });
              index += entityMatch[0].length;
              continue;
            }
          }
        }
      }

      const codePoint = raw.codePointAt(index);
      const char = String.fromCodePoint(codePoint);
      tokens.push({ start: index, end: index + char.length, char });
      index += char.length;
    }

    return tokens;
  }

  function visibleText(raw) {
    return tokenizeVisible(raw).map((token) => token.char).join('');
  }

  function buildVisibleHunks(beforeVisible, afterVisible) {
    const operations = Diff._lcsDiff(Array.from(beforeVisible), Array.from(afterVisible));
    const hunks = [];
    let afterCursor = 0;
    let index = 0;

    while (index < operations.length) {
      const operation = operations[index];
      if (operation.type === 'same') {
        afterCursor += operation.values.length;
        index += 1;
        continue;
      }

      const start = afterCursor;
      const replacement = [];
      while (index < operations.length && operations[index].type !== 'same') {
        const changed = operations[index];
        if (changed.type === 'remove') replacement.push(...changed.values);
        if (changed.type === 'add') afterCursor += changed.values.length;
        index += 1;
      }
      hunks.push({ start, end: afterCursor, replacement });
    }

    return hunks;
  }

  function insertionPoint(raw, tokens, visibleIndex) {
    if (tokens.length) {
      if (visibleIndex < tokens.length) return tokens[Math.max(0, visibleIndex)].start;
      return tokens[tokens.length - 1].end;
    }

    const closingTag = raw.match(/<\/[A-Za-z][^>]*>/);
    if (closingTag) return closingTag.index;
    const newline = raw.search(/[\r\n]/);
    return newline >= 0 ? newline : raw.length;
  }

  function patchVisibleText(rawValue, beforeVisible) {
    const raw = String(rawValue || '');
    const tokens = tokenizeVisible(raw);
    const afterVisible = tokens.map((token) => token.char).join('');
    if (afterVisible === beforeVisible) return raw;

    const hunks = buildVisibleHunks(beforeVisible, afterVisible);
    const edits = [];

    hunks.forEach((hunk) => {
      const affected = tokens.slice(hunk.start, hunk.end);
      if (!affected.length) {
        const point = insertionPoint(raw, tokens, hunk.start);
        edits.push({ start: point, end: point, value: hunk.replacement.join('') });
        return;
      }

      const replacement = hunk.replacement;
      const sourceCount = affected.length;
      const targetCount = replacement.length;
      affected.forEach((token, tokenIndex) => {
        const from = Math.floor((tokenIndex * targetCount) / sourceCount);
        const to = Math.floor(((tokenIndex + 1) * targetCount) / sourceCount);
        edits.push({ start: token.start, end: token.end, value: replacement.slice(from, to).join('') });
      });
    });

    edits.sort((a, b) => b.start - a.start || b.end - a.end);
    return edits.reduce((output, edit) => (
      `${output.slice(0, edit.start)}${edit.value}${output.slice(edit.end)}`
    ), raw);
  }

  function forceUndoCheckpoint() {
    const undoEvent = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    const redoEvent = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(undoEvent);
    document.dispatchEvent(redoEvent);
  }

  function notify(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
  }

  function restoreRow(index) {
    const comparison = App.getComparison();
    const row = comparison.rows?.[index];
    if (!row || row.kind === 'same') return;

    const state = App.getState();
    const rowAfterRaw = typeof row.afterRaw === 'string'
      ? row.afterRaw
      : state.after.slice(row.afterStart || 0, row.afterEnd || row.afterStart || 0);
    const rowBeforeRaw = typeof row.beforeRaw === 'string'
      ? row.beforeRaw
      : state.before.slice(row.beforeStart || 0, row.beforeEnd || row.beforeStart || 0);

    const restoredRow = patchVisibleText(rowAfterRaw, visibleText(rowBeforeRaw));
    const start = Number.isFinite(row.afterStart) ? row.afterStart : 0;
    const end = Number.isFinite(row.afterEnd) ? row.afterEnd : start;
    const nextAfter = `${state.after.slice(0, start)}${restoredRow}${state.after.slice(end)}`;
    if (nextAfter === state.after) return;

    const editor = document.querySelector('#workingText');
    if (!editor) return;
    editor.value = nextAfter;
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    App.recalculate();
    forceUndoCheckpoint();
    notify('変更前の表記に戻しました（HTMLタグは保持）');
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-diff-index]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    restoreRow(Number(button.dataset.diffIndex));
  }, true);

  window.TextReviewRestore = {
    visibleText,
    tokenizeVisible,
    patchVisibleText,
    restoreRow
  };
})();
