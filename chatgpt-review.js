(() => {
  'use strict';

  const Diff = window.TextReviewDiffCore;
  const beforeEl = document.getElementById('baselineText');
  const afterEl = document.getElementById('workingText');
  const button = document.getElementById('chatgptReviewButton');
  const ignoreHtmlToggle = document.getElementById('ignoreHtmlTagsToggle');

  if (!Diff?.diffRows || !beforeEl || !afterEl || !button) return;

  const CHATGPT_BASE_URL = 'https://chatgpt.com/?prompt=';
  const MAX_URL_LENGTH = 60000;

  const normalize = (value) => String(value || '').trim();

  function updateButtonState() {
    const before = normalize(beforeEl.value);
    const after = normalize(afterEl.value);
    button.disabled = !before || !after || before === after;
  }

  function kindLabel(kind) {
    return ({
      replace: '置換',
      insert: '追加',
      delete: '削除'
    })[kind] || kind;
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
        `### 差分 ${index + 1}（${kindLabel(row.kind)}）`,
        '変更前:',
        '```text',
        beforeText || '（なし）',
        '```',
        '変更後:',
        '```text',
        afterText || '（なし）',
        '```'
      ].join('\n');
    }).join('\n\n');
  }

  function buildPrompt(before, after) {
    const diffText = formatDiffRows(before, after);

    return `あなたは文章編集のレビュー担当者です。\n以下の「元原稿」「変更版」「差分一覧」を照合し、変更者がどのような意図で修正した可能性が高いかを分析してください。\n\n## 目的\n単に変更内容を要約するのではなく、各差分について「なぜこの変更をしたのか」を推定し、原稿作成者が次回以降の修正に活かせる形で整理すること。\n\n## 分析ルール\n- まず事実として確認できる変更内容を整理し、その後に変更意図を推定する。\n- 原稿だけでは断定できない意図を事実のように書かず、必ず「推定」と明示する。\n- 誤字脱字、表記統一、空白、記号、HTMLタグ等の機械的修正と、意味・構成・ニュアンス・情報設計に関わる修正を分ける。\n- 単独では小さな差分でも、複数差分をまとめて見ると共通する編集方針がある場合は、その方針を抽出する。\n- 変更によって情報が追加・削除・弱化・強調・具体化・抽象化されている場合は、その方向性を示す。\n- 読みやすさ、正確性、簡潔性、トーン、対象読者、構成、事実関係、表記ルールなど、どの観点の修正かを分類する。\n- 外部情報を勝手に補わず、原稿だけでは判断できないものは「要確認」とする。\n- 変更版をさらに直すことが主目的ではない。改善提案は、意図分析に必要な場合のみ最後に分けて記載する。\n\n## 出力形式\n### 1. 全体の編集方針\n今回の修正全体から読み取れる編集方針を3〜7項目で整理。\n\n### 2. 差分ごとの意図\n各差分について以下を記載。\n- 差分番号\n- 変更種別\n- 何が変わったか\n- 推定される変更意図\n- 観点（例：正確性／簡潔性／構成／トーン／表記統一／情報追加／情報削除）\n- 確信度（高・中・低）\n- 必要に応じて要確認事項\n\n### 3. 繰り返されている修正傾向\n複数箇所に共通する修正ルールや、次回から原稿段階で意識できるポイントを整理。\n\n### 4. 判断できない差分\n意図を特定できないものだけ抜き出し、なぜ判断できないかを書く。\n\n---\n\n# 元原稿\n\n\`\`\`text\n${before}\n\`\`\`\n\n# 変更版\n\n\`\`\`text\n${after}\n\`\`\`\n\n# 差分一覧\n\n${diffText}`;
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
      textarea.style.opacity = '0';
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

    const status = document.getElementById('analysisState');
    if (status) {
      const previous = status.textContent;
      status.textContent = copied
        ? '原稿が長いため、分析プロンプトをコピーしてChatGPTを開きました'
        : '原稿が長いためChatGPTを開きました。プロンプトのコピーに失敗しました';
      window.setTimeout(() => { status.textContent = previous; }, 4200);
    }
  });

  beforeEl.addEventListener('input', updateButtonState);
  afterEl.addEventListener('input', updateButtonState);
  ignoreHtmlToggle?.addEventListener('change', updateButtonState);
  updateButtonState();
})();
