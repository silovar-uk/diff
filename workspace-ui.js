/* Text Review Studio – focused workspace UI. */
(() => {
  'use strict';

  const SHOW_TAGS_KEY = 'text-review-studio-v070-show-tags-in-compare';
  const $ = (selector) => document.querySelector(selector);
  let showTags = readBoolean(SHOW_TAGS_KEY, false);
  let decorating = false;
  let lastDecorationSignature = '';

  function readBoolean(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value === 'true';
    } catch (_) {
      return fallback;
    }
  }

  function writeBoolean(key, value) {
    try { localStorage.setItem(key, String(Boolean(value))); } catch (_) { /* local only */ }
  }

  function notify(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function installStyle() {
    if ($('#workspaceUiStyle')) return;
    const style = document.createElement('style');
    style.id = 'workspaceUiStyle';
    style.textContent = `
      .title-field { display:none !important; }
      .workspace-ui-hidden { display:none !important; }
      .main-stage { min-width:0; }
      .desk-toolbar { position:sticky !important; top:0; z-index:110; min-height:64px; margin:0 !important; border-top:1px solid #e6ebf2; border-bottom:1px solid #dce3ee; box-shadow:0 8px 18px rgba(29,49,83,.08); background:rgba(255,255,255,.97) !important; backdrop-filter:blur(12px); }
      .desk-toolbar::before { content:''; position:absolute; inset:0; z-index:-1; background:rgba(255,255,255,.97); }
      .mode-switch { flex-shrink:0; }
      .workspace-ui-display-button { min-height:32px; padding:6px 10px; border:1px solid #d5dfef; border-radius:8px; color:#405779; font-size:11px; font-weight:800; background:#fff; }
      .workspace-ui-display-button:hover { border-color:#b7c8e8; color:#244d9e; background:#f3f6ff; }
      #workspaceDisplayDialog::backdrop { background:rgba(16,29,52,.28); }
      #workspaceDisplayDialog { width:min(460px,calc(100vw - 32px)); padding:0; border:0; border-radius:14px; color:#263550; box-shadow:0 18px 60px rgba(16,29,52,.24); }
      .workspace-display-card { display:grid; gap:14px; padding:18px; background:#fff; }
      .workspace-display-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .workspace-display-head p { margin:0 0 3px; color:#71819d; font-size:10px; font-weight:900; letter-spacing:.08em; }
      .workspace-display-head h2 { margin:0; color:#273957; font-size:17px; }
      .workspace-display-close { display:grid; width:30px; height:30px; place-items:center; padding:0; border:0; border-radius:8px; color:#6d7c95; font-size:18px; background:#f2f5fa; }
      .workspace-display-options { display:grid; gap:8px; }
      .workspace-display-option { display:grid; grid-template-columns:18px 1fr; gap:8px; align-items:flex-start; padding:10px 11px; border:1px solid #e3e8f1; border-radius:10px; cursor:pointer; }
      .workspace-display-option:hover { border-color:#c7d6ee; background:#fbfcff; }
      .workspace-display-option input { width:16px; height:16px; margin:1px 0 0; accent-color:#3967d8; }
      .workspace-display-option strong { display:block; color:#354963; font-size:12px; }
      .workspace-display-option small { display:block; margin-top:3px; color:#7b88a1; font-size:10px; line-height:1.5; }
      .workspace-display-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:2px; }
      .workspace-display-actions button { min-height:34px; padding:7px 12px; border-radius:8px; font-size:12px; font-weight:800; }
      .workspace-display-cancel { border:1px solid #d8e0ed; color:#566782; background:#fff; }
      .workspace-display-apply { border:1px solid #2558c7; color:#fff; background:#2f66d3; }
      .tag-display-context { display:flex; flex-wrap:wrap; gap:4px; margin:0 0 7px; }
      .tag-display-chip { display:inline-flex; max-width:100%; overflow:hidden; padding:2px 5px; border:1px solid #d9d1f0; border-radius:5px; color:#655292; font:600 10px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; white-space:nowrap; text-overflow:ellipsis; background:#fbf9ff; }
      .tag-display-context:empty { display:none; }
      @media (max-width:900px) {
        .desk-toolbar { top:0; padding:8px 10px; }.toolbar-meta .next-action,.toolbar-meta .processing-count,.toolbar-meta .quiet-button { display:none; }
        .workspace-ui-display-button { padding:6px 8px; }
      }
    `;
    document.head.appendChild(style);
  }

  function removeDistractions() {
    $('.title-field')?.classList.add('workspace-ui-hidden');
    [...document.querySelectorAll('.control-sidebar .menu-group')].forEach((group) => {
      const title = group.querySelector('summary strong')?.textContent.trim();
      if (title === 'こだわり') {
        group.classList.add('workspace-ui-hidden');
        group.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function installDisplayDialog() {
    if ($('#workspaceDisplayDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'workspaceDisplayDialog';
    dialog.innerHTML = `
      <form method="dialog" class="workspace-display-card">
        <header class="workspace-display-head">
          <div><p>DISPLAY SETTINGS</p><h2>表示</h2></div>
          <button type="button" class="workspace-display-close" data-workspace-display-close aria-label="閉じる">×</button>
        </header>
        <div class="workspace-display-options">
          <label class="workspace-display-option"><input id="workspaceShowTags" type="checkbox"><span><strong>HTMLタグを表示</strong><small>左右比較で、該当行のHTMLタグをチップで表示します。原稿編集ではHTMLを直接編集できます。</small></span></label>
          <label class="workspace-display-option"><input id="workspaceWhitespace" type="checkbox"><span><strong>空白・改行を見える化</strong><small>空白を・、全角空白を□、改行を↵として確認します。</small></span></label>
          <label class="workspace-display-option"><input id="workspaceUrls" type="checkbox"><span><strong>URL・メールを強調</strong><small>URLとメールアドレスを見つけやすくします。</small></span></label>
          <label class="workspace-display-option"><input id="workspacePending" type="checkbox"><span><strong>未確認を優先表示</strong><small>確認済みの一致行を控えめに表示します。</small></span></label>
        </div>
        <footer class="workspace-display-actions">
          <button type="button" class="workspace-display-cancel" data-workspace-display-close>キャンセル</button>
          <button type="button" class="workspace-display-apply" data-workspace-display-apply>表示を反映</button>
        </footer>
      </form>
    `;
    document.body.appendChild(dialog);

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
      if (event.target.closest('[data-workspace-display-close]')) dialog.close();
      if (event.target.closest('[data-workspace-display-apply]')) applyDisplaySettings();
    });
  }

  function mirrorStageFromCurrent() {
    $('#workspaceShowTags').checked = showTags;
    $('#workspaceWhitespace').checked = Boolean($('#showWhitespace')?.checked || $('#sideWhitespace')?.checked);
    $('#workspaceUrls').checked = Boolean($('#showUrls')?.checked || $('#sideUrls')?.checked);
    $('#workspacePending').checked = Boolean($('#pendingOnly')?.checked || $('#sidePendingOnly')?.checked);
  }

  function setNativeCheckbox(id, value) {
    const input = $(`#${id}`);
    if (!input || input.checked === value) return;
    input.checked = value;
    input.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function applyDisplaySettings() {
    const tags = $('#workspaceShowTags').checked;
    const whitespace = $('#workspaceWhitespace').checked;
    const urls = $('#workspaceUrls').checked;
    const pending = $('#workspacePending').checked;
    showTags = tags;
    writeBoolean(SHOW_TAGS_KEY, tags);
    setNativeCheckbox('showWhitespace', whitespace);
    setNativeCheckbox('showUrls', urls);
    setNativeCheckbox('pendingOnly', pending);
    setNativeCheckbox('showTags', tags);
    $('#workspaceDisplayDialog').close();
    scheduleTagDecoration(true);
    notify('表示設定を反映しました');
  }

  function openDisplayDialog() {
    installDisplayDialog();
    mirrorStageFromCurrent();
    const dialog = $('#workspaceDisplayDialog');
    if (!dialog.open) dialog.showModal();
  }

  function tagTokens(text) {
    const tokens = [];
    const re = /<\/?[A-Za-z][^>]*>/g;
    let match;
    while ((match = re.exec(String(text || '')))) tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    return tokens;
  }

  function relevantTags(tokens, start, end) {
    const nearby = [];
    const PRECEDING_WINDOW = 120;
    const FOLLOWING_WINDOW = 120;
    const preceding = tokens.filter(token => token.end <= start && start - token.end <= PRECEDING_WINDOW).slice(-2);
    const inline = tokens.filter(token => token.start >= start && token.end <= end);
    const following = tokens.filter(token => token.start >= end && token.start - end <= FOLLOWING_WINDOW).slice(0, 2);
    [...preceding, ...inline, ...following].forEach((token) => {
      if (!nearby.some(item => item.start === token.start && item.end === token.end)) nearby.push(token);
    });
    return nearby;
  }

  function tagContextHTML(tags) {
    if (!tags.length) return '';
    const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
    return `<div class="tag-display-context" aria-label="この行のHTMLタグ">${tags.map(tag => `<code class="tag-display-chip">${escape(tag.text)}</code>`).join('')}</div>`;
  }

  function decorateTags() {
    const grid = $('#difffGridRows');
    const before = $('#baselineText')?.value || '';
    const after = $('#workingText')?.value || '';
    if (!grid || !window.TextReviewDiffCore?.diffRows) return;

    grid.querySelectorAll('.tag-display-context').forEach(node => node.remove());
    if (!showTags) return;

    const options = {
      ignoreHtmlTags: $('#ignoreHtmlTagsToggle')?.checked ?? true,
      ignoreSoftFormatting: $('#ignoreSoftFormattingToggle')?.checked ?? false
    };
    const rows = window.TextReviewDiffCore.diffRows(before, after, options).rows || [];
    const beforeTags = tagTokens(before);
    const afterTags = tagTokens(after);
    decorating = true;
    rows.forEach((row, index) => {
      const visual = grid.querySelector(`[data-difff-row="${index}"]`);
      if (!visual) return;
      const beforeCell = visual.querySelector('.difff-cell.before');
      const afterCell = visual.querySelector('.difff-cell.after');
      const bTags = relevantTags(beforeTags, row.beforeStart || 0, row.beforeEnd || row.beforeStart || 0);
      const aTags = relevantTags(afterTags, row.afterStart || 0, row.afterEnd || row.afterStart || 0);
      if (beforeCell && bTags.length) beforeCell.insertAdjacentHTML('afterbegin', tagContextHTML(bTags));
      if (afterCell && aTags.length) afterCell.insertAdjacentHTML('afterbegin', tagContextHTML(aTags));
    });
    requestAnimationFrame(() => { decorating = false; });
  }

  function decorationSignature() {
    return [
      showTags,
      $('#baselineText')?.value || '',
      $('#workingText')?.value || '',
      $('#ignoreHtmlTagsToggle')?.checked ?? true,
      $('#ignoreSoftFormattingToggle')?.checked ?? false,
      $('#compareModeButton')?.classList.contains('is-active') ?? false
    ].join('\u0000');
  }

  function scheduleTagDecoration(force = false) {
    const signature = decorationSignature();
    if (!force && signature === lastDecorationSignature) return;
    lastDecorationSignature = signature;
    window.requestAnimationFrame(decorateTags);
  }

  function bind() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="toggle-display-settings"]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openDisplayDialog();
    }, true);

    ['baselineText', 'workingText', 'ignoreHtmlTagsToggle', 'ignoreSoftFormattingToggle', 'compareModeButton', 'editModeButton'].forEach((id) => {
      const target = $(`#${id}`);
      if (!target) return;
      target.addEventListener('input', scheduleTagDecoration);
      target.addEventListener('change', scheduleTagDecoration);
      target.addEventListener('click', () => window.setTimeout(scheduleTagDecoration, 0));
    });

    const grid = $('#difffGridRows');
    if (grid) {
      new MutationObserver(() => {
        if (!decorating) scheduleTagDecoration(true);
      }).observe(grid, { childList:true, subtree:false });
    }

    window.setInterval(scheduleTagDecoration, 650);
  }

  function boot() {
    installStyle();
    removeDistractions();
    installDisplayDialog();
    bind();
    window.setTimeout(() => scheduleTagDecoration(true), 240);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
