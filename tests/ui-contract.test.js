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
const uiRefresh = read('ui-refresh.css');
const excel = read('xlsx-export-v1.js');
const engine = read('diff-engine-v1.js');
const replace = read('replace-tools-v1.js');
const blankCleanup = read('blank-line-cleanup-v1.js');
const chatgptReview = read('chatgpt-review-v1.js');
const clearAll = read('clear-all-v1.js');
const replaceCss = read('replace-tools-v1.css');

[
  'diff-engine-v1.js', 'app-v1.js', 'app-v1.css', 'ui-refresh.css', 'xlsx-export-v1.js',
  'replace-tools-v1.js', 'blank-line-cleanup-v1.js', 'chatgpt-review-v1.js', 'replace-tools-v1.css', 'assets/app-icon.png'
].forEach((file) => assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`));

[
  'baselineText', 'workingText', 'editModeButton', 'compareModeButton',
  'ignoreHtmlTagsToggle', 'editorView', 'compareView', 'diffRows',
  'copyButton', 'copyMenu', 'displayDialog', 'displayShowTags',
  'displayWhitespace', 'displayUrls', 'searchInput', 'replaceInput',
  'replaceHistory', 'replaceHistoryCount', 'chatgptReviewButton', 'toast',
  'reviewProgress', 'reviewSidebarProgress', 'reviewFocusButton',
  'finalPreviewButton', 'finalPreviewDialog', 'finalPreviewText'
].forEach((id) => assert.ok(html.includes(`id="${id}"`), `missing v1 UI anchor: ${id}`));

['projectTitle', 'profileSelect', 'reviewRail', 'reviewPanel', 'workspaceDisplayDialog']
  .forEach((id) => assert.ok(!html.includes(`id="${id}"`), `legacy UI must not remain in active HTML: ${id}`));

[
  'pre-app-compat.js', 'app.js', 'cms-tag-tools.js', 'workspace-ui.js',
  'difff-rail-view.js', 'xlsx-export.js', 'diff-core.js',
  'diff-core-hunk-bridge.js', 'diff-ignore-assets.js'
].forEach((file) => assert.ok(!html.includes(`src="${file}"`), `legacy runtime must not be loaded: ${file}`));

['diff-engine-v1.js', 'app-v1.js', 'chatgpt-review-v1.js', 'replace-tools-v1.js', 'blank-line-cleanup-v1.js', 'xlsx-export-v1.js']
  .forEach((file) => assert.ok(html.includes(`src="${file}"`), `v1 runtime missing: ${file}`));
assert.ok(html.includes('href="replace-tools-v1.css"'), 'replace tool styles must be loaded');
assert.ok(html.includes('href="ui-refresh.css"'), 'UI refresh styles must be loaded');
assert.ok(html.includes('class="workflow-strip workflow-start"'), 'task-first empty-state guidance must be visible');
assert.ok(html.includes('class="tool-section"'), 'editing tools must be grouped into collapsible sections');
assert.equal((html.match(/id="chatgptReviewButton"/g) || []).length, 1, 'ChatGPT review button must be unique');
assert.ok(html.indexOf('src="diff-engine-v1.js"') < html.indexOf('src="chatgpt-review-v1.js"'), 'ChatGPT module must load after the diff engine');
assert.ok(html.indexOf('src="app-v1.js"') < html.indexOf('src="chatgpt-review-v1.js"'), 'ChatGPT module must load after the app controller');
assert.ok(!clearAll.includes('chatgpt-review'), 'clear-all must not load or own ChatGPT integration');
assert.ok(!clearAll.includes('chatgptReviewButton'), 'clear-all must not create the ChatGPT button');
assert.ok(chatgptReview.includes('function buildPrompt('), 'ChatGPT integration must expose prompt generation');
assert.ok(chatgptReview.includes('function buildLaunchPlan('), 'ChatGPT integration must isolate launch planning');
assert.ok(chatgptReview.includes('function copyPrompt('), 'ChatGPT integration must isolate clipboard handoff');
assert.ok(chatgptReview.includes('function openChatGPT('), 'ChatGPT integration must isolate ChatGPT opening');
assert.ok(chatgptReview.includes('showManualPrompt'), 'clipboard failure must expose a manual-copy fallback');

const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);
const uniqueActions = [...new Set(actions)];
uniqueActions.forEach((action) => assert.ok(app.includes(`'${action}'`) || app.includes(`${action},`), `unhandled v1 action: ${action}`));

[
  'replace-next', 'replace-all', 'fullwidth-to-halfwidth', 'clear-history'
].forEach((action) => assert.ok(html.includes(`data-replace-action="${action}"`), `missing replace action: ${action}`));

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
assert.ok(engine.includes('beforeRaw,'), 'rows must retain raw source context for tag display');
assert.ok(engine.includes('afterRaw,'), 'rows must retain raw source context for tag display');
assert.ok(engine.includes('textChanged: before !== after'), 'rows must distinguish visible-text changes');
assert.ok(engine.includes('htmlChanged: JSON.stringify(beforeTags)'), 'rows must distinguish HTML-only changes');
assert.ok(engine.includes('function visibleText(rawLine, meta)'), 'display text must be independent from HTML comparison mode');
assert.ok(engine.includes('summary,'), 'the engine must return one shared summary');
assert.ok(!engine.includes('ensureCompatibilityAnchors'), 'the engine must not create fake DOM anchors');
assert.ok(!engine.includes('localStorage'), 'the comparison engine must stay independent from persistence');

assert.ok(replace.includes("const SESSION_KEY = 'text-review-studio-v1-replace-history'"), 'replacement history must be scoped to the current tab session');
assert.ok(replace.includes('function replaceAllLiteral('), 'literal replace-all is required');
assert.ok(replace.includes('function replaceOneAtOrAfter('), 'single replacement is required');
assert.ok(replace.includes('function toHalfwidthAscii('), 'fullwidth ASCII conversion is required');
assert.ok(replace.includes("new Set(['～', '？'])"), 'wave dash and question mark must remain fullwidth');
assert.ok(replace.includes('function removeInvisibleCharacters('), 'invisible-character cleanup is required');
assert.ok(replace.includes("button.dataset.replaceAction = 'remove-invisible-characters'"), 'invisible-character cleanup button must be added');
assert.ok(replace.includes("button.textContent = '見えない文字を削除'"), 'base cleanup button must explain invisible-character behavior');
assert.ok(blankCleanup.includes('function collapseExtraBlankLines('), 'extra blank lines must be collapsed after cleanup');
assert.ok(blankCleanup.includes("button.textContent = '余分な空白を削除'"), 'cleanup button must use the user-facing blank-space wording');
assert.ok(blankCleanup.includes("blankRun > 1"), 'one intentional blank line must remain');
assert.ok(replace.includes('changes: result.changes'), 'conversion history must retain exact character changes');
assert.ok(replace.includes('function createChangeList('), 'conversion details must render in history');
assert.ok(replace.includes('sessionStorage'), 'replacement history must use session storage');
assert.ok(replaceCss.includes('.replace-history-list'), 'replacement history styles are required');
assert.ok(uiRefresh.includes('.replace-history-changes'), 'detailed history styles are required');

assert.ok(css.includes('.topbar {'), 'topbar styles are required');
assert.ok(css.includes('z-index:2000'), 'copy menu must sit above sticky navigation');
assert.ok(css.includes('.desk-toolbar {'), 'fixed mode controls are required');
assert.ok(css.includes('position:sticky'), 'mode controls must remain visible while scrolling');
assert.ok(uiRefresh.includes('.tool-section summary'), 'collapsible editing tool styles are required');
assert.ok(uiRefresh.includes('.editor-pane.is-working'), 'working copy must be visually distinguished');
assert.ok(uiRefresh.includes('.working-tools'), 'editing tools must live with the working copy');
assert.ok(html.includes('class="editor-tools-row edit-only"'), 'editing tools must use the shared alignment row');
assert.ok(html.includes('class="editor-tools-spacer"'), 'the reference side must reserve matching tool-row height');
assert.ok(html.includes('class="editor-tools-slot"'), 'working-side tools must occupy the right half of the shared row');
assert.ok(uiRefresh.includes('.editor-tools-row {'), 'shared editor tool-row styles are required');
assert.ok(uiRefresh.includes('grid-column:1 / -1'), 'tool row must span both editor columns');
assert.ok(uiRefresh.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'), 'tool row must mirror the two editor columns');
assert.ok(uiRefresh.includes('.review-toggle'), 'reviewed state control styles are required');
assert.ok(uiRefresh.includes('.unchanged-fold'), 'unchanged-line folding styles are required');
assert.ok(uiRefresh.includes('.final-preview-text'), 'final reading mode styles are required');
assert.ok(uiRefresh.includes('body.review-focus'), 'focus review mode styles are required');

assert.ok(excel.includes('root.TextReviewApp?.getComparison?.()'), 'Excel must reuse the page comparison model');
assert.ok(excel.includes('part.type === changedType ? COLOR.red'), 'both Excel sides must use red changed text');
assert.ok(!excel.includes("String(model.before || '').length"), 'Excel must not show source character counts');
assert.ok(!excel.includes("String(model.after || '').length"), 'Excel must not show result character counts');

console.log('v1 unified runtime contract tests: passed');

// State-driven workspace contract.
assert.ok(html.includes('class="tool-section quick-polish-section"'));
assert.match(html, /<section[^>]*class="tool-section quick-polish-section"/);
assert.doesNotMatch(html, /<details[^>]*quick-polish/);
const toolDetails = [...html.matchAll(/<details class="tool-section[^>]*>/g)].map(m => m[0]);
assert.equal(toolDetails.length, 3);
toolDetails.forEach(tag => assert.doesNotMatch(tag, /\bopen(?:[\s=>])/));
assert.ok(html.indexOf('quickPolishTitle') < html.indexOf('searchInput'));
assert.ok(html.indexOf('searchInput') < html.indexOf('CMSタグを追加'));
assert.ok(html.indexOf('CMSタグを追加') < html.indexOf('replaceHistoryCount'));
assert.ok(html.indexOf('editor-tools-row') < html.indexOf('editor-pane is-reference'), 'tool row must sit above both editor panes');
assert.ok(html.indexOf('selectionToolbar') < html.indexOf('editor-pane is-reference'), 'selection tools must not push only the working textarea downward');
assert.ok(app.includes('updateWorkflowVisibility'));
assert.ok(app.includes("$('#chatgptReviewButton').hidden = mode !== 'compare'"));
assert.ok(app.includes('function reviewKey(row)'), 'review progress must use content-derived keys');
assert.ok(app.includes('function toggleReviewed(index)'), 'individual changes must be reviewable');
assert.ok(app.includes('function renderCollapsedRows()'), 'unchanged runs must be collapsible');
assert.ok(app.includes('function openFinalPreview()'), 'final text reading mode is required');
assert.ok(app.includes('function toggleReviewFocus()'), 'focus review mode is required');
assert.ok(html.includes('id="moreMenu"'));
assert.match(html, /id="moreMenu"[^>]*hidden>[\s\S]*?data-clear-all/);
assert.ok(!html.includes('原稿へ戻る'));
['BEFORE / REFERENCE', 'AFTER / WORKING', 'QUICK POLISH', 'SESSION HISTORY', 'EDITING TOOLS'].forEach(label => assert.ok(!html.includes(label)));
assert.match(html, /class="desk-toolbar"[\s\S]*?id="diffSummary"[\s\S]*?id="diffPrev"[\s\S]*?id="chatgptReviewButton"/);
assert.ok(app.includes("mobile.addEventListener('change', syncOtherTools)"));
assert.ok(app.includes("event.key.toLowerCase() === 'j'"));
assert.ok(app.includes("event.key.toLowerCase() === 'v'"), 'V must toggle reviewed state for the active diff');
assert.ok(uiRefresh.includes('grid-template-columns:1fr;'), 'mobile review must support a unified vertical layout');
assert.ok(app.includes('!event.isComposing'));
assert.ok(uiRefresh.includes('prefers-reduced-motion'));
console.log('workspace redesign contract tests: passed');
