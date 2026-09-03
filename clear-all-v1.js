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

  function installChatGPTReviewButton() {
    if (document.querySelector('#chatgptReviewButton')) return;
    const topActions = document.querySelector('.top-actions');
    const copyWrap = topActions?.querySelector('.copy-wrap');
    if (!topActions || !copyWrap) return;

    const button = document.createElement('button');
    button.id = 'chatgptReviewButton';
    button.type = 'button';
    button.className = 'secondary-button';
    button.disabled = true;
    button.textContent = 'ChatGPTで差分意図を検討';
    button.title = '元原稿・変更版・差分一覧をChatGPTに送り、変更意図を分析します';
    button.setAttribute('aria-label', button.title);
    button.style.minHeight = '34px';
    button.style.padding = '7px 11px';
    button.style.whiteSpace = 'nowrap';
    button.style.fontSize = '11px';
    button.style.fontWeight = '800';

    topActions.insertBefore(button, copyWrap);

    const script = document.createElement('script');
    script.src = 'chatgpt-review.js';
    script.defer = true;
    document.body.appendChild(script);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-clear-all]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    clearAll();
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installChatGPTReviewButton, { once: true });
  } else {
    installChatGPTReviewButton();
  }
})();
