/* Text Review Studio v1 – lightweight full-clear action for starting a new review. */
(() => {
  'use strict';

  function notify(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function dispatchInput(field) {
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function clearAll() {
    const before = document.querySelector('#baselineText');
    const after = document.querySelector('#workingText');
    if (!before || !after) return;

    if (!before.value && !after.value) {
      notify('削除する原稿はありません');
      return;
    }

    if (!window.confirm('変更前・修正後の原稿をすべて削除しますか？')) return;

    before.value = '';
    dispatchInput(before);
    after.value = '';
    dispatchInput(after);

    const search = document.querySelector('#searchInput');
    if (search) {
      search.value = '';
      dispatchInput(search);
    }

    const replace = document.querySelector('#replaceInput');
    if (replace) replace.value = '';

    const editMode = document.querySelector('[data-action="mode-edit"]');
    if (editMode) editMode.click();

    window.requestAnimationFrame(() => before.focus({ preventScroll: true }));
    notify('変更前・修正後の原稿を削除しました');
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="clear-all"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    clearAll();
  }, true);
})();
