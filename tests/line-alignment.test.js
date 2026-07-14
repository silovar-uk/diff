'use strict';

const assert = require('node:assert/strict');
require('../diff-core.js');
require('../diff-core-hunk-bridge.js');
require('../diff-ignore-assets.js');
const Diff = globalThis.TextReviewDiffCore;

const strict = { ignoreHtmlTags: true, ignoreSoftFormatting: false };

// Regression: a multi-line removal and one unrelated long insertion must not
// be forced into a first-line ↔ pair just because they share one changed area.
let result = Diff.diffRows(
  'こんにちは。\nタイトル：\n旧タイトルです\n本文：\n旧本文の内容です。',
  '新しい挨拶文です。ここに全部まとまっています。',
  strict
);
assert.deepEqual(
  result.rows.map(row => row.kind),
  ['delete', 'delete', 'delete', 'delete', 'delete', 'insert'],
  'unrelated removed/added line blocks must remain − rows followed by a ＋ row'
);
assert.equal(result.rows.some(row => row.kind === 'replace'), false);

// Similar lines inside a changed block should still be paired as one ↔ row.
result = Diff.diffRows(
  '見出し\n旧タイトルです\n本文\n旧本文の内容です。',
  '見出し\n新タイトルです\n本文\n新本文の内容です。',
  strict
);
assert.deepEqual(result.rows.map(row => row.kind), ['same', 'replace', 'same', 'replace']);
assert.equal(result.rows[1].before, '旧タイトルです\n');
assert.equal(result.rows[1].after, '新タイトルです\n');

// CMS heading markup and plain-draft heading bullets align by meaning. Image
// tags follow the same ignore setting as other HTML tags and do not create rows.
const pokemonTitle = '8/15(土)広島戦  “ポケモンJリーグフェス”開催決定! 来場者先着52,000名さまにEVO BAG(ポケモンのエコバッグ)をプレゼント!';
const cmsBefore = `<span class="info24-t2">${pokemonTitle}</span>\n<img src="jp_bag.jpg" />\n\n浦和レッズは、8/15(土)サンフレッチェ広島戦にて“ポケモンJリーグフェス”を開催いたします。\n`;
const plainAfter = `◆${pokemonTitle}\n \n浦和レッズは、8/15(土)サンフレッチェ広島戦にて“ポケモンJリーグフェス”を開催いたします。\n`;
result = Diff.diffRows(cmsBefore, plainAfter, strict);
assert.deepEqual(
  result.rows.map(row => [row.kind, row.beforeType, row.afterType]),
  [
    ['replace', 'heading', 'heading'],
    ['same', 'blank', 'blank'],
    ['same', 'text', 'text']
  ]
);
assert.equal(result.rows.some(row => row.beforeType === 'asset' || row.afterType === 'asset'), false);
assert.equal(result.rows[0].before, `${pokemonTitle}\n`);
assert.equal(result.rows[0].after, `◆${pokemonTitle}\n`);

// Turning tag ignoring off makes the image structure visible again.
result = Diff.diffRows(cmsBefore, plainAfter, { ...strict, ignoreHtmlTags: false });
assert.ok(result.rows.some(row => row.beforeType === 'asset' && row.kind === 'delete'));

// Blank rows are weak units: they must not prevent similar body paragraphs from
// pairing, even when their positions differ between the two drafts.
const oldBody = 'この度浦和レッズでは、金武町を巡るスタンプラリーを7月8日から開催することをお知らせいたします。';
const newBody = 'このたび、浦和レッズは、金武町を巡るスタンプラリーを7月8日から開催することをお知らせいたします。';
result = Diff.diffRows(`タイトル：\n\n${oldBody}`, `${newBody}\n\n`, strict);
const bridgedReplace = result.rows.find(row => row.kind === 'replace');
assert.ok(bridgedReplace, 'the similar body paragraphs should be paired across a moved blank line');
assert.equal(bridgedReplace.before, oldBody);
assert.equal(bridgedReplace.after, `${newBody}\n`);
assert.ok(result.rows.some(row => row.kind === 'delete' && row.before === 'タイトル：\n'), 'the unmatched title stays a delete row');

// The hunk aligner must skip an unrelated early line to pair the actually
// corresponding title line later in the block.
const unit = (text) => ({ text, compareText: text, type: 'text' });
const removed = [unit('こんにちは。'), unit('旧タイトルです'), unit('旧本文の内容です。')];
const added = [unit('新タイトルです'), unit('新本文の内容です。')];
const pairs = Diff._alignHunk(removed, added, 0.34);
assert.deepEqual(
  pairs.map(pair => [pair.before?.text || '', pair.after?.text || '']),
  [['こんにちは。', ''], ['旧タイトルです', '新タイトルです'], ['旧本文の内容です。', '新本文の内容です。']]
);

assert.ok(Diff._lineSimilarity('旧タイトルです', '新タイトルです') > 0.34);
assert.ok(Diff._lineSimilarity('こんにちは。', '新しい挨拶文です。ここに全部まとまっています。') < 0.34);

console.log('line alignment tests: passed');
