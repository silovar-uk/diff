/* Text Review Studio v1 – static UI and architecture contract. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('app-v1.js');
const css = read('app-v1.css');
const excel = read('xlsx-export-v1.js');
const engine = read('diff-engine-v1.js');

['diff-engine-v1.js', 'app-v1.js', 'app-v1.css', 'xlsx-export-v1.js', 'assets/app-icon.png']
  .forEach((file) => assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`));

[
  'baselineText', 'workingText', 'editModeButton', 'compareModeButton',
  'ignoreHtmlTagsToggle', 'editorView', 'compareView', 'diffRows',
  'copyButton', 'copyMenu', 'displayDialog', 'displayShowTags',
  'displayWhitespace', 'displayUrls', 'searchInput', 'toast'
].forEach((id) => assert.ok(html.includes(`id="${id}"`), `missing v1 UI anchor: ${id}`));

['projectTitle', 'profileSelect', 'reviewRail', 'reviewPanel', 'workspaceDisplayDialog']
  .forEach((id) => assert.ok(!html.includes(`id="${id}"`), `legacy UI must not remain in active HTML: ${id}`));

[
  'pre-app-compat.js', 'app.js', 'cms-tag-tools.js', 'workspace-ui.js',
  'difff-rail-view.js', 'xlsx-export.js', 'diff-core.js',
  'diff-core-hunk-bridge.js', 'diff-ignore-assets.js'
].forEach((file) => assert.ok(!html.includes(`src="${file}"`), `legacy runtime must not be loaded: ${file}`));

['diff-engine-v1.js', 'app-v1.js', 'xlsx-export-v1.js']
  .forEach((file) => assert.ok(html.includes(`src="${file}"`), `v1 runtime missing: ${file}`));

const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);
const uniqueActions = [...new Set(actions)];
uniqueActions.forEach((action) => assert.ok(app.includes(`'${action}'`) || app.includes(`${action},`), `unhandled v1 action: ${action}`));

assert.ok(app.includes("const STORAGE_KEY = 'text-review-studio-v1'"), 'v1 persistence key is required');
assert.ok(app.includes('window.TextReviewApp'), 'the app must expose its cached comparison to exporters');
assert.ok(app.includes('getComparison()'), 'the shared comparison getter is required');
assert.ok(app.includes('const REQUIRED_IDS = ['), 'the controller must validate its DOM contract at boot');
assert.ok(app.includes('if (!assertDomContract()) return;'), 'boot must stop cleanly when required DOM is missing');
assert.ok(!app.includes('setInterval('), 'polling is prohibited in the v1 controller');
assert.ok(!app.includes('MutationObserver'), 'DOM mutation polling is prohibited in the v1 controller');
assert.ok(!app.includes('projectTitle'), 'removed title state must not return');
assert.ok(!app.includes('profileSelect'), 'removed profile state must not return');
assert.ok(!app.includes('function ignoreStructuralRows('), 'structure filtering must not be duplicated in the controller');
assert.ok(app.includes('summary: result.summary || summaryFromRows(rows)'), 'the controller must consume the engine summary directly');
assert.ok(app.includes('row.beforeRaw'), 'tag display must use raw row context from the engine');
assert.ok(app.includes('row.afterRaw'), 'tag display must use raw row context from the engine');

assert.ok(engine.includes('function classifyRawLine('), 'the unified engine must own CMS classification');
assert.ok(engine.includes('const STRUCTURAL_TAGS'), 'the unified engine must define structural HTML handling');
assert.ok(engine.includes('beforeRaw:'), 'rows must retain raw source context for tag display');
assert.ok(engine.includes('summary,'), 'the engine must return one shared summary');
assert.ok(!engine.includes('ensureCompatibilityAnchors'), 'the engine must not create fake DOM anchors');
assert.ok(!engine.includes('localStorage'), 'the comparison engine must stay independent from persistence');

assert.ok(css.includes('.topbar {'), 'topbar styles are required');
assert.ok(css.includes('z-index:2000'), 'copy menu must sit above sticky navigation');
assert.ok(css.includes('.desk-toolbar {'), 'fixed mode controls are required');
assert.ok(css.includes('position:sticky'), 'mode controls must remain visible while scrolling');

assert.ok(excel.includes('root.TextReviewApp?.getComparison?.()'), 'Excel must reuse the page comparison model');
assert.ok(excel.includes('part.type === changedType ? COLOR.red'), 'both Excel sides must use red changed text');
assert.ok(!excel.includes("String(model.before || '').length"), 'Excel must not show source character counts');
assert.ok(!excel.includes("String(model.after || '').length"), 'Excel must not show result character counts');

console.log('v1 unified runtime contract tests: passed');
