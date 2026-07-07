(() => {
  'use strict';

  const categories = {
    alphabet: { label: '英字', pattern: /[Ａ-Ｚａ-ｚ]/g },
    number: { label: '数字', pattern: /[０-９]/g },
    symbol: { label: '記号', pattern: /[！-／：-＠［-｀｛-～]/g },
    space: { label: '空白', pattern: /　/g }
  };

  const $ = (selector) => document.querySelector(selector);
  let activeKind = 'all';
  let currentStart = -1;

  function collect(text) {
    const matches = [];
    Object.entries(categories).forEach(([kind, category]) => {
      const pattern = new RegExp(category.pattern.source, 'g');
      let match;
      while ((match = pattern.exec(text))) {
        matches.push({ kind, start: match.index, end: match.index + match[0].length, value: match[0] });
      }
    });
    return matches.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function inEditMode() {
    return $('#editModeButton')?.classList.contains('is-active');
  }

  function installStyle() {
    if ($('#fullwidthInspectorStyle')) return;
    const style = document.createElement('style');
    style.id = 'fullwidthInspectorStyle';
    style.textContent = `
      .fullwidth-inspector{display:grid;gap:7px;margin-top:10px;padding:9px 0 0;border-top:1px solid #edf0f5}
      .fullwidth-inspector-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .fullwidth-inspector-head strong{color:#465a7c;font-size:11px}.fullwidth-count{padding:3px 7px;border-radius:999px;color:#81580b;font-size:10px;font-weight:850;background:#fff4db}
      .fullwidth-status{margin:0;color:#75829a;font-size:10px;line-height:1.55}.fullwidth-status.is-clean{color:#417563}
      .fullwidth-types{display:flex;flex-wrap:wrap;gap:4px}.fullwidth-types button,.fullwidth-next{border:1px solid #e0e6f0;border-radius:7px;color:#52627e;font-size:10px;font-weight:750;background:#fff}
      .fullwidth-types button{padding:4px 5px}.fullwidth-types button.is-active{border-color:#c6d6f5;color:#2856aa;background:#eef4ff}.fullwidth-next{padding:6px 7px;text-align:left}.fullwidth-next:disabled{opacity:.55;cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    if ($('#fullwidthInspector')) return;
    const quickCraft = document.querySelector('.quick-craft');
    if (!quickCraft) return;
    const panel = document.createElement('section');
    panel.id = 'fullwidthInspector';
    panel.className = 'fullwidth-inspector';
    panel.innerHTML = `
      <div class="fullwidth-inspector-head"><strong>全角を確認</strong><span id="fullwidthCount" class="fullwidth-count">0件</span></div>
      <p id="fullwidthStatus" class="fullwidth-status">全角英数・記号・空白を検出します</p>
      <div id="fullwidthTypes" class="fullwidth-types">
        <button type="button" data-fullwidth-kind="all">すべて</button>
        <button type="button" data-fullwidth-kind="alphabet">英字 0</button>
        <button type="button" data-fullwidth-kind="number">数字 0</button>
        <button type="button" data-fullwidth-kind="symbol">記号 0</button>
        <button type="button" data-fullwidth-kind="space">空白 0</button>
      </div>
      <button id="fullwidthNext" class="fullwidth-next" type="button">次の全角を選択</button>
    `;
    quickCraft.insertAdjacentElement('afterend', panel);
  }

  function render() {
    const panel = $('#fullwidthInspector');
    const editor = $('#workingText');
    if (!panel || !editor) return;
    panel.hidden = !inEditMode();
    if (panel.hidden) return;

    const matches = collect(editor.value);
    const countByKind = Object.fromEntries(Object.keys(categories).map(kind => [kind, 0]));
    matches.forEach(match => { countByKind[match.kind] += 1; });

    const count = matches.length;
    const status = $('#fullwidthStatus');
    const badge = $('#fullwidthCount');
    badge.textContent = `${count}件`;
    status.classList.toggle('is-clean', count === 0);
    status.textContent = count
      ? '日本語の漢字・かなは対象外。英数・記号・全角空白だけを確認します。'
      : '全角英数・記号・空白は見つかりませんでした。';

    Object.entries(categories).forEach(([kind, category]) => {
      const button = document.querySelector(`[data-fullwidth-kind="${kind}"]`);
      if (button) {
        button.textContent = `${category.label} ${countByKind[kind]}`;
        button.classList.toggle('is-active', activeKind === kind);
      }
    });
    document.querySelector('[data-fullwidth-kind="all"]')?.classList.toggle('is-active', activeKind === 'all');

    const next = $('#fullwidthNext');
    next.disabled = !count;
    next.textContent = count ? `次の全角を選択${activeKind === 'all' ? '' : `（${categories[activeKind].label}）`}` : '検出対象はありません';
  }

  function selectNext() {
    const editor = $('#workingText');
    if (!editor || !inEditMode()) return;
    const matches = collect(editor.value).filter(match => activeKind === 'all' || match.kind === activeKind);
    if (!matches.length) return;

    const cursor = editor.selectionEnd;
    const next = matches.find(match => match.start >= cursor && match.start !== currentStart)
      || matches.find(match => match.start !== currentStart)
      || matches[0];

    currentStart = next.start;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(next.start, next.end);
    const line = editor.value.slice(0, next.start).split('\n').length;
    editor.scrollTop = Math.max(0, (line - 4) * 29);
  }

  function boot() {
    installStyle();
    installPanel();
    const editor = $('#workingText');
    const edit = $('#editModeButton');
    const compare = $('#compareModeButton');
    if (!editor || !edit || !compare) return;

    editor.addEventListener('input', () => {
      currentStart = -1;
      render();
    });
    [edit, compare].forEach(button => button.addEventListener('click', () => setTimeout(render, 0)));
    document.addEventListener('click', event => {
      const filter = event.target.closest('[data-fullwidth-kind]');
      if (filter) {
        activeKind = filter.dataset.fullwidthKind;
        currentStart = -1;
        render();
        selectNext();
        return;
      }
      if (event.target.closest('#fullwidthNext')) selectNext();
    });
    new MutationObserver(render).observe(edit, { attributes: true, attributeFilter: ['class'] });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
