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

  const notify = (message) => {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  };

  function addTag(id) {
    const definition = tags[id];
    const editor = document.querySelector('#workingText');
    if (!definition || !editor) return;
    if (!document.querySelector('#editModeButton')?.classList.contains('is-active')) {
      notify('CMSタグは「原稿を編集」で追加できます');
      return;
    }

    const [label, opening, closing] = definition;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    let next = editor.value;
    let selectionStart = start;
    let selectionEnd = start;

    if (closing) {
      const selected = editor.value.slice(start, end);
      if (!selected) {
        notify(`${label}を付ける文字・HTMLを選択してください`);
        return;
      }
      const replacement = `${opening}${selected}${closing}`;
      next = `${editor.value.slice(0, start)}${replacement}${editor.value.slice(end)}`;
      selectionEnd = start + replacement.length;
    } else {
      const before = editor.value.slice(0, start);
      const after = editor.value.slice(start);
      const prefix = before && !before.endsWith('\n') ? '\n' : '';
      const suffix = after && !after.startsWith('\n') ? '\n' : '';
      const insertion = `${prefix}${opening}${suffix}`;
      next = `${before}${insertion}${after}`;
      selectionStart = start + insertion.length;
      selectionEnd = selectionStart;
    }

    editor.value = next;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(selectionStart, selectionEnd);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cms-tag]');
    if (!button) return;
    event.preventDefault();
    addTag(button.dataset.cmsTag);
  });
})();
