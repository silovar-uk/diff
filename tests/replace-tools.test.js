'use strict';

const assert = require('node:assert/strict');
const Replace = require('../replace-tools-v1.js');

let result = Replace.replaceAllLiteral('浦和レッズ 浦和レッズ', '浦和', 'URAWA');
assert.deepEqual(result, { text: 'URAWAレッズ URAWAレッズ', count: 2 });

result = Replace.replaceAllLiteral('ABC', '', 'X');
assert.deepEqual(result, { text: 'ABC', count: 0 });

result = Replace.replaceOneAtOrAfter('赤 青 赤', '赤', '紅', 2, -1, -1);
assert.equal(result.text, '赤 青 紅');
assert.equal(result.count, 1);
assert.equal(result.wrapped, false);

result = Replace.replaceOneAtOrAfter('赤 青 赤', '赤', '紅', 6, -1, -1);
assert.equal(result.text, '紅 青 赤');
assert.equal(result.wrapped, true);

result = Replace.replaceOneAtOrAfter('赤 青 赤', '赤', '紅', 0, 0, 1);
assert.equal(result.text, '紅 青 赤');
assert.equal(result.start, 0);
assert.equal(result.end, 1);

result = Replace.toHalfwidthAscii('ＡＢＣ１２３！　テスト・カナ');
assert.equal(result.text, 'ABC123! テスト・カナ');
assert.equal(result.count, 8);
assert.deepEqual(result.changes, [
  { from: 'Ａ', to: 'A', count: 1 },
  { from: 'Ｂ', to: 'B', count: 1 },
  { from: 'Ｃ', to: 'C', count: 1 },
  { from: '１', to: '1', count: 1 },
  { from: '２', to: '2', count: 1 },
  { from: '３', to: '3', count: 1 },
  { from: '！', to: '!', count: 1 },
  { from: '　', to: ' ', count: 1 }
]);

result = Replace.toHalfwidthAscii('ＡＡ１１！！　　');
assert.deepEqual(result.changes, [
  { from: 'Ａ', to: 'A', count: 2 },
  { from: '１', to: '1', count: 2 },
  { from: '！', to: '!', count: 2 },
  { from: '　', to: ' ', count: 2 }
]);

result = Replace.toHalfwidthAscii('～？？Ａ！');
assert.equal(result.text, '～？？A!');
assert.equal(result.count, 2);
assert.deepEqual(result.changes, [
  { from: 'Ａ', to: 'A', count: 1 },
  { from: '！', to: '!', count: 1 }
]);

result = Replace.toHalfwidthAscii('日本語とカナはそのまま');
assert.equal(result.text, '日本語とカナはそのまま');
assert.equal(result.count, 0);
assert.deepEqual(result.changes, []);

result = Replace.removeWhitespaceOnlyLines('本文\n   \n　\t　\r\n次の本文\n末尾');
assert.equal(result.text, '本文\n\n\r\n次の本文\n末尾');
assert.equal(result.lines, 2);
assert.equal(result.count, 7);

result = Replace.removeWhitespaceOnlyLines(' 先頭に空白\n本文の後ろ  \n通常行');
assert.equal(result.text, ' 先頭に空白\n本文の後ろ  \n通常行');
assert.equal(result.lines, 0);
assert.equal(result.count, 0);

assert.equal(Replace.visibleCharacter('　'), '全角スペース');
assert.equal(Replace.visibleCharacter(' '), '半角スペース');
assert.equal(Replace.countChangedSpan('abcXYZdef', 'abc123def'), 3);
assert.equal(Replace.countChangedSpan('同じ', '同じ'), 0);

console.log('replace tools tests: passed');