(() => {
  'use strict';

  const tags = {
    t1: ['見出し1', '<span class="info24-t1">', '</span>'],
    t2: ['見出し2', '<span class="info24-t2">', '</span>'],
    t3: ['見出し3(グレー)', '<span class="info24-t3">', '</span>'],
    't3-red': ['見出し3(赤)', '<span class="info24-t3-red">', '</span>'],
    't3-yellow': ['見出し3(黄)', '<span class="info24-t3-yellow">', '</span>'],
    t4: ['見出し4(ダイヤ)', '<span class="info24-t4">', '</span>'],
    't4-sq': ['見出し4(スクエア)', '<span class="info24-t4-sq">', '</span>'],
    t5: ['見出し5', '<span class="info26-t5">', '</span>'],
    label: ['ラベル', '<span class="info24-label">', '</span>'],
    'photo-2col': ['写真2列', '<div class="info25__photo-2col">', '</div>'],
    'photo-3col': ['写真3列', '<div class="info25__photo-3col">', '</div>'],
    'photo-carousel': ['写真カルーセル', '<div class="info25__photo-carousel">', '</div>'],
    'bg-white': ['白背景(赤枠)', '<div class="info26__bg-white">', '</div>'],
    'bg-gray': ['グレー背景', '<div class="info26__bg-gray">', '</div>'],
    hr1: ['区切り線(赤黒)', '<hr class="info26__hr1" />'],
    hr2: ['区切り線(中央線)', '<hr class="info26__hr2" />'],
    hr3: ['区切り線(左右線)', '<hr class="info26__hr3" />']
  };

  const fullwidthCategories = {
    alphabet: { label: '英字', pattern: /[Ａ-Ｚａ-ｚ]/g },
    number: { label: '数字', pattern: /[０-９]/g },
    symbol: { label: '記号', pattern: /[！-／：-＠［-｀｛-～]/g },
    space: { label: '空白', pattern: /　/g }
  };

  const $ = (selector) => document.querySelector(selector);
  let activeFullwidthKind = 'all';
  let currentFullwidthStart = -1;

  function notify(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function inEditMode() {
    return $('#editModeButton')?.classList.contains('is-active');
  }

  function dispatchInput(editor) {
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertDivider(editor, markup) {
    const cursor = editor.selectionStart;
    const before = editor.value.slice(0, cursor);
    const after = editor.value.slice(cursor);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const suffix = after && !after.startsWith('\n') ? '\n' : '';
    const insertion = `${prefix}${markup}${suffix}`;
    editor.value = `${before}${insertion}${after}`;
    const position = cursor + insertion.length;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(position, position);
    dispatchInput(editor);
  }

  function wrapSelection(editor, tag) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = editor.value.slice(start, end);
    if (!selected) {
      notify(`${tag[0]}を付ける文字・HTMLを選択してください`);
      return;
    }
    const replacement = `${tag[1]}${selected}${tag[2]}`;
    editor.value = `${editor.value.slice(0, start)}${replacement}${editor.value.slice(end)}`;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(start, start + replacement.length);
    dispatchInput(editor);
  }

  function addTag(id) {
    const tag = tags[id];
    const editor = $('#workingText');
    if (!tag || !editor) return;
    if (!inEditMode()) {
      notify('CMSタグは「原稿を編集」で追加できます');
      return;
    }
    if (tag.length === 2) insertDivider(editor, tag[1]);
    else wrapSelection(editor, tag);
  }

  function button(id) {
    return `<button type="button" data-cms-tag="${id}">${tags[id][0]}</button>`;
  }

  function installCatalog() {
    if ($('#cmsTagCatalog')) return;
    const basicGrid = document.querySelector('.tag-grid');
    if (!basicGrid) return;

    const legacyLabel = basicGrid.querySelector('[data-tag="label"]');
    if (legacyLabel) legacyLabel.textContent = 'ラベル';
    const legacyHeading = basicGrid.querySelector('[data-tag="heading"]');
    if (legacyHeading) legacyHeading.textContent = '見出し2';

    const catalog = document.createElement('div');
    catalog.id = 'cmsTagCatalog';
    catalog.innerHTML = `
      <p class="side-note" style="margin-top:10px;padding-top:9px;border-top:1px solid #edf0f5">サイト用の見出し</p>
      <div class="tag-grid">${button('t1')}${button('t3')}${button('t3-red')}${button('t3-yellow')}${button('t4')}${button('t4-sq')}${button('t5')}</div>
      <p class="side-note" style="margin-top:10px">レイアウト・写真</p>
      <div class="tag-grid">${button('photo-2col')}${button('photo-3col')}${button('photo-carousel')}${button('bg-white')}${button('bg-gray')}</div>
      <p class="side-note" style="margin-top:10px">区切り線はカーソル位置に挿入</p>
      <div class="tag-grid">${button('hr1')}${button('hr2')}${button('hr3')}</div>
    `;
    basicGrid.insertAdjacentElement('afterend', catalog);
  }

  function installFullwidthInspectorStyle() {
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

  function installFullwidthInspector() {
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

  function fullwidthMatches(text) {
    const matches = [];
    Object.entries(fullwidthCategories).forEach(([kind, category]) => {
      const pattern = new RegExp(category.pattern.source, 'g');
      let match;
      while ((match = pattern.exec(text))) {
        matches.push({ kind, start: match.index, end: match.index + match[0].length });
      }
    });
    return matches.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function renderFullwidthInspector() {
    const panel = $('#fullwidthInspector');
    const editor = $('#workingText');
    if (!panel || !editor) return;
    panel.hidden = !inEditMode();
    if (panel.hidden) return;

    const matches = fullwidthMatches(editor.value);
    const counts = Object.fromEntries(Object.keys(fullwidthCategories).map(kind => [kind, 0]));
    matches.forEach(match => { counts[match.kind] += 1; });

    const total = matches.length;
    const badge = $('#fullwidthCount');
    const status = $('#fullwidthStatus');
    badge.textContent = `${total}件`;
    status.classList.toggle('is-clean', total === 0);
    status.textContent = total
      ? '日本語の漢字・かなは対象外。英数・記号・全角空白だけを確認します。'
      : '全角英数・記号・空白は見つかりませんでした。';

    Object.entries(fullwidthCategories).forEach(([kind, category]) => {
      const item = document.querySelector(`[data-fullwidth-kind="${kind}"]`);
      if (item) {
        item.textContent = `${category.label} ${counts[kind]}`;
        item.classList.toggle('is-active', activeFullwidthKind === kind);
      }
    });
    document.querySelector('[data-fullwidth-kind="all"]')?.classList.toggle('is-active', activeFullwidthKind === 'all');

    const nextButton = $('#fullwidthNext');
    nextButton.disabled = !total;
    nextButton.textContent = total ? `次の全角を選択${activeFullwidthKind === 'all' ? '' : `（${fullwidthCategories[activeFullwidthKind].label}）`}` : '検出対象はありません';
  }

  function selectNextFullwidth() {
    const editor = $('#workingText');
    if (!editor || !inEditMode()) return;
    const matches = fullwidthMatches(editor.value).filter(match => activeFullwidthKind === 'all' || match.kind === activeFullwidthKind);
    if (!matches.length) return;

    const cursor = editor.selectionEnd;
    const next = matches.find(match => match.start >= cursor && match.start !== currentFullwidthStart)
      || matches.find(match => match.start !== currentFullwidthStart)
      || matches[0];

    currentFullwidthStart = next.start;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(next.start, next.end);
    const line = editor.value.slice(0, next.start).split('\n').length;
    editor.scrollTop = Math.max(0, (line - 4) * 29);
  }

  function boot() {
    installCatalog();
    installFullwidthInspectorStyle();
    installFullwidthInspector();

    document.addEventListener('click', (event) => {
      const buttonElement = event.target.closest('[data-cms-tag]');
      if (buttonElement) {
        event.preventDefault();
        addTag(buttonElement.dataset.cmsTag);
        return;
      }

      const filter = event.target.closest('[data-fullwidth-kind]');
      if (filter) {
        activeFullwidthKind = filter.dataset.fullwidthKind;
        currentFullwidthStart = -1;
        renderFullwidthInspector();
        selectNextFullwidth();
        return;
      }

      if (event.target.closest('#fullwidthNext')) selectNextFullwidth();
    });

    const editor = $('#workingText');
    const editButton = $('#editModeButton');
    const compareButton = $('#compareModeButton');
    editor?.addEventListener('input', () => {
      currentFullwidthStart = -1;
      renderFullwidthInspector();
    });
    [editButton, compareButton].filter(Boolean).forEach(button => button.addEventListener('click', () => setTimeout(renderFullwidthInspector, 0)));
    if (editButton) new MutationObserver(renderFullwidthInspector).observe(editButton, { attributes: true, attributeFilter: ['class'] });
    renderFullwidthInspector();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
