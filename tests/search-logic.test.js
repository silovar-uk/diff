'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.resolve(__dirname, '..', 'app-v1.js'), 'utf8');

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

// Exercise the shipped literal-search implementation, not removed v0.6 regex helpers.
const context = {
  state: { after: '', search: { query: '', matches: [], current: -1 } },
  renderSearch() {}
};
vm.createContext(context);
vm.runInContext(extractFunction('computeSearch') + '\nglobalThis.computeSearch = computeSearch;', context);
for (const [text, query, positions] of [
  ['一、\n二。\n三、  \n', '、', [1, 7]],
  ['全角（を探す）', '（', [2]],
  ['確認[用[', '[', [2, 4]],
  ['aaaa', 'aa', [0, 2]],
  ['確認用', '', []],
  ['確認用', 'ない', []],
  ['🙂🙂', '🙂', [0, 2]]
]) {
  context.state.after = text;
  context.state.search.query = query;
  context.computeSearch();
  assert.deepEqual(Array.from(context.state.search.matches), positions);
  assert.equal(context.state.search.current, positions.length ? 0 : -1);
}
console.log('v1 literal search tests: passed');
