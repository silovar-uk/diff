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
  'finalPreviewButton', 'finalPreviewDialog', 'finalPreviewText',
  'helpButton', 'helpPanel', 'helpCurrentTitle', 'helpCurrentText', 'clearAllButton'
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
assert.ok(html.includes('<strong class="brand-label">差分比較</strong>'), 'app identity must be 差分比較');
assert.ok(!html.includes('>TRS<'), 'TRS label must not remain');
assert.ok(html.includes('<title>差分比較</title>'), 'document title must use 差分比較');
assert.ok(!html.includes('data-action="paste-before"'), 'paste-before buttons must be removed');
assert.ok(!html.includes('data-action="paste-after"'), 'paste-after buttons must be removed');
assert.equal((html.match(/>消去<\/button>/g) || []).length, 2, 'both pane clear actions must use the 消去 label');
assert.ok(html.includes('class="pane-popover'), 'editing tools must be grouped into floating pane popovers');
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
assert.ok(html.includes('class="topbar app-bar"'), 'the app must use one unified omnibar');
assert.ok(!html.includes('class="desk-toolbar"'), 'the second persistent toolbar must not return');
assert.ok(uiRefresh.includes('.app-bar {'), 'compact omnibar styles are required');
assert.ok(uiRefresh.includes('--topbar-height:44px'), 'desktop chrome budget requires a 44px app bar');
assert.ok(uiRefresh.includes('--pane-head-height:40px'), 'pane headers must stay at 40px');
assert.ok(uiRefresh.includes('.pane-popover-panel {'), 'editing tools must float over the document');
assert.ok(uiRefresh.includes('.selection-toolbar-floating {'), 'selection tools must not affect layout');
assert.ok(uiRefresh.includes('.editor-pane.is-working'), 'working copy must be visually distinguished');
assert.ok(!html.includes('editor-tools-row'), 'shared spacer tool rows must not return');
assert.ok(html.includes('data-pane-menu'), 'working copy tools must be available from pane-header popovers');
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
assert.equal(toolDetails.length, 1, 'only operation history remains an in-panel disclosure');
toolDetails.forEach(tag => assert.doesNotMatch(tag, /\bopen(?:[\s=>])/));
assert.equal((html.match(/data-pane-menu/g) || []).length, 3, 'polish, search and other tools must be header popovers');
assert.ok(html.indexOf('quickPolishTitle') < html.indexOf('searchInput'));
assert.ok(html.indexOf('searchInput') < html.indexOf('CMSタグを追加'));
assert.ok(html.indexOf('CMSタグを追加') < html.indexOf('replaceHistoryCount'));
assert.ok(html.indexOf('topbar app-bar') < html.indexOf('editor-pane is-reference'), 'one app bar must precede the editor');
assert.ok(html.indexOf('selectionToolbar') > html.indexOf('editor-pane is-working'), 'selection tools belong to the working pane');
assert.ok(html.indexOf('selectionToolbar') < html.indexOf('workingText'), 'selection tools overlay the working editor rather than preceding both panes');
assert.ok(app.includes('updateWorkflowVisibility'));
assert.ok(app.includes("$('#chatgptReviewButton').hidden = mode !== 'compare'"));
assert.ok(app.includes('function reviewKey(row)'), 'review progress must use content-derived keys');
assert.ok(app.includes('function toggleReviewed(index)'), 'individual changes must be reviewable');
assert.ok(app.includes('function renderCollapsedRows()'), 'unchanged runs must be collapsible');
assert.ok(app.includes('function openFinalPreview()'), 'final text reading mode is required');
assert.ok(app.includes('function toggleReviewFocus()'), 'focus review mode is required');
assert.ok(html.includes('id="moreMenu"'));
assert.ok(html.includes('id="clearAllButton"'), 'clear-all must be permanently visible in the top bar');
assert.ok(html.indexOf('id="clearAllButton"') < html.indexOf('id="copyButton"'), 'clear-all must sit before output in the top actions');
assert.doesNotMatch(html, /id="moreMenu"[^>]*hidden>[\s\S]*?data-clear-all/, 'clear-all must not be hidden in the overflow menu');
assert.ok(html.includes('id="helpButton"'), 'help button is required');
assert.ok(html.includes('id="helpPanel"'), 'contextual help panel is required');
assert.ok(app.includes('function getHelpContext()'), 'help must react to current workspace state');
assert.ok(app.includes('function toggleHelp()'), 'help panel requires explicit open/close logic');
assert.ok(app.includes('function clearAllDocuments()'), 'full clear must be owned by the app history transaction');
assert.ok(clearAll.includes('window.TextReviewApp?.clearAllDocuments?.()'), 'clear-all module must delegate to the app transaction');
assert.ok(app.includes("event.target === $('#baselineText')"), 'before editor must use app-level undo');
assert.ok(app.includes("event.target === $('#workingText')"), 'after editor must use app-level undo');
assert.ok(app.includes("event.key.toLowerCase() === 'z'"), 'Ctrl/Cmd+Z handling is required');
assert.ok(html.includes('title="やり直す Ctrl+Y"'), 'redo button must advertise Ctrl+Y');
assert.ok(html.includes('aria-keyshortcuts="Control+Y"'), 'redo accessibility shortcut must use Ctrl+Y');
assert.ok(html.includes('<kbd>Ctrl</kbd> + <kbd>Y</kbd>'), 'help must document Ctrl+Y for redo');
assert.ok(!html.includes('Ctrl+Shift+Z'), 'Ctrl+Shift+Z must not be advertised as redo');
assert.ok(!html.includes('原稿へ戻る'));
['BEFORE / REFERENCE', 'AFTER / WORKING', 'QUICK POLISH', 'SESSION HISTORY', 'EDITING TOOLS'].forEach(label => assert.ok(!html.includes(label)));
assert.match(html, /class="topbar app-bar"[\s\S]*?id="editModeButton"[\s\S]*?id="reviewProgress"[\s\S]*?id="diffPrev"[\s\S]*?id="copyButton"/);
assert.ok(html.indexOf('id="diffSummary"') < html.indexOf('id="editorView"'), 'review summary must live in the omnibar popover');
assert.ok(app.includes("mobile.addEventListener('change', syncOtherTools)"));
assert.ok(app.includes("event.key.toLowerCase() === 'j'"));
assert.ok(app.includes("event.key.toLowerCase() === 'v'"), 'V must toggle reviewed state for the active diff');
assert.ok(uiRefresh.includes('grid-template-columns:1fr;'), 'mobile review must support a unified vertical layout');
assert.ok(app.includes('!event.isComposing'));
assert.ok(uiRefresh.includes('prefers-reduced-motion'));
console.log('workspace redesign contract tests: passed');
