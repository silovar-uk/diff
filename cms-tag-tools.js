(() => {
  'use strict';

  const TAGS = {
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

  const FULLWIDTH = {
    alphabet: { label: '英字', re: /[Ａ-Ｚａ-ｚ]/g },
    number: { label: '数字', re: /[０-９]/g },
    symbol: { label: '記号', re: /[！-／：-＠［-｀｛-～]/g },
    space: { label: '空白', re: /　/g }
  };

  const $ = (selector) => document.querySelector(selector);
  let fullwidthKind = 'all';
  let lastFullwidthStart = -1;

  function toast(message) {
    const node = $('#toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('is-visible'), 2600);
  }

  function inEditMode() {
    return $('#editModeButton')?.classList.contains('is-active');
  }

  function emitInput(editor) {
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function replaceSelection(tag) {
    const editor = $('#workingText');
    if (!editor || !inEditMode()) {
      toast('CMSタグは「原稿を編集」で追加できます');
      return;
    }
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = editor.value.slice(start, end);

    if (tag.length === 2) {
      const before = editor.value.slice(0, start);
      const after = editor.value.slice(start);
      const prefix = before && !before.endsWith('\n') ? '\n' : '';
      const suffix = after && !after.startsWith('\n') ? '\n' : '';
      const insert = `${prefix}${tag[1]}${suffix}`;
      editor.value = `${before}${insert}${after}`;
      const cursor = start + insert.length;
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(cursor, cursor);
      emitInput(editor);
      return;
    }

    if (!selected) {
      toast(`${tag[0]}を付ける文字・HTMLを選択してください`);
      return;
    }
    const next = `${tag[1]}${selected}${tag[2]}`;
    editor.value = `${editor.value.slice(0, start)}${next}${editor.value.slice(end)}`;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(start, start + next.length);
    emitInput(editor);
  }

  function tagButton(id) {
    return `<button type="button" data-cms-tag="${id}">${TAGS[id][0]}</button>`;
  }

  function installTagCatalog() {
    if ($('#cmsTagCatalog')) return;
    const basic = document.querySelector('.tag-grid');
    if (!basic) return;
    basic.querySelector('[data-tag="heading"]')?.replaceChildren('見出し2');
    basic.querySelector('[data-tag="label"]')?.replaceChildren('ラベル');

    const catalog = document.createElement('div');
    catalog.id = 'cmsTagCatalog';
    catalog.innerHTML = `
      <p class="side-note" style="margin-top:10px;padding-top:9px;border-top:1px solid #edf0f5">サイト用の見出し</p>
      <div class="tag-grid">${tagButton('t1')}${tagButton('t3')}${tagButton('t3-red')}${tagButton('t3-yellow')}${tagButton('t4')}${tagButton('t4-sq')}${tagButton('t5')}</div>
      <p class="side-note" style="margin-top:10px">レイアウト・写真</p>
      <div class="tag-grid">${tagButton('photo-2col')}${tagButton('photo-3col')}${tagButton('photo-carousel')}${tagButton('bg-white')}${tagButton('bg-gray')}</div>
      <p class="side-note" style="margin-top:10px">区切り線はカーソル位置に挿入</p>
      <div class="tag-grid">${tagButton('hr1')}${tagButton('hr2')}${tagButton('hr3')}</div>
    `;
    basic.insertAdjacentElement('afterend', catalog);
  }

  function matchesFullwidth(text) {
    const matches = [];
    Object.entries(FULLWIDTH).forEach(([kind, category]) => {
      const matcher = new RegExp(category.re.source, 'g');
      let hit;
      while ((hit = matcher.exec(text))) matches.push({ kind, start: hit.index, end: hit.index + hit[0].length });
    });
    return matches.sort((a, b) => a.start - b.start);
  }

  function installInspectorStyle() {
    if ($('#fullwidthInspectorStyle')) return;
    const style = document.createElement('style');
    style.id = 'fullwidthInspectorStyle';
    style.textContent = `
      .fullwidth-inspector{display:grid;gap:7px;margin-top:10px;padding:9px 0 0;border-top:1px solid #edf0f5}
      .fullwidth-inspector-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.fullwidth-inspector-head strong{color:#465a7c;font-size:11px}
      .fullwidth-count{padding:3px 7px;border-radius:999px;color:#81580b;font-size:10px;font-weight:850;background:#fff4db}.fullwidth-status{margin:0;color:#75829a;font-size:10px;line-height:1.55}.fullwidth-status.is-clean{color:#417563}
      .fullwidth-types{display:flex;flex-wrap:wrap;gap:4px}.fullwidth-types button,.fullwidth-next{border:1px solid #e0e6f0;border-radius:7px;color:#52627e;font-size:10px;font-weight:750;background:#fff}.fullwidth-types button{padding:4px 5px}.fullwidth-types button.is-active{border-color:#c6d6f5;color:#2856aa;background:#eef4ff}.fullwidth-next{padding:6px 7px;text-align:left}.fullwidth-next:disabled{opacity:.55;cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }

  function installInspector() {
    if ($('#fullwidthInspector')) return;
    const anchor = document.querySelector('.quick-craft');
    if (!anchor) return;
    const panel = document.createElement('section');
    panel.id = 'fullwidthInspector';
    panel.className = 'fullwidth-inspector';
    panel.innerHTML = `
      <div class="fullwidth-inspector-head"><strong>全角を確認</strong><span id="fullwidthCount" class="fullwidth-count">0件</span></div>
      <p id="fullwidthStatus" class="fullwidth-status">全角英数・記号・空白を検出します</p>
      <div class="fullwidth-types">
        <button type="button" data-fullwidth-kind="all">すべて</button>
        <button type="button" data-fullwidth-kind="alphabet">英字 0</button>
        <button type="button" data-fullwidth-kind="number">数字 0</button>
        <button type="button" data-fullwidth-kind="symbol">記号 0</button>
        <button type="button" data-fullwidth-kind="space">空白 0</button>
      </div>
      <button id="fullwidthNext" class="fullwidth-next" type="button">次の全角を選択</button>
    `;
    anchor.insertAdjacentElement('afterend', panel);
  }

  function renderInspector() {
    const panel = $('#fullwidthInspector');
    const editor = $('#workingText');
    if (!panel || !editor) return;
    panel.hidden = !inEditMode();
    if (panel.hidden) return;

    const all = matchesFullwidth(editor.value);
    const counts = Object.fromEntries(Object.keys(FULLWIDTH).map((kind) => [kind, 0]));
    all.forEach((match) => { counts[match.kind] += 1; });
    $('#fullwidthCount').textContent = `${all.length}件`;
    const status = $('#fullwidthStatus');
    status.classList.toggle('is-clean', all.length === 0);
    status.textContent = all.length ? '日本語の漢字・かなは対象外。英数・記号・全角空白だけを確認します。' : '全角英数・記号・空白は見つかりませんでした。';
    Object.entries(FULLWIDTH).forEach(([kind, item]) => {
      const button = document.querySelector(`[data-fullwidth-kind="${kind}"]`);
      if (!button) return;
      button.textContent = `${item.label} ${counts[kind]}`;
      button.classList.toggle('is-active', fullwidthKind === kind);
    });
    document.querySelector('[data-fullwidth-kind="all"]')?.classList.toggle('is-active', fullwidthKind === 'all');
    const next = $('#fullwidthNext');
    next.disabled = all.length === 0;
    next.textContent = all.length ? `次の全角を選択${fullwidthKind === 'all' ? '' : `（${FULLWIDTH[fullwidthKind].label}）`}` : '検出対象はありません';
  }

  function selectNextFullwidth() {
    const editor = $('#workingText');
    if (!editor || !inEditMode()) return;
    const candidates = matchesFullwidth(editor.value).filter((item) => fullwidthKind === 'all' || item.kind === fullwidthKind);
    if (!candidates.length) return;
    const next = candidates.find((item) => item.start >= editor.selectionEnd && item.start !== lastFullwidthStart)
      || candidates.find((item) => item.start !== lastFullwidthStart)
      || candidates[0];
    lastFullwidthStart = next.start;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(next.start, next.end);
    const line = editor.value.slice(0, next.start).split('\n').length;
    editor.scrollTop = Math.max(0, (line - 4) * 29);
  }

  function configureDifffDefaults() {
    try {
      if (localStorage.getItem('text-review-studio-v069-difff-defaults') !== '1') {
        localStorage.setItem('text-review-studio-v067-ignore-soft-formatting', 'false');
        localStorage.setItem('text-review-studio-v069-difff-defaults', '1');
      }
    } catch (_) {}
  }

  function loadDifffRail() {
    if (document.querySelector('script[data-difff-rail-view]')) return;
    const script = document.createElement('script');
    script.src = 'difff-rail-view.js';
    script.defer = true;
    script.dataset.difffRailView = 'true';
    document.head.appendChild(script);
  }

  function boot() {
    configureDifffDefaults();
    installTagCatalog();
    installInspectorStyle();
    installInspector();
    loadDifffRail();

    document.addEventListener('click', (event) => {
      const tag = event.target.closest('[data-cms-tag]');
      if (tag) {
        event.preventDefault();
        replaceSelection(TAGS[tag.dataset.cmsTag]);
        return;
      }
      const filter = event.target.closest('[data-fullwidth-kind]');
      if (filter) {
        fullwidthKind = filter.dataset.fullwidthKind;
        lastFullwidthStart = -1;
        renderInspector();
        selectNextFullwidth();
        return;
      }
      if (event.target.closest('#fullwidthNext')) selectNextFullwidth();
    });

    const editor = $('#workingText');
    const edit = $('#editModeButton');
    const compare = $('#compareModeButton');
    editor?.addEventListener('input', () => { lastFullwidthStart = -1; renderInspector(); });
    [edit, compare].filter(Boolean).forEach((button) => button.addEventListener('click', () => setTimeout(renderInspector, 0)));
    if (edit) new MutationObserver(renderInspector).observe(edit, { attributes: true, attributeFilter: ['class'] });
    renderInspector();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
