(() => {
  'use strict';

  const Diff = window.TextReviewDiffCore;
  const beforeEl = document.getElementById('baselineText');
  const afterEl = document.getElementById('workingText');
  const ignoreHtmlToggle = document.getElementById('ignoreHtmlTagsToggle');

  if (!Diff?.diffRows || !beforeEl || !afterEl) return;

  const CHATGPT_BASE_URL = 'https://chatgpt.com/?prompt=';
  const MAX_URL_LENGTH = 24000;

  function ensureButton() {
    let button = document.getElementById('chatgptReviewButton');
    if (button) return button;

    const toolbar = document.querySelector('.desk-toolbar');
    if (!toolbar) return null;

    button = document.createElement('button');
    button.id = 'chatgptReviewButton';
    button.className = 'quiet-button';
    button.type = 'button';
    button.textContent = 'ChatGPTで差分意図を検討';
    button.title = '元原稿・変更版・差分一覧をChatGPTに送り、変更意図を分析します';
    button.setAttribute('aria-label', 'ChatGPTで差分意図を検討');
    button.disabled = true;

    const spacer = toolbar.querySelector('.toolbar-spacer');
    if (spacer) toolbar.insertBefore(button, spacer);
    else toolbar.appendChild(button);

    return button;
  }

  const button = ensureButton();
  if (!button) return;

  const normalize = (value) => String(value || '').trim();

  function notify(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 3600);
  }

  function updateButtonState() {
    const before = normalize(beforeEl.value);
    const after = normalize(afterEl.value);
    button.disabled = !before || !after || before === after;
  }

  function kindLabel(kind) {
    return ({ replace: '置換', insert: '追加', delete: '削除' })[kind] || kind;
  }

  function formatDiffRows(before, after) {
    const result = Diff.diffRows(before, after, {
      ignoreHtmlTags: ignoreHtmlToggle ? ignoreHtmlToggle.checked : true,
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

  function buildPrompt(before, after) {
    const diffText = formatDiffRows(before, after);

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

  async function copyPrompt(prompt) {
    try {
      await navigator.clipboard.writeText(prompt);
      return true;
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = prompt;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    }
  }

  button.addEventListener('click', async () => {
    const before = normalize(beforeEl.value);
    const after = normalize(afterEl.value);
    if (!before || !after || before === after) return;

    const prompt = buildPrompt(before, after);
    const encodedUrl = `${CHATGPT_BASE_URL}${encodeURIComponent(prompt)}`;
    const popup = window.open('', '_blank');
    if (popup) popup.opener = null;

    if (encodedUrl.length <= MAX_URL_LENGTH) {
      if (popup) popup.location.href = encodedUrl;
      else window.location.href = encodedUrl;
      return;
    }

    const copied = await copyPrompt(prompt);
    if (popup) popup.location.href = 'https://chatgpt.com/';
    else window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');

    notify(copied
      ? '原稿が長いため、分析プロンプトをコピーしてChatGPTを開きました。貼り付けて送信してください。'
      : 'ChatGPTを開きましたが、プロンプトのコピーに失敗しました。');
  });

  beforeEl.addEventListener('input', updateButtonState);
  afterEl.addEventListener('input', updateButtonState);
  ignoreHtmlToggle?.addEventListener('change', updateButtonState);
  updateButtonState();
})();
