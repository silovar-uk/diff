'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');

function extractFunction(name) {
  const start = app.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  const brace = app.indexOf(') {', start) + 2;
  let depth = 0;
  for (let index = brace; index < app.length; index += 1) {
    if (app[index] === '{') depth += 1;
    if (app[index] === '}') {
      depth -= 1;
      if (!depth) return app.slice(start, index + 1);
    }
  }
  throw new Error(`function ${name} did not close`);
}

const context = {
  state: { search: { query: '', regex: false } },
  escapeRegExp(value = '') { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
};
vm.createContext(context);
vm.runInContext([
  extractFunction('searchFlags'),
  extractFunction('compileSearchPattern'),
  extractFunction('collectSearchMatches'),
  'globalThis.collectSearchMatches = collectSearchMatches;'
].join('\n\n'), context);

context.state.search = { query: '、[ \\t]*$', regex: true };
let result = context.collectSearchMatches('一、\n二。\n三、  \n');
assert.equal(result.error, '');
assert.deepEqual(Array.from(result.matches, match => match.text), ['、', '、  ']);

context.state.search = { query: '（', regex: false };
result = context.collectSearchMatches('全角（を探す）');
assert.equal(result.error, '');
assert.equal(result.matches.length, 1);
assert.equal(result.matches[0].text, '（');

context.state.search = { query: '[', regex: true };
result = context.collectSearchMatches('確認用');
assert.ok(result.error, 'invalid regex must be reported instead of throwing');
assert.equal(result.matches.length, 0);

console.log('v0.6.6 search logic tests: passed');
