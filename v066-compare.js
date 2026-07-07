/* v0.6.6 visual comparison add-on */
(() => {
  'use strict';
  const Diff = window.TextReviewDiffCore;
  if (!Diff || typeof Diff.diffRows !== 'function') return;

  const $ = (s) => document.querySelector(s);
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trimNl = (v = '') => String(v).replace(/\n$/, '');
  let ignoreTags = true;
  let timer = 0;
  let syncing = false;
  const key = 'text-review-studio-v066-ignore-html-tags';
  try { ignoreTags = localStorage.getItem(key) !== 'false'; } catch (_) {}

  function compareOn() { return $('#compareModeButton')?.classList.contains('is-active'); }
  function partHtml(row, side) {
    return row.parts.map(part => {
      if ((side === 'before' && part.type === 'add') || (side === 'after' && part.type === 'remove')) return '';
      const value = trimNl(part.value);
      if (!value) return '';
      if (part.type === 'same') return esc(value);
      return side === 'before'
        ? `<span class="source-diff source-diff-remove">${esc(value)}</span>`
        : `<span class="cms-diff cms-diff-add">${esc(value)}</span>`;
    }).join('') || '&nbsp;';
  }
  function marker(row) {
    const symbol = row.kind === 'insert' ? '+' : row.kind === 'delete' ? '−' : row.kind === 'replace' ? '↔' : '·';
    const css = row.kind === 'insert' ? 'add' : row.kind === 'delete' ? 'remove' : row.kind === 'replace' ? 'replace' : 'same';
    return `<button class="gutter-marker ${css}" data-v066-row="${esc(row.id)}" aria-label="${row.kind}">${symbol}</button>`;
  }
  function align() {
    const left = [...document.querySelectorAll('#baselineCompare .compare-row')];
    const right = [...document.querySelectorAll('#afterCompare .compare-row')];
    const count = Math.min(left.length, right.length);
    for (let i = 0; i < count; i += 1) left[i].style.minHeight = right[i].style.minHeight = '';
    for (let i = 0; i < count; i += 1) {
      const height = Math.max(31, Math.ceil(left[i].getBoundingClientRect().height), Math.ceil(right[i].getBoundingClientRect().height));
      left[i].style.minHeight = right[i].style.minHeight = `${height}px`;
    }
  }
  function render() {
    const before = $('#baselineText');
    const after = $('#workingText');
    const left = $('#baselineCompare');
    const right = $('#afterCompare');
    const gutter = $('#gutterMap');
    const control = $('#v066TagIgnore');
    if (!before || !after || !left || !right || !gutter || !control) return;
    control.hidden = !compareOn();
    if (!compareOn()) return;
    const rows = Diff.diffRows(before.value, after.value, { ignoreHtmlTags: ignoreTags }).rows;
    left.innerHTML = rows.map(row => `<div class="compare-row" data-v066-id="${esc(row.id)}">${partHtml(row, 'before')}</div>`).join('');
    right.innerHTML = rows.map(row => `<div class="compare-row" data-v066-id="${esc(row.id)}">${partHtml(row, 'after')}</div>`).join('');
    const changed = rows.filter(row => row.kind !== 'same');
    gutter.innerHTML = changed.length ? changed.map(marker).join('') : '<span class="gutter-marker same">✓</span>';
    left.hidden = false;
    right.hidden = false;
    requestAnimationFrame(align);
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 30); }
  function addControl() {
    if ($('#v066TagIgnore')) return;
    const toolbar = $('.desk-toolbar');
    if (!toolbar) return;
    const control = document.createElement('div');
    control.id = 'v066TagIgnore';
    control.hidden = true;
    control.style.cssText = 'display:flex;align-items:center;gap:8px;margin:-2px 0 12px;padding:8px 11px;border:1px solid #d8deea;border-radius:9px;background:#fff;color:#53627e;font-size:12px';
    control.innerHTML = '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;color:#17213a;font-weight:700"><input id="v066IgnoreTags" type="checkbox"> タグを無視</label><span>&lt;&gt;内が英字で始まるHTMLタグを比較対象から外します</span>';
    toolbar.insertAdjacentElement('afterend', control);
    const box = $('#v066IgnoreTags');
    box.checked = ignoreTags;
    box.addEventListener('change', () => { ignoreTags = box.checked; try { localStorage.setItem(key, String(ignoreTags)); } catch (_) {} schedule(); });
  }
  function syncScroll(source) {
    if (syncing) return;
    syncing = true;
    const top = source.scrollTop;
    [$('#baselineCompare'), $('#afterCompare')].forEach(node => { if (node && node !== source) node.scrollTop = top; });
    requestAnimationFrame(() => { syncing = false; });
  }
  function bind() {
    const before = $('#baselineText');
    const after = $('#workingText');
    const compare = $('#compareModeButton');
    const edit = $('#editModeButton');
    const left = $('#baselineCompare');
    const right = $('#afterCompare');
    const gutter = $('#gutterMap');
    if (!before || !after || !compare || !edit || !left || !right || !gutter) return;
    [before, after].forEach(node => node.addEventListener('input', schedule));
    [compare, edit].forEach(node => node.addEventListener('click', () => setTimeout(render, 0)));
    new MutationObserver(schedule).observe(compare, { attributes: true, attributeFilter: ['class'] });
    left.addEventListener('scroll', () => syncScroll(left), { passive: true });
    right.addEventListener('scroll', () => syncScroll(right), { passive: true });
    gutter.addEventListener('click', event => {
      const button = event.target.closest('[data-v066-row]');
      if (!button) return;
      const id = button.dataset.v066Row;
      document.querySelectorAll('[data-v066-id], [data-v066-row]').forEach(node => node.classList.toggle('is-active', node.dataset.v066Id === id || node.dataset.v066Row === id));
      right.querySelector(`[data-v066-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  function boot() { addControl(); bind(); render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
