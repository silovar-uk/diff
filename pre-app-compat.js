/* Text Review Studio – pre-app DOM compatibility anchors and sample loader. */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);

  const SAMPLE_BEFORE = `日ごろより浦和レッズをサポートいただき、ありがとうございます。
ホーム開幕戦8月15日(土)第2節 サンフレッチェ広島戦【MATCH PARTNER ポラスグループ】のチケット販売についてご案内いたします。

<span class="info24-t2">8/15(土)広島戦  “ポケモンJリーグフェス”開催決定! 来場者先着52,000名さまにEVO BAG(ポケモンのエコバッグ)をプレゼント!</span>
<img src="https://www.urawa-reds.co.jp/wp-content/uploads/2026/07/jp_bag_03-1.jpg" alt="" width="1920" height="1080" class="alignnone size-full wp-image-243429" />

浦和レッズは、8/15(土)サンフレッチェ広島戦【MATCH PARTNER ポラスグループ】にて“ポケモンJリーグフェス”を開催いたします。
試合当日、ピカチュウとクラブパートナーポケモン「ガオガエン」がデザインされたEVO BAG(環境配慮型エコバッグ)を先着52,000名さまに入場ゲートでプレゼントいたします。
※ビジターチームを応援するご来場者を除く
さらに、オリジナルグッズ販売やイベントなども予定しており、決まり次第お知らせいたします。

詳細はこちら
<a href="https://www.urawa-reds.co.jp/clubinfo/243121/">https://www.urawa-reds.co.jp/clubinfo/243121/</a>

<span class="info24-t2">販売対象試合と販売スケジュール</span>
<img src="https://www.urawa-reds.co.jp/wp-content/uploads/2026/07/ticket_schedule_march-20260707-01.jpg" alt="" width="1200" height="1200" class="alignnone size-full wp-image-243432" />
※当試合はシーズンチケット対象試合となります。お持ちのシーズンチケットでご観戦いただけます。
※4試合セットチケット(回数券)の対象試合です。REX CLUBマイページに配信されている「デジタルクーポン」から、各対象試合のチケット取得が必要となります。

<span class="info24-t3-red">REX TICKET先行販売</span>
※REX CLUB(有料・無料)への登録が必要です。
<span class="info24-label">販売サイト</span>
REX TICKET <a href="http://rex-ticket.jp/" rel="noopener noreferrer" target="_blank">http://rex-ticket.jp/</a>(PC・スマホ共通)
`;

  const SAMPLE_AFTER = `【タイトル】
ホームゲーム(J1リーグ) 8月開催試合のチケット販売について

【本文】
日頃より浦和レッズをサポートいただき、ありがとうございます。
ホーム開幕戦8月15日(土)第2節 サンフレッチェ広島戦【MATCH PARTNER ポラスグループ】のチケット販売についてご案内いたします。

◆8/15(土)広島戦  “ポケモンJリーグフェス”開催決定! 来場者先着52,000名さまにEVO BAG(ポケモンのエコバッグ)をプレゼント!
 
浦和レッズは、8/15(土)サンフレッチェ広島戦【MATCH PARTNER ポラスグループ】にて“ポケモンJリーグフェス”を開催いたします。
試合当日、ピカチュウとクラブパートナーポケモン「ガオガエン」がデザインされたEVO BAG(環境配慮型エコバッグ)を先着52,000名さまに入場ゲートでプレゼントいたします。
※ビジターチームを応援するご来場者を除く
さらに、オリジナルグッズ販売やイベントなども予定しており、決まり次第お知らせいたします。
詳細はコチラ　https://www.urawa-reds.co.jp/clubinfo/243121/

◆販売対象試合と販売スケジュール
 
※当試合はシーズンチケット対象試合となります。お持ちのシーズンチケットでご観戦いただけます。
※4試合セットチケット(回数券)の対象試合です。REX CLUB マイページに配信されている「デジタルクーポン」から各対象試合のチケット取得が必要となります。

【REX TICKET先行販売】
※REX CLUB(有料・無料)への登録が必要です。
＜販売サイト＞
REX TICKET http://rex-ticket.jp/　（PC・スマホ共通）
`;

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

  function installSampleStyle() {
    if ($('#sampleTextButtonStyle')) return;
    const style = document.createElement('style');
    style.id = 'sampleTextButtonStyle';
    style.textContent = `
      .sample-text-button {
        min-height:32px;
        padding:6px 10px;
        border:1px solid #d8dfec;
        border-radius:8px;
        color:#405779;
        font-size:11px;
        font-weight:850;
        background:#fff;
      }
      .sample-text-button:hover { border-color:#b7c8e8; color:#244d9e; background:#f3f6ff; }
      @media (max-width:900px) { .sample-text-button { padding:6px 8px; } }
    `;
    document.head.appendChild(style);
  }

  function installSampleButton() {
    if ($('#sampleTextFillButton')) return;
    const toolbar = $('.toolbar-meta');
    if (!toolbar) return;
    const displayButton = toolbar.querySelector('[data-action="toggle-display-settings"]');
    const button = document.createElement('button');
    button.id = 'sampleTextFillButton';
    button.type = 'button';
    button.className = 'sample-text-button';
    button.textContent = 'サンプルを入れる';
    button.title = 'CMS原稿とプレーン原稿の比較サンプルを左右に入れます';
    if (displayButton) toolbar.insertBefore(button, displayButton);
    else toolbar.appendChild(button);
  }

  function setTextareaValue(id, value) {
    const textarea = document.getElementById(id);
    if (!textarea) return;
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function loadSampleText() {
    const before = $('#baselineText')?.value || '';
    const after = $('#workingText')?.value || '';
    if ((before || after) && !window.confirm('現在の入力内容をサンプルテキストで上書きしますか？')) return;
    const title = $('#projectTitle');
    if (title) {
      title.value = 'サンプル：CMS原稿とプレーン原稿の比較';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setTextareaValue('baselineText', SAMPLE_BEFORE);
    setTextareaValue('workingText', SAMPLE_AFTER);
    window.setTimeout(() => {
      $('#compareModeButton')?.click();
      showToast('サンプルテキストを入れました');
    }, 60);
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

  installSampleStyle();
  installSampleButton();
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#sampleTextFillButton')) return;
    event.preventDefault();
    event.stopPropagation();
    loadSampleText();
  }, true);
})();
