/* Text Review Studio v1 – resilient ChatGPT diff-intent handoff. */
(function (root) {
  'use strict';

  const CHATGPT_BASE_URL = 'https://chatgpt.com/';
  const CHATGPT_PROMPT_PARAM = 'prompt';
  const MAX_PREFILL_URL_LENGTH = 12000;

  const normalize = (value) => String(value || '').trim();

  function kindLabel(kind) {
    return ({ replace: '置換', insert: '追加', delete: '削除' })[kind] || kind;
  }

  function formatDiffRows(before, after, options = {}, diffCore = root?.TextReviewDiffCore) {
    if (!diffCore?.diffRows) throw new Error('diffRows is unavailable');

    const result = diffCore.diffRows(before, after, {
      ignoreHtmlTags: typeof options.ignoreHtmlTags === 'boolean' ? options.ignoreHtmlTags : true,
      ignoreSoftFormatting: false
    });

    const changedRows = (result.rows || []).filter((row) => row.kind !== 'same');
    if (!changedRows.length) return '差分なし';

    return changedRows.map((row, index) => {
      const beforeText = row.beforeRaw || row.before || '';
      const afterText = row.afterRaw || row.after || '';
      return [
        `【差分 ${index + 1}｜${kindLabel(row.kind)}】`,
        '変更前：',
        beforeText || '（なし）',
        '変更後：',
        afterText || '（なし）'
      ].join('\n');
    }).join('\n\n');
  }

  function buildPrompt(before, after, options = {}, diffCore = root?.TextReviewDiffCore) {
    const diffText = formatDiffRows(before, after, options, diffCore);

    return `あなたは文章編集のレビュー担当者です。
以下の「元原稿」「変更版」「差分一覧」を照合し、変更者がどのような意図で修正した可能性が高いかを分析してください。

## 目的
単に変更内容を要約するのではなく、各差分について「何が変わったか」と「なぜ変更したと考えられるか」を分離し、原稿作成者が次回以降の修正に活かせる形で整理してください。

## 分析ルール
- 最初に、事実として確認できる変更内容だけを整理する。
- その後に変更意図を推定する。原稿だけでは断定できない意図は、必ず「推定」と明示する。
- 誤字脱字、表記統一、空白、記号、HTMLタグなどの機械的変更と、意味・構成・ニュアンス・情報設計に関わる変更を分ける。
- 単独では小さな差分でも、複数差分に共通する編集方針があればまとめて抽出する。
- 情報の追加・削除・弱化・強調・具体化・抽象化があれば、その方向を明示する。
- 観点は、正確性／簡潔性／読みやすさ／構成／トーン／対象読者／事実関係／表記統一／情報追加／情報削除などから適切に分類する。
- 外部情報を勝手に補完しない。原稿だけでは判断できない場合は「要確認」とする。
- 変更版をさらに添削することが主目的ではない。改善提案は、意図分析から自然に導けるものだけ最後に分ける。
- 一度しか現れない変更を、編集者の恒常的なルールとして断定しない。

## 出力形式
### 1. 全体の編集方針
今回の修正全体から読み取れる編集方針を3〜7項目。

### 2. 差分ごとの意図
各差分について以下を整理。
- 差分番号
- 変更種別
- 何が変わったか（事実）
- 推定される変更意図
- 観点
- 確信度（高・中・低）
- 必要に応じて要確認事項

### 3. 繰り返されている修正傾向
複数箇所に共通する修正ルールを整理。

### 4. 次回から原稿段階で意識できること
今回の修正から再利用できるポイントを5項目以内で整理。ただし根拠が弱いものは含めない。

### 5. 判断できない差分
意図を特定できないものだけ抜き出し、判断できない理由を書く。

---

# 元原稿
<<< ORIGINAL START >>>
${before}
<<< ORIGINAL END >>>

# 変更版
<<< REVISED START >>>
${after}
<<< REVISED END >>>

# 差分一覧
<<< DIFF START >>>
${diffText}
<<< DIFF END >>>`;
  }

  function buildLaunchPlan(prompt, options = {}) {
    const maxLength = Number.isFinite(options.maxPrefillUrlLength)
      ? options.maxPrefillUrlLength
      : MAX_PREFILL_URL_LENGTH;
    const prefillUrl = `${CHATGPT_BASE_URL}?${CHATGPT_PROMPT_PARAM}=${encodeURIComponent(prompt)}`;
    const prefilled = prefillUrl.length <= maxLength;
    return {
      url: prefilled ? prefillUrl : CHATGPT_BASE_URL,
      prefilled,
      promptLength: prompt.length,
      encodedUrlLength: prefillUrl.length
    };
  }

  async function copyPrompt(prompt, env = {}) {
    const nav = env.navigator || root?.navigator;
    const doc = env.document || root?.document;

    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(prompt);
        return { ok: true, method: 'clipboard' };
      } catch (_) {
        // Fall through to legacy copy.
      }
    }

    if (doc?.createElement && doc?.body) {
      try {
        const textarea = doc.createElement('textarea');
        textarea.value = prompt;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        doc.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = typeof doc.execCommand === 'function' && doc.execCommand('copy');
        textarea.remove();
        if (copied) return { ok: true, method: 'execCommand' };
      } catch (_) {
        // Return failure below.
      }
    }

    return { ok: false, method: 'none' };
  }

  function openChatGPT(plan, popup, env = {}) {
    const win = env.window || root;
    if (popup && !popup.closed) {
      try {
        popup.opener = null;
        popup.location.href = plan.url;
        return { ok: true, method: 'reserved-tab' };
      } catch (_) {
        // Fall through to a second attempt.
      }
    }

    if (win?.open) {
      try {
        const opened = win.open(plan.url, '_blank', 'noopener,noreferrer');
        if (opened) return { ok: true, method: 'new-tab' };
      } catch (_) {
        // Return failure below.
      }
    }

    return { ok: false, method: 'blocked' };
  }

  function updateButtonState(button, beforeEl, afterEl) {
    if (!button || !beforeEl || !afterEl) return true;
    const before = normalize(beforeEl.value);
    const after = normalize(afterEl.value);
    const disabled = !before || !after || before === after;
    button.disabled = disabled;
    return disabled;
  }

  function notify(doc, message) {
    const toast = doc?.getElementById?.('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = root.setTimeout(() => toast.classList.remove('is-visible'), 4200);
  }

  function ensureManualPromptDialog(doc) {
    let dialog = doc.getElementById('chatgptPromptDialog');
    if (dialog) return dialog;

    dialog = doc.createElement('dialog');
    dialog.id = 'chatgptPromptDialog';
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <div class="dialog-card">
        <header class="dialog-head">
          <div><small>CHATGPT HANDOFF</small><h2>分析プロンプト</h2></div>
          <button class="dialog-close" type="button" data-chatgpt-dialog-close aria-label="閉じる">×</button>
        </header>
        <div style="display:grid;gap:10px;">
          <p style="margin:0;color:var(--muted, #667085);font-size:12px;line-height:1.6;">自動コピーに失敗しました。下の内容をコピーしてChatGPTへ貼り付けてください。</p>
          <textarea id="chatgptPromptFallback" readonly style="width:100%;min-height:42vh;resize:vertical;font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;"></textarea>
        </div>
        <footer class="dialog-actions">
          <button class="secondary-button" type="button" data-chatgpt-dialog-close>閉じる</button>
          <button class="primary-button" type="button" data-chatgpt-copy-again>もう一度コピー</button>
        </footer>
      </div>`;

    doc.body.appendChild(dialog);

    dialog.addEventListener('click', async (event) => {
      if (event.target.closest('[data-chatgpt-dialog-close]')) {
        dialog.close();
        return;
      }
      if (event.target.closest('[data-chatgpt-copy-again]')) {
        const textarea = dialog.querySelector('#chatgptPromptFallback');
        const result = await copyPrompt(textarea?.value || '', { document: doc, navigator: root.navigator });
        notify(doc, result.ok ? '分析プロンプトをコピーしました。' : 'コピーできませんでした。テキストを選択して手動でコピーしてください。');
      }
    });

    return dialog;
  }

  function showManualPrompt(doc, prompt) {
    const dialog = ensureManualPromptDialog(doc);
    const textarea = dialog.querySelector('#chatgptPromptFallback');
    if (textarea) textarea.value = prompt;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function install(doc = root?.document) {
    if (!doc) return false;

    const Diff = root?.TextReviewDiffCore;
    const beforeEl = doc.getElementById('baselineText');
    const afterEl = doc.getElementById('workingText');
    const button = doc.getElementById('chatgptReviewButton');
    const ignoreHtmlToggle = doc.getElementById('ignoreHtmlTagsToggle');

    if (!Diff?.diffRows || !beforeEl || !afterEl || !button) return false;
    if (button.dataset.chatgptReviewReady === 'true') return true;
    button.dataset.chatgptReviewReady = 'true';

    const refresh = () => updateButtonState(button, beforeEl, afterEl);
    beforeEl.addEventListener('input', refresh);
    beforeEl.addEventListener('change', refresh);
    afterEl.addEventListener('input', refresh);
    afterEl.addEventListener('change', refresh);
    ignoreHtmlToggle?.addEventListener('change', refresh);

    button.addEventListener('click', async () => {
      const before = normalize(beforeEl.value);
      const after = normalize(afterEl.value);
      if (!before || !after || before === after) {
        refresh();
        return;
      }

      let popup = null;
      try {
        popup = root.open?.('about:blank', '_blank') || null;
        if (popup) popup.opener = null;
      } catch (_) {
        popup = null;
      }

      let prompt;
      try {
        prompt = buildPrompt(before, after, {
          ignoreHtmlTags: ignoreHtmlToggle ? ignoreHtmlToggle.checked : true
        }, Diff);
      } catch (_) {
        if (popup && !popup.closed) popup.close();
        notify(doc, '差分プロンプトを生成できませんでした。ページを再読み込みして再度お試しください。');
        return;
      }

      const plan = buildLaunchPlan(prompt);
      const copied = await copyPrompt(prompt, { document: doc, navigator: root.navigator });
      const opened = openChatGPT(plan, popup, { window: root });

      if (!copied.ok) showManualPrompt(doc, prompt);

      if (copied.ok && opened.ok) {
        notify(doc, plan.prefilled
          ? '分析プロンプトをコピーしてChatGPTを開きました。送信されていない場合は、そのまま送信してください。'
          : '分析プロンプトをコピーしてChatGPTを開きました。貼り付けて送信してください。');
      } else if (copied.ok && !opened.ok) {
        notify(doc, 'ChatGPTの新規タブを開けませんでした。分析プロンプトはコピー済みです。');
      } else if (!copied.ok && opened.ok) {
        notify(doc, 'ChatGPTを開きました。自動コピーできなかったため、手動コピー用のプロンプトを表示しています。');
      } else {
        notify(doc, 'ChatGPTを開けず、自動コピーもできませんでした。手動コピー用のプロンプトを表示しています。');
      }
    });

    refresh();
    root.setTimeout(refresh, 0);
    root.addEventListener?.('pageshow', refresh);
    return true;
  }

  const api = {
    CHATGPT_BASE_URL,
    MAX_PREFILL_URL_LENGTH,
    kindLabel,
    formatDiffRows,
    buildPrompt,
    buildLaunchPlan,
    copyPrompt,
    openChatGPT,
    updateButtonState,
    install
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextReviewChatGPT = api;

  if (root?.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', () => install(root.document), { once: true });
    } else {
      install(root.document);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
