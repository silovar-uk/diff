/*
 * Text Review Studio v0.6.3
 * Static UI contract checks. No browser, network, or external dependency.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const requiredFiles = ['app.js', 'diff-core.js', 'styles.css', 'manifest.webmanifest', 'assets/app-icon.png'];
requiredFiles.forEach(file => assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`));

[
  'control-sidebar', 'sidebarStartHint', 'menu-group', 'profileSelect',
  'baselineEmptyState', 'workingEmptyState', 'workspaceGuidance',
  'compareStartHint', 'baselineCompare', 'afterCompare', 'gutterMap', 'diffLegend',
  'reviewRail', 'reviewRailHint', 'nextAction', 'copyButton', 'selectionToolbar'
].forEach(token => assert.ok(html.includes(token), `missing UI anchor: ${token}`));

const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map(match => match[1]);
const unhandled = [...new Set(actions)].filter(action => !app.includes(`case '${action}'`) && action !== 'scroll-top');
assert.deepStrictEqual(unhandled, [], `unhandled data-action values: ${unhandled.join(', ')}`);

[
  'function renderEntryGuides()', 'function syncWorkspaceGuidance()',
  'function renderDiffLegend()', 'function toggleDiffLegend()',
  'function closeRailHint()', 'function focusPane(which)',
  'LEGACY_SAVE_KEYS', 'text-review-studio-v0.6.2'
].forEach(token => assert.ok(app.includes(token), `missing layout safety behavior: ${token}`));

assert.ok(/id="copyButton"[^>]*disabled/.test(html), 'copy must start disabled until the right-hand text exists');
assert.ok(app.includes("$('#copyButton').disabled = !hasWorking"), 'copy availability must follow working text');
assert.ok(app.includes('aria-label="差分：${kindLabel}'), 'gutter markers need text alternatives');

const v063 = css.slice(css.lastIndexOf('/* v0.6.3'));
assert.ok(v063.includes('layout safety'), 'missing v0.6.3 style marker');
assert.ok(css.includes('.workspace-guidance { display: flex'), 'guidance must be placed in normal flow');
assert.ok(css.includes('.compare-start-hint { display: flex'), 'entry hint must be an inline guide');
assert.ok(css.includes('.diff-legend { position: relative'), 'legend must not float over a document pane');
assert.ok(html.includes('class="after-content"'), 'selection toolbar needs a dedicated flow container');
assert.ok(css.includes('.selection-toolbar { display: flex'), 'selection toolbar must be inline');
assert.ok(css.includes('.after-content { display: grid'), 'after pane must preserve its three-row grid when the inline toolbar opens');
assert.ok(!css.includes('.selection-toolbar { position: absolute'), 'selection toolbar must not cover the working text');
assert.ok(css.includes('.rail-hint { position: relative'), 'rail hint must stay inside the rail');
assert.ok(!css.includes('.compare-start-hint { position: absolute'), 'entry hint must not overlap editors');
assert.ok(!css.includes('.diff-legend { position: absolute'), 'legend must not overlap editors');
assert.ok(css.includes('.source-diff { background: transparent !important'), 'source side must stay colour-only');

console.log('v0.6.3 UI contract tests: passed');
