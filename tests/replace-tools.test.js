'use strict';

const assert = require('node:assert/strict');
const Replace = require('../replace-tools-v1.js');
const BlankCleanup = require('../blank-line-cleanup-v1.js');

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

// Empty lines remain; only invisible or whitespace characters inside them are removed.
result = Replace.removeInvisibleCharacters('本文\u200B\n\u200B\n<span>見出し</span>\n\u00A0\n次の本文');
assert.equal(result.text, '本文\n\n<span>見出し</span>\n\n次の本文');
assert.equal(result.lines, 3);
assert.equal(result.count, 3);
assert.deepEqual(result.changes, [
  { from: '\u200B', to: '', count: 2 },
  { from: '\u00A0', to: '', count: 1 }
]);

result = Replace.removeInvisibleCharacters('本文\n   \n　\t　\r\n次の本文\n末尾');
assert.equal(result.text, '本文\n\n\r\n次の本文\n末尾');
assert.equal(result.lines, 2);
assert.equal(result.count, 6);

// NBSP inside a visible line becomes a normal space instead of joining words.
result = Replace.removeInvisibleCharacters('販売価格\u00A04,950円');
assert.equal(result.text, '販売価格 4,950円');
assert.equal(result.lines, 1);
assert.equal(result.count, 1);
assert.deepEqual(result.changes, [{ from: '\u00A0', to: ' ', count: 1 }]);

// Real empty lines and meaningful emoji joiners remain unchanged.
result = Replace.removeInvisibleCharacters('本文\n\n👨‍👩‍👧\n次の本文');
assert.equal(result.text, '本文\n\n👨‍👩‍👧\n次の本文');
assert.equal(result.lines, 0);
assert.equal(result.count, 0);

// The reported case: one intentional blank line plus a whitespace-only line becomes one blank line.
result = BlankCleanup.collapseExtraBlankLines('※ビジターチームを応援するご来場者を除く\n\n \nオリジナルグッズ販売について');
assert.equal(result.text, '※ビジターチームを応援するご来場者を除く\n\nオリジナルグッズ販売について');
assert.equal(result.lines, 1);

// Invisible-only rows are treated as blank rows and consecutive runs collapse to one.
result = BlankCleanup.collapseExtraBlankLines('本文\n\u200B\n\u00A0\n次の本文');
assert.equal(result.text, '本文\n\u200B\n次の本文');
assert.equal(result.lines, 1);

// A single intentional blank line remains.
result = BlankCleanup.collapseExtraBlankLines('本文\n\n次の本文');
assert.equal(result.text, '本文\n\n次の本文');
assert.equal(result.lines, 0);

assert.deepEqual(Replace.removeWhitespaceOnlyLines('本文\n\uFEFF\n次'), Replace.removeInvisibleCharacters('本文\n\uFEFF\n次'));
assert.equal(Replace.visibleCharacter('\u200B'), 'ゼロ幅スペース');
assert.equal(Replace.visibleCharacter('\u00A0'), 'NBSP');
assert.equal(Replace.visibleCharacter('　'), '全角スペース');
assert.equal(Replace.visibleCharacter(' '), '半角スペース');
assert.equal(Replace.countChangedSpan('abcXYZdef', 'abc123def'), 3);
assert.equal(Replace.countChangedSpan('同じ', '同じ'), 0);

console.log('replace tools tests: passed');
