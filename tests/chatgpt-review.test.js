'use strict';

const assert = require('node:assert/strict');
const Diff = require('../diff-engine-v1.js');
const ChatGPTReview = require('../chatgpt-review-v1.js');

{
  const text = ChatGPTReview.formatDiffRows('A\nB', 'A\nC', { ignoreHtmlTags: true }, Diff);
  assert.match(text, /【差分 1｜(置換|削除)】/);
  assert.match(text, /変更前：\nB/);
  assert.match(text, /変更後：\nC|【差分 2｜追加】[\s\S]*変更後：\nC/);
}

{
  const prompt = ChatGPTReview.buildPrompt('元原稿', '変更版', { ignoreHtmlTags: true }, Diff);
  assert.match(prompt, /# 元原稿/);
  assert.match(prompt, /# 変更版/);
  assert.match(prompt, /# 差分一覧/);
  assert.match(prompt, /事実として確認できる変更内容/);
  assert.match(prompt, /確信度（高・中・低）/);
}

{
  const before = '<strong>販売対象試合</strong>';
  const after = '販売対象試合';
  const ignored = ChatGPTReview.formatDiffRows(before, after, { ignoreHtmlTags: true }, Diff);
  const raw = ChatGPTReview.formatDiffRows(before, after, { ignoreHtmlTags: false }, Diff);
  assert.equal(ignored, '差分なし', 'HTML-normalized equivalent text should be ignored');
  assert.notEqual(raw, '差分なし', 'raw HTML comparison should retain markup differences');
}

{
  const shortPlan = ChatGPTReview.buildLaunchPlan('短い文章', { maxPrefillUrlLength: 1000 });
  assert.equal(shortPlan.prefilled, true);
  assert.match(shortPlan.url, /^https:\/\/chatgpt\.com\/\?prompt=/);

  const longPlan = ChatGPTReview.buildLaunchPlan('長'.repeat(2000), { maxPrefillUrlLength: 100 });
  assert.equal(longPlan.prefilled, false);
  assert.equal(longPlan.url, 'https://chatgpt.com/');
}

{
  const button = {};
  assert.equal(ChatGPTReview.updateButtonState(button, { value: '' }, { value: 'B' }), true);
  assert.equal(button.disabled, true);
  assert.equal(ChatGPTReview.updateButtonState(button, { value: 'A' }, { value: 'A' }), true);
  assert.equal(ChatGPTReview.updateButtonState(button, { value: 'A' }, { value: 'B' }), false);
  assert.equal(button.disabled, false);
}

(async () => {
  {
    let copied = '';
    const result = await ChatGPTReview.copyPrompt('prompt', {
      navigator: { clipboard: { writeText: async (value) => { copied = value; } } }
    });
    assert.equal(result.ok, true);
    assert.equal(result.method, 'clipboard');
    assert.equal(copied, 'prompt');
  }

  {
    let appended = false;
    let removed = false;
    const textarea = {
      value: '',
      style: {},
      setAttribute() {},
      focus() {},
      select() {},
      remove() { removed = true; }
    };
    const doc = {
      body: { appendChild() { appended = true; } },
      createElement() { return textarea; },
      execCommand(command) { return command === 'copy'; }
    };
    const result = await ChatGPTReview.copyPrompt('fallback', {
      navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } },
      document: doc
    });
    assert.equal(result.ok, true);
    assert.equal(result.method, 'execCommand');
    assert.equal(textarea.value, 'fallback');
    assert.equal(appended, true);
    assert.equal(removed, true);
  }

  {
    const result = await ChatGPTReview.copyPrompt('fail', {
      navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } }
    });
    assert.equal(result.ok, false);
  }

  {
    const popup = { closed: false, location: { href: '' }, opener: {} };
    const plan = { url: 'https://chatgpt.com/?prompt=test' };
    const result = ChatGPTReview.openChatGPT(plan, popup, {});
    assert.equal(result.ok, true);
    assert.equal(result.method, 'reserved-tab');
    assert.equal(popup.location.href, plan.url);
    assert.equal(popup.opener, null);
  }

  {
    const plan = { url: 'https://chatgpt.com/' };
    const result = ChatGPTReview.openChatGPT(plan, null, { window: { open: () => null } });
    assert.equal(result.ok, false);
    assert.equal(result.method, 'blocked');
  }

  console.log('ChatGPT diff handoff tests: passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
