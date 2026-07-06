/*
 * Text Review Studio v0.6.2
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
  'baselineEmptyState', 'workingEmptyState', 'compareStartHint',
  'baselineCompare', 'afterCompare', 'gutterMap', 'diffLegend',
  'reviewRail', 'reviewRailHint', 'nextAction', 'copyButton'
].forEach(token => assert.ok(html.includes(token), `missing UI anchor: ${token}`));

const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map(match => match[1]);
const unhandled = [...new Set(actions)].filter(action => !app.includes(`case '${action}'`) && action !== 'scroll-top');
assert.deepStrictEqual(unhandled, [], `unhandled data-action values: ${unhandled.join(', ')}`);

[
  'function renderEntryGuides()', 'function renderDiffLegend()',
  'function toggleDiffLegend()', 'function closeRailHint()', 'function focusPane(which)',
  'LEGACY_SAVE_KEYS', 'legendDismissed', 'railHintDismissed'
].forEach(token => assert.ok(app.includes(token), `missing first-use behavior: ${token}`));

assert.ok(/id="copyButton"[^>]*disabled/.test(html), 'copy must start disabled until the right-hand text exists');
assert.ok(app.includes("$('#copyButton').disabled = !hasWorking"), 'copy availability must follow working text');
assert.ok(app.includes('aria-label="差分：${kindLabel}'), 'gutter markers need text alternatives');

const v062 = css.slice(css.lastIndexOf('/* v0.6.2'));
assert.ok(v062.includes('.pane-empty-state'), 'missing guided empty states');
assert.ok(v062.includes('.source-diff { background: transparent !important'), 'source side must be colour-only');
assert.ok(v062.includes('.before-pane .compare-row.is-active,\n.after-pane .compare-row.is-active'), 'active row treatment must be centralized');
assert.ok(v062.includes('box-shadow: none !important'), 'active rows must not paint a source marker');
assert.ok(v062.includes('.gutter-marker.is-active'), 'active location must be shown in the gutter');
assert.ok(v062.includes('.menu-group'), 'sidebar must group first-use, preferences, and detailed actions');
assert.ok(v062.includes('@media (max-width: 1120px)'), 'compact sidebar behavior is required');

console.log('v0.6.2 UI contract tests: passed');
