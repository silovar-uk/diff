'use strict';

const assert = require('node:assert/strict');
const Diff = require('../diff-engine-v1.js');

const strict = { ignoreHtmlTags: true, ignoreSoftFormatting: false };

// Unrelated changed blocks must remain separate deletes and inserts.
let result = Diff.diffRows(
  'こんにちは。\nタイトル：\n旧タイトルです\n本文：\n旧本文の内容です。',
  '新しい挨拶文です。ここに全部まとまっています。',
  strict
);
assert.deepEqual(
  result.rows.map(row => row.kind),
  ['delete', 'delete', 'delete', 'delete', 'delete', 'insert']
);
assert.equal(result.rows.some(row => row.kind === 'replace'), false);

// Similar lines inside a changed block remain paired as replacements.
result = Diff.diffRows(
  '見出し\n旧タイトルです\n本文\n旧本文の内容です。',
  '見出し\n新タイトルです\n本文\n新本文の内容です。',
  strict
);
assert.deepEqual(result.rows.map(row => row.kind), ['same', 'replace', 'same', 'replace']);
assert.equal(result.rows[1].before, '旧タイトルです\n');
assert.equal(result.rows[1].after, '新タイトルです\n');

// CMS heading markup and plain-draft bullets align by meaning. Image and
// layout-only tags disappear from the comparison when tag ignoring is enabled.
const pokemonTitle = '8/15(土)広島戦  “ポケモンJリーグフェス”開催決定! 来場者先着52,000名さまにEVO BAG(ポケモンのエコバッグ)をプレゼント!';
const cmsBefore = `<span class="info24-t2">${pokemonTitle}</span>\n<img src="jp_bag.jpg" />\n<div class="info25__photo-2col">\n<picture>\n<source srcset="bag.webp" />\n</picture>\n</div>\n\n浦和レッズは、8/15(土)サンフレッチェ広島戦にて“ポケモンJリーグフェス”を開催いたします。\n`;
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
assert.equal(result.rows.some(row => ['asset', 'layout'].includes(row.beforeType) || ['asset', 'layout'].includes(row.afterType)), false);
assert.equal(result.rows[0].before, `${pokemonTitle}\n`);
assert.equal(result.rows[0].after, `◆${pokemonTitle}\n`);
assert.deepEqual(result.summary, { changes: 1, replaces: 1, inserts: 0, deletes: 0 });

// Turning tag ignoring off makes image and layout structure visible again.
result = Diff.diffRows(cmsBefore, plainAfter, { ...strict, ignoreHtmlTags: false });
assert.ok(result.rows.some(row => row.beforeType === 'asset'));
assert.ok(result.rows.some(row => row.beforeType === 'layout'));

// Table-only structure follows the same rule as image tags.
const tableBefore = '<table>\n<tbody>\n<tr>\n<td>\n</td>\n</tr>\n</tbody>\n</table>\n本文';
result = Diff.diffRows(tableBefore, '本文', strict);
assert.deepEqual(result.rows.map(row => row.kind), ['same']);
assert.equal(result.rows[0].before, '本文');

// Blank rows are weak units and do not block paragraph matching.
const oldBody = 'この度浦和レッズでは、金武町を巡るスタンプラリーを7月8日から開催することをお知らせいたします。';
const newBody = 'このたび、浦和レッズは、金武町を巡るスタンプラリーを7月8日から開催することをお知らせいたします。';
result = Diff.diffRows(`タイトル：\n\n${oldBody}`, `${newBody}\n\n`, strict);
const bridgedReplace = result.rows.find(row => row.kind === 'replace');
assert.ok(bridgedReplace);
assert.equal(bridgedReplace.before, oldBody);
assert.equal(bridgedReplace.after, `${newBody}\n`);
assert.ok(result.rows.some(row => row.kind === 'delete' && row.before === 'タイトル：\n'));

// The aligner skips an unrelated early line and pairs the later matches.
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

console.log('unified line alignment tests: passed');
