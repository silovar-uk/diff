/* Text Review Studio v1 – export the three-column comparison as one long PNG. */
(function (root) {
  'use strict';

  const EXPORT_WIDTH = 1200;
  const MAX_CANVAS_DIMENSION = 32760;
  const MAX_CANVAS_AREA = 100000000;
  let exporting = false;

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }

  function notify(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = root.setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  function closeOutputMenu() {
    const menu = document.querySelector('#copyMenu');
    if (menu) menu.hidden = true;
    document.querySelector('#copyButton')?.setAttribute('aria-expanded', 'false');
  }

  function currentModel() {
    root.TextReviewApp?.recalculate?.();
    const cached = root.TextReviewApp?.getComparison?.();
    if (cached) return cached;
    const before = document.querySelector('#baselineText')?.value || '';
    const after = document.querySelector('#workingText')?.value || '';
    const rows = root.TextReviewDiffCore?.diffRows(before, after, {
      ignoreHtmlTags:document.querySelector('#ignoreHtmlTagsToggle')?.checked ?? true
    })?.rows || [];
    return { before, after, rows };
  }

  function displayOptions() {
    return root.TextReviewApp?.getState?.()?.displayOptions || {
      showTags:false,
      showWhitespace:false,
      highlightUrls:false
    };
  }

  function marker(kind) {
    return ({ replace:'↔', insert:'＋', delete:'−' }[kind] || '');
  }

  function formatWhitespace(text, options) {
    let output = escapeHTML(text);
    if (!options.showWhitespace) return output;
    return output
      .replace(/　/g, '<span class="visible-space">□</span>')
      .replace(/ /g, '<span class="visible-space">·</span>')
      .replace(/\n/g, '<span class="visible-newline">↵</span>\n');
  }

  function formatText(text, options) {
    const input = String(text || '');
    if (!options.highlightUrls) return formatWhitespace(input, options);
    const pattern = /https?:\/\/[^\s<]+/g;
    let output = '';
    let cursor = 0;
    let match;
    while ((match = pattern.exec(input))) {
      output += formatWhitespace(input.slice(cursor, match.index), options);
      output += `<span class="highlight-url">${escapeHTML(match[0])}</span>`;
      cursor = match.index + match[0].length;
    }
    output += formatWhitespace(input.slice(cursor), options);
    return output;
  }

  function rowRaw(model, row, side) {
    const direct = side === 'before' ? row.beforeRaw : row.afterRaw;
    if (typeof direct === 'string') return direct;
    const source = side === 'before' ? model.before : model.after;
    const start = side === 'before' ? row.beforeStart : row.afterStart;
    const end = side === 'before' ? row.beforeEnd : row.afterEnd;
    return source.slice(start || 0, end || start || 0);
  }

  function tagChips(model, row, side, options) {
    if (!options.showTags) return '';
    const tags = rowRaw(model, row, side).match(/<\/?[A-Za-z][^>]*>/g) || [];
    if (!tags.length) return '';
    return `<div class="tag-context">${tags.map((tag) => `<code class="tag-chip">${escapeHTML(tag)}</code>`).join('')}</div>`;
  }

  function renderInline(model, row, side, options) {
    const include = side === 'before' ? new Set(['same', 'remove']) : new Set(['same', 'add']);
    const changed = side === 'before' ? 'remove' : 'add';
    const css = side === 'before' ? 'diff-before-change' : 'diff-after-change';
    const parts = Array.isArray(row.parts) ? row.parts : [];
    let html = parts.filter((part) => include.has(part.type)).map((part) => {
      const text = formatText(part.value, options);
      return part.type === changed ? `<span class="${css}">${text}</span>` : text;
    }).join('');
    if (!html) {
      const fallback = side === 'before' ? row.before : row.after;
      if (fallback) html = row.kind === 'same' ? formatText(fallback, options) : `<span class="${css}">${formatText(fallback, options)}</span>`;
    }
    return `${tagChips(model, row, side, options)}${html || '<span class="diff-empty">&nbsp;</span>'}`;
  }

  function buildRows(model, options) {
    return (model.rows || []).map((row) => {
      const beforeEmpty = !row.before ? ' is-empty' : '';
      const afterEmpty = !row.after ? ' is-empty' : '';
      const symbol = marker(row.kind);
      const label = row.kind === 'replace' ? '置換' : row.kind === 'insert' ? '追加' : '削除';
      const rail = symbol ? `<button type="button" class="diff-marker ${row.kind}" aria-label="${label}">${symbol}</button>` : '';
      return `<article class="diff-row"><div class="diff-cell before${beforeEmpty}">${renderInline(model, row, 'before', options)}</div><div class="diff-rail-cell">${rail}</div><div class="diff-cell after${afterEmpty}">${renderInline(model, row, 'after', options)}</div></article>`;
    }).join('');
  }

  function createExportStage(model) {
    const stage = document.createElement('div');
    stage.setAttribute('aria-hidden', 'true');
    stage.style.cssText = [
      'position:fixed', 'left:-100000px', 'top:0', `width:${EXPORT_WIDTH}px`,
      'min-height:0', 'overflow:visible', 'box-sizing:border-box',
      'color:#24324a', 'background:#fff', 'border:1px solid #dfe5ef',
      'font-family:"Yu Gothic UI","Yu Gothic","Hiragino Kaku Gothic ProN",Meiryo,sans-serif',
      'pointer-events:none', 'z-index:-1'
    ].join(';');
    stage.innerHTML = `<div class="diff-grid-head" aria-hidden="true"><div>変更前</div><div>差分</div><div>修正後</div></div><div>${buildRows(model, displayOptions())}</div>`;

    const head = stage.querySelector('.diff-grid-head');
    head.style.position = 'static';
    head.style.gridTemplateColumns = 'minmax(0,1fr) 42px minmax(0,1fr)';
    head.style.backdropFilter = 'none';
    head.style.webkitBackdropFilter = 'none';
    head.querySelectorAll('div').forEach((cell, index) => {
      cell.style.padding = index === 1 ? '8px 0' : '8px 15px';
    });
    stage.querySelectorAll('.diff-row').forEach((row) => {
      row.style.gridTemplateColumns = 'minmax(0,1fr) 42px minmax(0,1fr)';
    });
    stage.querySelectorAll('.diff-cell').forEach((cell) => {
      cell.style.padding = '11px 16px';
      cell.style.fontSize = '14px';
      cell.style.lineHeight = '1.9';
    });
    stage.querySelectorAll('.diff-marker').forEach((button) => {
      button.style.width = '27px';
      button.style.height = '27px';
      button.style.fontSize = '14px';
    });
    document.body.appendChild(stage);
    return stage;
  }

  function copyComputedStyles(source, target) {
    if (source.nodeType === Node.ELEMENT_NODE && target.nodeType === Node.ELEMENT_NODE) {
      const computed = root.getComputedStyle(source);
      for (const property of computed) {
        target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
      }
    }
    const sourceChildren = source.childNodes;
    const targetChildren = target.childNodes;
    for (let index = 0; index < sourceChildren.length; index += 1) {
      copyComputedStyles(sourceChildren[index], targetChildren[index]);
    }
  }

  function svgImage(stage, width, height) {
    const clone = stage.cloneNode(true);
    copyComputedStyles(stage, clone);
    clone.style.position = 'static';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.zIndex = '0';
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    const html = new XMLSerializer().serializeToString(clone);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="100%" height="100%">${html}</foreignObject></svg>`;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('PNG描画用データを読み込めませんでした'));
      image.src = url;
    });
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNGデータを生成できませんでした')), 'image/png');
    });
  }

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'diff-result.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function exportCurrentDiffPng(button) {
    if (exporting) return;
    const model = currentModel();
    if (!model.before || !model.after) {
      notify('変更前と修正後の原稿を入力してください');
      return;
    }
    if (!model.rows?.length) {
      notify('PNGにできる比較結果がありません');
      return;
    }

    exporting = true;
    const original = button?.innerHTML || '';
    if (button) {
      button.disabled = true;
      button.innerHTML = '<strong>PNG生成中…</strong><span>原稿全体を画像化しています</span>';
    }

    let stage;
    let svgUrl;
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      stage = createExportStage(model);
      await new Promise((resolve) => root.requestAnimationFrame(() => root.requestAnimationFrame(resolve)));
      const rect = stage.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(Math.max(rect.height, stage.scrollHeight));
      if (!width || !height) throw new Error('比較結果の大きさを取得できませんでした');

      const desiredScale = 2;
      const dimensionScale = Math.min(MAX_CANVAS_DIMENSION / width, MAX_CANVAS_DIMENSION / height);
      const areaScale = Math.sqrt(MAX_CANVAS_AREA / (width * height));
      const scale = Math.max(0.05, Math.min(desiredScale, dimensionScale, areaScale));
      const svg = svgImage(stage, width, height);
      const svgBlob = new Blob([svg], { type:'image/svg+xml;charset=utf-8' });
      svgUrl = URL.createObjectURL(svgBlob);
      const image = await loadImage(svgUrl);

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('PNG描画を開始できませんでした');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.drawImage(image, 0, 0, width, height);

      const blob = await canvasBlob(canvas);
      downloadBlob(blob);
      closeOutputMenu();
      notify(scale < 1 ? '長い原稿に合わせて解像度を調整し、PNGを保存しました' : '比較結果をPNGで保存しました');
    } catch (error) {
      console.error('PNG export failed:', error);
      notify(error?.message || 'PNGの生成に失敗しました');
    } finally {
      if (svgUrl) URL.revokeObjectURL(svgUrl);
      stage?.remove();
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
      exporting = false;
    }
  }

  function boot() {
    const menu = document.querySelector('#copyMenu');
    if (!menu || document.querySelector('#exportDiffPngButton')) return;
    const button = document.createElement('button');
    button.id = 'exportDiffPngButton';
    button.type = 'button';
    button.innerHTML = '<strong>PNGで差分確認</strong><span>3列を縦長1枚で保存</span>';
    menu.appendChild(button);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      exportCurrentDiffPng(button);
    });
  }

  root.TextReviewPng = { exportCurrentDiffPng };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
