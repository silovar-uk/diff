'use strict';

const assert = require('node:assert/strict');
const Diff = require('../diff-core.js');

const strict = { ignoreHtmlTags: true, ignoreSoftFormatting: false };

// Regression: a multi-line removal and one unrelated long insertion must not
// be forced into a first-line ↔ pair just because they share one LCS hunk.
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

// The hunk aligner must skip an unrelated early line to pair the actually
// corresponding title line later in the block.
const removed = [{ text: 'こんにちは。' }, { text: '旧タイトルです' }, { text: '旧本文の内容です。' }];
const added = [{ text: '新タイトルです' }, { text: '新本文の内容です。' }];
const pairs = Diff._alignHunk(removed, added, 0.34);
assert.deepEqual(
  pairs.map(pair => [pair.before?.text || '', pair.after?.text || '']),
  [['こんにちは。', ''], ['旧タイトルです', '新タイトルです'], ['旧本文の内容です。', '新本文の内容です。']]
);

assert.ok(Diff._lineSimilarity('旧タイトルです', '新タイトルです') > 0.34);
assert.ok(Diff._lineSimilarity('こんにちは。', '新しい挨拶文です。ここに全部まとまっています。') < 0.34);

console.log('line alignment tests: passed');
