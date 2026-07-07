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

  const $ = (selector) => document.querySelector(selector);

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

  function boot() {
    installCatalog();
    document.addEventListener('click', (event) => {
      const buttonElement = event.target.closest('[data-cms-tag]');
      if (!buttonElement) return;
      event.preventDefault();
      addTag(buttonElement.dataset.cmsTag);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
