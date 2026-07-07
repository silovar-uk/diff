(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const DIFFERENCE_TYPES = {
    replace: { symbol: '↔', name: '置換', hint: '置換された差分を選択' },
    insert: { symbol: '+', name: '追加', hint: '追加された行を選択' },
    delete: { symbol: '−', name: '削除', hint: '削除された行を選択' }
  };

  let activeIndex = -1;
  let renderedRows = [];
  let lastSignature = '';
  let renderTimer = 0;

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function compareIsActive() {
    return $('#compareModeButton')?.classList.contains('is-active');
  }

  function currentOptions() {
    return {
      ignoreHtmlTags: $('#ignoreHtmlTagsToggle')?.checked ?? true,
      ignoreSoftFormatting: $('#ignoreSoftFormattingToggle')?.checked ?? false
    };
  }

  function readEditors() {
    return {
      before: $('#baselineText')?.value || '',
      after: $('#workingText')?.value || ''
    };
  }

  function markerFor(kind) {
    return DIFFERENCE_TYPES[kind] || null;
  }

  function textForDisplay(value = '') {
    return String(value).replace(/\n+$/, '');
  }

  function renderInline(parts, side) {
    const html = parts.map((part) => {
      if (side === 'before' && part.type === 'add') return '';
      if (side === 'after' && part.type === 'remove') return '';
      const text = textForDisplay(part.value);
      if (!text) return '';
      if (part.type === 'same') return escapeHTML(text);
      return side === 'before'
        ? `<span class="difff-before-change">${escapeHTML(text)}</span>`
        : `<mark class="difff-after-change">${escapeHTML(text)}</mark>`;
    }).join('');
    return html || '<span class="difff-empty-cell" aria-hidden="true">&nbsp;</span>';
  }

  function textStats(value = '') {
    const normalized = String(value).replace(/\r/g, '');
    const withoutNewlines = normalized.replace(/\n/g, '');
    const withoutWhitespace = withoutNewlines.replace(/[ \t　]/g, '');
    const visible = Array.from(withoutWhitespace).length;
    const withSpaces = Array.from(withoutNewlines).length;
    const withNewlines = Array.from(normalized).length;
    const spaces = withSpaces - visible;
    const lineBreaks = withNewlines - withSpaces;
    const words = normalized.trim() ? (normalized.match(/\S+/g) || []).length : 0;
    return { visible, spaces, withSpaces, lineBreaks, withNewlines, words };
  }

  function statsHTML(value) {
    const stats = textStats(value);
    const entries = [
      ['文字数', stats.visible],
      ['空白数', stats.spaces],
      ['空白込み', stats.withSpaces],
      ['改行数', stats.lineBreaks],
      ['改行込み', stats.withNewlines],
      ['単語数', stats.words]
    ];
    return entries.map(([label, count]) => `<div class="difff-stat"><span>${label}</span><strong>${Number(count).toLocaleString('ja-JP')}</strong></div>`).join('');
  }

  function installStyle() {
    if ($('#difffRailViewStyle')) return;
    const style = document.createElement('style');
    style.id = 'difffRailViewStyle';
    style.textContent = `
      #reviewDesk.difff-grid-active > .split-workspace { display:none !important; }
      #reviewDesk.difff-grid-active > #difffGridView { display:grid !important; grid-column:1; min-width:0; min-height:658px; }
      #difffGridView { display:none; grid-template-rows:auto minmax(0,1fr) auto; min-height:0; background:#fff; }
      .difff-nav { display:flex; align-items:center; gap:8px; min-height:62px; padding:12px 16px; border-bottom:1px solid #e6ebf2; background:linear-gradient(#fff,#fbfcff); }
      .difff-nav-label { color:#72819b; font-size:10px; font-weight:900; letter-spacing:.1em; }
      .difff-nav-status { min-width:74px; color:#475a7c; font-size:12px; font-weight:800; text-align:center; font-variant-numeric:tabular-nums; }
      .difff-nav button { min-height:32px; padding:6px 10px; border:1px solid #d8dfec; border-radius:8px; color:#4a5d7d; font-size:11px; font-weight:800; background:#fff; }
      .difff-nav button:hover:not(:disabled) { border-color:#b8c8e8; color:#244d9e; background:#f3f6ff; }
      .difff-nav button:disabled { opacity:.42; cursor:not-allowed; }
      .difff-nav-help { margin-left:auto; color:#7c8aa2; font-size:11px; white-space:nowrap; }
      .difff-grid-scroll { min-height:0; overflow:auto; padding:0 0 28px; background:#fff; }
      .difff-grid-head, .difff-row { display:grid; grid-template-columns:minmax(0,1fr) 40px minmax(0,1fr); }
      .difff-grid-head { position:sticky; z-index:2; top:0; border-bottom:1px solid #e5eaf2; background:rgba(251,252,255,.97); backdrop-filter:blur(8px); }
      .difff-grid-head > div { padding:9px 16px; color:#72819b; font-size:10px; font-weight:900; letter-spacing:.08em; }
      .difff-grid-head > div:nth-child(2) { display:grid; place-items:center; padding:0; border-left:1px solid #eef1f6; border-right:1px solid #eef1f6; }
      .difff-row { align-items:stretch; border-bottom:1px solid #f0f2f6; }
      .difff-cell { min-width:0; padding:11px 17px; color:#2b3854; font-size:15px; line-height:1.92; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; }
      .difff-cell.before { background:linear-gradient(90deg,rgba(253,235,237,.14),transparent 18%); }
      .difff-cell.after { background:linear-gradient(90deg,rgba(229,246,239,.16),transparent 18%); }
      .difff-cell.is-empty { color:transparent; background:#fbfcfe; }
      .difff-rail-cell { display:grid; place-items:center; min-width:40px; border-left:1px solid #f0f2f6; border-right:1px solid #f0f2f6; background:#fbfcfe; }
      .difff-marker { display:grid; width:26px; height:26px; place-items:center; padding:0; border:1px solid transparent; border-radius:8px; font-size:14px; font-weight:900; line-height:1; background:transparent; transition:background .16s ease,border-color .16s ease,transform .16s ease; }
      .difff-marker:hover { transform:translateY(-1px); }
      .difff-marker.replace { color:#956100; background:#fff5df; }
      .difff-marker.insert { color:#126e57; background:#e5f6ef; }
      .difff-marker.delete { color:#b14352; background:#fdebed; }
      .difff-row.is-active .difff-cell.before { background:linear-gradient(90deg,rgba(253,235,237,.68),rgba(255,255,255,0) 58%); box-shadow:inset 3px 0 0 #c3505f; }
      .difff-row.is-active .difff-cell.after { background:linear-gradient(90deg,rgba(229,246,239,.84),rgba(255,255,255,0) 58%); box-shadow:inset 3px 0 0 #17725a; }
      .difff-row.is-active .difff-marker { border-color:#9fb5e4; box-shadow:0 0 0 3px rgba(57,103,216,.13); }
      .difff-before-change { color:#c3505f; background:transparent; font-weight:inherit; text-decoration:none; }
      .difff-after-change { padding:1px 2px; border-radius:3px; color:inherit; font-weight:800; background:rgba(188,234,210,.82); box-decoration-break:clone; -webkit-box-decoration-break:clone; }
      .difff-empty-cell { display:block; min-height:1.92em; }
      .difff-empty-state { display:grid; min-height:380px; place-items:center; padding:48px 24px; color:#7c8aa2; text-align:center; }
      .difff-empty-state strong { display:block; margin-bottom:6px; color:#3f5274; font-size:14px; }
      .difff-empty-state p { margin:0; font-size:12px; line-height:1.7; }
      .difff-stats-wrap { display:grid; grid-template-columns:minmax(0,1fr) 40px minmax(0,1fr); border-top:1px solid #e6ebf2; background:#f8fafc; }
      .difff-stats-spacer { border-left:1px solid #e6ebf2; border-right:1px solid #e6ebf2; }
      .difff-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1px; background:#e6ebf2; }
      .difff-stat { display:grid; gap:2px; min-width:0; padding:8px 10px; background:#fbfcfe; }
      .difff-stat span { overflow:hidden; color:#7b88a1; font-size:9px; font-weight:800; line-height:1.2; white-space:nowrap; text-overflow:ellipsis; }
      .difff-stat strong { color:#31415f; font-size:12px; font-variant-numeric:tabular-nums; line-height:1.1; }
      @media (max-width:1120px) {
        .difff-grid-head, .difff-row, .difff-stats-wrap { grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr); }
        .difff-rail-cell { min-width:34px; }.difff-cell { padding:10px 13px; font-size:14px; }.difff-nav-help{display:none}.difff-stats{grid-template-columns:repeat(2,minmax(0,1fr));}
      }
      @media (max-width:760px) {
        #reviewDesk.difff-grid-active { grid-template-columns:minmax(0,1fr) 46px; }
        .difff-grid-head, .difff-row, .difff-stats-wrap { grid-template-columns:minmax(0,1fr) 30px minmax(0,1fr); }
        .difff-grid-head > div, .difff-cell { padding-left:10px; padding-right:10px; }.difff-cell { font-size:13px; line-height:1.78; }.difff-marker{width:23px;height:23px;font-size:12px}.difff-stats{grid-template-columns:repeat(2,minmax(0,1fr));}.difff-stat{padding:7px}.difff-nav{flex-wrap:wrap;gap:6px}.difff-nav-label{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function installView() {
    if ($('#difffGridView')) return;
    const desk = $('#reviewDesk');
    const rail = $('#reviewRail');
    if (!desk || !rail) return;

    const view = document.createElement('section');
    view.id = 'difffGridView';
    view.setAttribute('aria-label', '左右比較');
    view.innerHTML = `
      <header class="difff-nav">
        <span class="difff-nav-label">DIFF RAIL</span>
        <button type="button" id="difffPrev" aria-label="前の差分へ">← 前の差分</button>
        <span id="difffNavStatus" class="difff-nav-status" aria-live="polite">差分なし</span>
        <button type="button" id="difffNext" aria-label="次の差分へ">次の差分 →</button>
        <span class="difff-nav-help">中央の記号を押すと、その差分を選択します</span>
      </header>
      <div id="difffGridScroll" class="difff-grid-scroll" tabindex="0">
        <div class="difff-grid-head" aria-hidden="true"><div>変更前</div><div>差分</div><div>修正後</div></div>
        <div id="difffGridRows"></div>
      </div>
      <footer class="difff-stats-wrap">
        <div id="difffBeforeStats" class="difff-stats" aria-label="変更前の文字数情報"></div>
        <div class="difff-stats-spacer" aria-hidden="true"></div>
        <div id="difffAfterStats" class="difff-stats" aria-label="修正後の文字数情報"></div>
      </footer>
    `;
    desk.insertBefore(view, rail);
  }

  function isBlankOnSide(row, side) {
    return side === 'before' ? !row.before : !row.after;
  }

  function rowsHTML(rows) {
    return rows.map((row, index) => {
      const marker = markerFor(row.kind);
      const beforeClasses = `difff-cell before${isBlankOnSide(row, 'before') ? ' is-empty' : ''}`;
      const afterClasses = `difff-cell after${isBlankOnSide(row, 'after') ? ' is-empty' : ''}`;
      const rail = marker
        ? `<button type="button" class="difff-marker ${row.kind}" data-difff-index="${index}" title="${marker.name}：${marker.hint}" aria-label="${marker.hint}">${marker.symbol}</button>`
        : '';
      return `
        <article class="difff-row" data-difff-row="${index}">
          <div class="${beforeClasses}">${renderInline(row.parts, 'before')}</div>
          <div class="difff-rail-cell">${rail}</div>
          <div class="${afterClasses}">${renderInline(row.parts, 'after')}</div>
        </article>
      `;
    }).join('');
  }

  function changedRowIndexes() {
    return renderedRows.reduce((indexes, row, index) => {
      if (markerFor(row.kind)) indexes.push(index);
      return indexes;
    }, []);
  }

  function updateNavigation() {
    const changed = changedRowIndexes();
    const status = $('#difffNavStatus');
    const previous = $('#difffPrev');
    const next = $('#difffNext');
    if (!status || !previous || !next) return;

    if (!changed.length) {
      status.textContent = '差分なし';
      previous.disabled = true;
      next.disabled = true;
      return;
    }

    const position = Math.max(0, changed.indexOf(activeIndex));
    status.textContent = `差分 ${position + 1} / ${changed.length}`;
    previous.disabled = changed.length < 2;
    next.disabled = changed.length < 2;
  }

  function selectRow(index, options = {}) {
    const row = renderedRows[index];
    if (!row || !markerFor(row.kind)) return;
    activeIndex = index;
    document.querySelectorAll('[data-difff-row]').forEach((node) => {
      node.classList.toggle('is-active', Number(node.dataset.difffRow) === index);
    });
    document.querySelectorAll('[data-difff-index]').forEach((node) => {
      node.classList.toggle('is-active', Number(node.dataset.difffIndex) === index);
      node.setAttribute('aria-pressed', String(Number(node.dataset.difffIndex) === index));
    });
    updateNavigation();
    if (options.scroll !== false) {
      document.querySelector(`[data-difff-row="${index}"]`)?.scrollIntoView({ block: 'center', behavior: options.behavior || 'smooth' });
    }
  }

  function move(direction) {
    const changed = changedRowIndexes();
    if (!changed.length) return;
    const current = changed.indexOf(activeIndex);
    const nextPosition = current < 0
      ? (direction > 0 ? 0 : changed.length - 1)
      : (current + direction + changed.length) % changed.length;
    selectRow(changed[nextPosition]);
  }

  function renderEmptyState(before, after) {
    const target = $('#difffGridRows');
    if (!target) return;
    const message = !before && !after
      ? ['原稿を入力してください', '変更前と修正後を入力すると、ここに差分を並べます。']
      : !before
        ? ['変更前の原稿を入力してください', '修正後だけでも編集できますが、比較には変更前の原稿が必要です。']
        : ['修正後の原稿を入力してください', '右側に修正後の原稿を入れると、差分を確認できます。'];
    target.innerHTML = `<div class="difff-empty-state"><div><strong>${message[0]}</strong><p>${message[1]}</p></div></div>`;
  }

  function render() {
    installView();
    const view = $('#difffGridView');
    const desk = $('#reviewDesk');
    const { before, after } = readEditors();
    const options = currentOptions();
    if (!view || !desk) return;

    const active = compareIsActive();
    desk.classList.toggle('difff-grid-active', active);
    view.hidden = !active;
    if (!active) return;

    $('#difffBeforeStats').innerHTML = statsHTML(before);
    $('#difffAfterStats').innerHTML = statsHTML(after);

    if (!before || !after || !window.TextReviewDiffCore?.diffRows) {
      renderedRows = [];
      activeIndex = -1;
      renderEmptyState(before, after);
      updateNavigation();
      return;
    }

    const result = window.TextReviewDiffCore.diffRows(before, after, options);
    renderedRows = result.rows || [];
    const target = $('#difffGridRows');
    target.innerHTML = rowsHTML(renderedRows);

    const changed = changedRowIndexes();
    if (!changed.includes(activeIndex)) activeIndex = changed[0] ?? -1;
    if (activeIndex >= 0) selectRow(activeIndex, { scroll: false, behavior: 'auto' });
    else updateNavigation();
  }

  function signature() {
    const { before, after } = readEditors();
    const options = currentOptions();
    return [compareIsActive(), before, after, options.ignoreHtmlTags, options.ignoreSoftFormatting].join('\u0000');
  }

  function scheduleRender() {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      const nextSignature = signature();
      if (nextSignature !== lastSignature) {
        lastSignature = nextSignature;
        render();
      }
    }, 45);
  }

  function bind() {
    const before = $('#baselineText');
    const after = $('#workingText');
    const compare = $('#compareModeButton');
    const edit = $('#editModeButton');
    const tagToggle = $('#ignoreHtmlTagsToggle');
    const softToggle = $('#ignoreSoftFormattingToggle');
    const grid = $('#difffGridView');

    [before, after, compare, edit, tagToggle, softToggle].filter(Boolean).forEach((node) => {
      const eventName = node.matches('input[type="checkbox"]') ? 'change' : 'input';
      node.addEventListener(eventName, scheduleRender);
      if (node === compare || node === edit) node.addEventListener('click', () => window.setTimeout(scheduleRender, 0));
    });

    grid?.addEventListener('click', (event) => {
      const marker = event.target.closest('[data-difff-index]');
      if (marker) {
        selectRow(Number(marker.dataset.difffIndex));
        return;
      }
      if (event.target.closest('#difffPrev')) move(-1);
      if (event.target.closest('#difffNext')) move(1);
    });

    grid?.addEventListener('keydown', (event) => {
      if (!event.altKey) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
      }
    });

    if (compare) {
      new MutationObserver(scheduleRender).observe(compare, { attributes: true, attributeFilter: ['class'] });
    }

    window.setInterval(() => {
      const nextSignature = signature();
      if (nextSignature !== lastSignature) {
        lastSignature = nextSignature;
        render();
      }
    }, 500);
  }

  function boot() {
    installStyle();
    installView();
    bind();
    lastSignature = signature();
    window.setTimeout(render, 140);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
