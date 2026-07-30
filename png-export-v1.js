/* Text Review Studio v1 – export the three-column comparison as one long PNG. */
(function (root) {
  'use strict';

  const WIDTH = 1200;
  const RAIL_WIDTH = 42;
  const HEADER_HEIGHT = 38;
  const CELL_PADDING_X = 16;
  const CELL_PADDING_Y = 11;
  const FONT_SIZE = 14;
  const LINE_HEIGHT = 27;
  const MIN_ROW_HEIGHT = 44;
  const MAX_CANVAS_DIMENSION = 32760;
  const MAX_CANVAS_AREA = 100000000;
  const FONT_FAMILY = '"Yu Gothic UI","Yu Gothic","Hiragino Kaku Gothic ProN",Meiryo,sans-serif';
  const MONO_FAMILY = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  const COLORS = {
    ink:'#2c3a54', muted:'#748198', line:'#e3e8f1', rowLine:'#eef1f5', railLine:'#edf0f5',
    header:'#f9fbfe', before:'#fffafb', after:'#fbfefc', empty:'#fafbfd', rail:'#fafbfd',
    beforeChange:'#f4c3ca', beforeChangeInk:'#8f2432', afterChange:'#bcead2',
    replace:'#936000', replaceSoft:'#fff4dc', insert:'#176d56', insertSoft:'#e5f6ef',
    delete:'#9f2f40', deleteSoft:'#fdebed', tag:'#655292', tagBorder:'#ddd4ef', tagSoft:'#fbf9ff',
    url:'#285db5'
  };
  let exporting = false;

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

  function rowRaw(model, row, side) {
    const direct = side === 'before' ? row.beforeRaw : row.afterRaw;
    if (typeof direct === 'string') return direct;
    const source = side === 'before' ? model.before : model.after;
    const start = side === 'before' ? row.beforeStart : row.afterStart;
    const end = side === 'before' ? row.beforeEnd : row.afterEnd;
    return source.slice(start || 0, end || start || 0);
  }

  function splitUrls(segment, options) {
    if (!options.highlightUrls || segment.style !== 'normal') return [segment];
    const output = [];
    const pattern = /https?:\/\/[^\s<]+/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(segment.text))) {
      if (match.index > cursor) output.push({ text:segment.text.slice(cursor, match.index), style:'normal' });
      output.push({ text:match[0], style:'url' });
      cursor = match.index + match[0].length;
    }
    if (cursor < segment.text.length) output.push({ text:segment.text.slice(cursor), style:'normal' });
    return output.length ? output : [segment];
  }

  function sideSegments(model, row, side, options) {
    const segments = [];
    if (options.showTags) {
      const tags = rowRaw(model, row, side).match(/<\/?[A-Za-z][^>]*>/g) || [];
      tags.forEach((tag) => segments.push({ text:`${tag} `, style:'tag' }));
      if (tags.length) segments.push({ text:'\n', style:'normal' });
    }

    const include = side === 'before' ? new Set(['same', 'remove']) : new Set(['same', 'add']);
    const changed = side === 'before' ? 'remove' : 'add';
    const changedStyle = side === 'before' ? 'beforeChange' : 'afterChange';
    const parts = Array.isArray(row.parts) ? row.parts : [];
    const rendered = parts.filter((part) => include.has(part.type)).map((part) => ({
      text:String(part.value || ''),
      style:part.type === changed ? changedStyle : 'normal'
    }));

    if (rendered.length) segments.push(...rendered);
    else {
      const fallback = String(side === 'before' ? row.before || '' : row.after || '');
      if (fallback) segments.push({ text:fallback, style:row.kind === 'same' ? 'normal' : changedStyle });
    }
    return segments.flatMap((segment) => splitUrls(segment, options));
  }

  function fontFor(style) {
    if (style === 'tag') return `600 10px ${MONO_FAMILY}`;
    if (style === 'beforeChange' || style === 'afterChange') return `700 ${FONT_SIZE}px ${FONT_FAMILY}`;
    return `400 ${FONT_SIZE}px ${FONT_FAMILY}`;
  }

  function visibleCharacter(character, options) {
    if (!options.showWhitespace) return character;
    if (character === ' ') return '·';
    if (character === '　') return '□';
    return character;
  }

  function appendRun(line, character, style, width) {
    const previous = line.runs[line.runs.length - 1];
    if (previous && previous.style === style) {
      previous.text += character;
      previous.width += width;
    } else {
      line.runs.push({ text:character, style, width });
    }
    line.width += width;
  }

  function wrapSegments(context, segments, maxWidth, options) {
    const lines = [];
    let line = { runs:[], width:0 };
    const pushLine = () => {
      lines.push(line);
      line = { runs:[], width:0 };
    };

    segments.forEach((segment) => {
      context.font = fontFor(segment.style);
      for (const rawCharacter of Array.from(segment.text)) {
        if (rawCharacter === '\n') {
          if (options.showWhitespace) {
            const width = context.measureText('↵').width;
            if (line.width + width > maxWidth && line.runs.length) pushLine();
            appendRun(line, '↵', segment.style, width);
          }
          pushLine();
          continue;
        }
        const character = visibleCharacter(rawCharacter, options);
        const width = context.measureText(character).width;
        if (line.width + width > maxWidth && line.runs.length) pushLine();
        appendRun(line, character, segment.style, width);
      }
    });
    if (line.runs.length || !lines.length) lines.push(line);
    return lines;
  }

  function layoutRows(model, options) {
    const measureCanvas = document.createElement('canvas');
    const context = measureCanvas.getContext('2d');
    if (!context) throw new Error('PNG用の文字計測を開始できませんでした');
    const columnWidth = (WIDTH - RAIL_WIDTH) / 2;
    const textWidth = columnWidth - CELL_PADDING_X * 2;
    let totalHeight = HEADER_HEIGHT;
    const layouts = (model.rows || []).map((row) => {
      const beforeLines = wrapSegments(context, sideSegments(model, row, 'before', options), textWidth, options);
      const afterLines = wrapSegments(context, sideSegments(model, row, 'after', options), textWidth, options);
      const height = Math.max(MIN_ROW_HEIGHT, Math.max(beforeLines.length, afterLines.length) * LINE_HEIGHT + CELL_PADDING_Y * 2);
      totalHeight += height;
      return { row, beforeLines, afterLines, height };
    });
    return { layouts, totalHeight, columnWidth };
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawRun(context, run, x, baseline) {
    context.font = fontFor(run.style);
    context.textBaseline = 'alphabetic';
    if (run.style === 'beforeChange' || run.style === 'afterChange') {
      context.fillStyle = run.style === 'beforeChange' ? COLORS.beforeChange : COLORS.afterChange;
      roundedRect(context, x - 1, baseline - FONT_SIZE - 3, run.width + 2, FONT_SIZE + 7, 3);
      context.fill();
    } else if (run.style === 'tag') {
      context.fillStyle = COLORS.tagSoft;
      context.strokeStyle = COLORS.tagBorder;
      roundedRect(context, x - 1, baseline - 12, run.width + 2, 16, 4);
      context.fill();
      context.stroke();
    }

    context.fillStyle = run.style === 'beforeChange' ? COLORS.beforeChangeInk : run.style === 'tag' ? COLORS.tag : run.style === 'url' ? COLORS.url : COLORS.ink;
    context.fillText(run.text, x, baseline);
    if (run.style === 'url') {
      context.strokeStyle = '#a9bee3';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, baseline + 2);
      context.lineTo(x + run.width, baseline + 2);
      context.stroke();
    }
  }

  function drawLines(context, lines, x, y) {
    lines.forEach((line, lineIndex) => {
      let cursor = x;
      const baseline = y + lineIndex * LINE_HEIGHT + FONT_SIZE;
      line.runs.forEach((run) => {
        drawRun(context, run, cursor, baseline);
        cursor += run.width;
      });
    });
  }

  function drawMarker(context, kind, centerX, centerY) {
    const symbol = marker(kind);
    if (!symbol) return;
    const palette = kind === 'replace'
      ? [COLORS.replaceSoft, COLORS.replace]
      : kind === 'insert'
        ? [COLORS.insertSoft, COLORS.insert]
        : [COLORS.deleteSoft, COLORS.delete];
    roundedRect(context, centerX - 13.5, centerY - 13.5, 27, 27, 8);
    context.fillStyle = palette[0];
    context.fill();
    context.font = `700 14px ${FONT_FAMILY}`;
    context.fillStyle = palette[1];
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(symbol, centerX, centerY + 0.5);
    context.textAlign = 'left';
  }

  function renderCanvas(layout, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(WIDTH * scale));
    canvas.height = Math.max(1, Math.floor(layout.totalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG描画を開始できませんでした');
    context.scale(scale, scale);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, WIDTH, layout.totalHeight);

    const beforeX = 0;
    const railX = layout.columnWidth;
    const afterX = railX + RAIL_WIDTH;
    context.fillStyle = COLORS.header;
    context.fillRect(0, 0, WIDTH, HEADER_HEIGHT);
    context.strokeStyle = COLORS.line;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, HEADER_HEIGHT - 0.5);
    context.lineTo(WIDTH, HEADER_HEIGHT - 0.5);
    context.stroke();
    context.font = `700 10px ${FONT_FAMILY}`;
    context.fillStyle = COLORS.muted;
    context.textBaseline = 'middle';
    context.fillText('変更前', CELL_PADDING_X, HEADER_HEIGHT / 2);
    context.textAlign = 'center';
    context.fillText('差分', railX + RAIL_WIDTH / 2, HEADER_HEIGHT / 2);
    context.textAlign = 'left';
    context.fillText('修正後', afterX + CELL_PADDING_X, HEADER_HEIGHT / 2);

    let y = HEADER_HEIGHT;
    layout.layouts.forEach(({ row, beforeLines, afterLines, height }) => {
      context.fillStyle = row.before ? COLORS.before : COLORS.empty;
      context.fillRect(beforeX, y, layout.columnWidth, height);
      context.fillStyle = COLORS.rail;
      context.fillRect(railX, y, RAIL_WIDTH, height);
      context.fillStyle = row.after ? COLORS.after : COLORS.empty;
      context.fillRect(afterX, y, layout.columnWidth, height);

      context.strokeStyle = COLORS.railLine;
      context.beginPath();
      context.moveTo(railX + 0.5, y);
      context.lineTo(railX + 0.5, y + height);
      context.moveTo(afterX - 0.5, y);
      context.lineTo(afterX - 0.5, y + height);
      context.stroke();

      drawLines(context, beforeLines, beforeX + CELL_PADDING_X, y + CELL_PADDING_Y);
      drawLines(context, afterLines, afterX + CELL_PADDING_X, y + CELL_PADDING_Y);
      drawMarker(context, row.kind, railX + RAIL_WIDTH / 2, y + height / 2);

      context.strokeStyle = COLORS.rowLine;
      context.beginPath();
      context.moveTo(0, y + height - 0.5);
      context.lineTo(WIDTH, y + height - 0.5);
      context.stroke();
      y += height;
    });

    context.strokeStyle = COLORS.line;
    context.strokeRect(0.5, 0.5, WIDTH - 1, layout.totalHeight - 1);
    return canvas;
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

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const layout = layoutRows(model, displayOptions());
      const desiredScale = 2;
      const dimensionScale = Math.min(MAX_CANVAS_DIMENSION / WIDTH, MAX_CANVAS_DIMENSION / layout.totalHeight);
      const areaScale = Math.sqrt(MAX_CANVAS_AREA / (WIDTH * layout.totalHeight));
      const scale = Math.max(0.05, Math.min(desiredScale, dimensionScale, areaScale));
      const canvas = renderCanvas(layout, scale);
      const blob = await canvasBlob(canvas);
      downloadBlob(blob);
      closeOutputMenu();
      notify(scale < 1 ? '長い原稿に合わせて解像度を調整し、PNGを保存しました' : '比較結果をPNGで保存しました');
    } catch (error) {
      console.error('PNG export failed:', error);
      notify(error?.message || 'PNGの生成に失敗しました');
    } finally {
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
