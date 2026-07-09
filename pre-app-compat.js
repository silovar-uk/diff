/* Text Review Studio – pre-app DOM compatibility anchors. */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);

  function hiddenRoot() {
    let root = $('#preAppCompatAnchors');
    if (!root) {
      root = document.createElement('div');
      root.id = 'preAppCompatAnchors';
      root.hidden = true;
      document.body.appendChild(root);
    }
    return root;
  }

  function ensureHTML(id, html) {
    if (document.getElementById(id)) return document.getElementById(id);
    const root = hiddenRoot();
    root.insertAdjacentHTML('beforeend', html);
    return document.getElementById(id);
  }

  function ensureButtonClass(className, html) {
    const found = document.querySelector(`.${className}`);
    if (found) return found;
    const root = hiddenRoot();
    root.insertAdjacentHTML('beforeend', html);
    return document.querySelector(`.${className}`);
  }

  // app.js still expects this optional legend toggle from an older shell.
  // The current UI uses a different comparison view, so keep a hidden inert
  // button to satisfy aria updates without showing extra chrome.
  ensureButtonClass('diff-legend-toggle', '<button type="button" class="diff-legend-toggle" aria-expanded="false" hidden></button>');

  // Defensive anchors for older cached HTML / partial shell states. Existing
  // visible elements are never replaced.
  ensureHTML('showWhitespace', '<input id="showWhitespace" type="checkbox" />');
  ensureHTML('showTags', '<input id="showTags" type="checkbox" />');
  ensureHTML('showUrls', '<input id="showUrls" type="checkbox" />');
  ensureHTML('pendingOnly', '<input id="pendingOnly" type="checkbox" />');
  ensureHTML('projectTitle', '<input id="projectTitle" value="名称未設定の原稿" />');
  ensureHTML('profileSelect', '<select id="profileSelect"><option value="urawa-news">浦和公式サイト｜お知らせ記事</option><option value="cms-html">CMS作業｜HTML優先</option><option value="free-edit">自由編集｜提案を控えめ</option></select>');
  ensureHTML('sideSearchInput', '<input id="sideSearchInput" />');
  ensureHTML('searchInput', '<input id="searchInput" />');
  ensureHTML('workFile', '<input id="workFile" type="file" accept="application/json" />');
  ensureHTML('copyMenu', '<div id="copyMenu" hidden></div>');
  ensureHTML('copyButton', '<button id="copyButton" aria-expanded="false" hidden></button>');
})();
