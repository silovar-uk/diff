/* Text Review Studio v1 – collapse extra blank-looking lines after invisible-character cleanup. */
(function (root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextReviewBlankCleanup = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.boot, { once: true });
    else api.boot();
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const BLANKISH_LINE_PATTERN = /^[ \t\u3000\u00A0\u2007\u202F\u00AD\u180E\u200B-\u200F\u2060\uFEFF]*$/;
  let booted = false;

  function collapseExtraBlankLines(text) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    const lines = source.split('\n');
    const output = [];
    let blankRun = 0;
    let removedLines = 0;

    lines.forEach((line) => {
      if (BLANKISH_LINE_PATTERN.test(line)) {
        blankRun += 1;
        if (blankRun > 1) {
          removedLines += 1;
          return;
        }
      } else {
        blankRun = 0;
      }
      output.push(line);
    });

    return { text: output.join('\n'), lines: removedLines };
  }

  function updateButtonLabel() {
    const button = document.querySelector('[data-replace-action="remove-invisible-characters"]');
    if (!button) return;
    button.textContent = '余分な空白を削除';
    button.title = 'スペースや見えない文字だけの行を空行として扱い、連続する空行を1行にまとめます';
  }

  function notify(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
  }

  function boot() {
    if (booted || typeof document === 'undefined') return;
    booted = true;
    updateButtonLabel();

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-replace-action="remove-invisible-characters"]');
      if (!button) return;

      // The invisible-character tool runs first. Then collapse the blank rows it exposes.
      root.setTimeout(() => {
        const editor = document.querySelector('#workingText');
        if (!editor) return;
        const result = collapseExtraBlankLines(editor.value);
        if (!result.lines) return;

        const cursor = Math.min(editor.selectionStart, result.text.length);
        editor.value = result.text;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        root.requestAnimationFrame(() => {
          editor.focus({ preventScroll: true });
          editor.setSelectionRange(cursor, cursor);
        });
        notify(`余分な空白行${result.lines}行を削除しました`);
      }, 0);
    });
  }

  return { boot, collapseExtraBlankLines };
});
