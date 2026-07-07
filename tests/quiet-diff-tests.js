'use strict';

const assert = require('node:assert/strict');
const Diff = require('../diff-core.js');

const quiet = { ignoreHtmlTags: true, ignoreSoftFormatting: true };

let result = Diff.diffText(
  '<span class="old">浦和レッズは、\n試合を開催します。</span>\n\n詳細',
  '<span class="new">浦和レッズは、試合を開催します。</span>\n\n詳細',
  quiet
);
assert.equal(result.hunks.length, 0, 'tag attributes and soft line wraps must not create review hunks');

result = Diff.diffText(
  '浦和レッズは、\n試合を開催します。\n\n詳細',
  '浦和レッズは、試合を中止します。\n\n詳細',
  quiet
);
assert.equal(result.hunks.length, 1, 'meaningful wording change should remain one hunk');
assert.equal(result.hunks[0].kind, 'replace');

result = Diff.diffText('A\nB', 'A B', { ignoreHtmlTags: false, ignoreSoftFormatting: false });
assert.ok(result.hunks.length > 0, 'formatting toggle off should preserve soft line-break differences');

result = Diff.diffText('A\nB', 'A B', quiet);
assert.equal(result.hunks.length, 0, 'formatting toggle on should ignore soft line-wrap differences');

console.log('quiet diff tests: passed');
