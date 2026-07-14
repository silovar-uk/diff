/* Text Review Studio v1 – single CMS-aware comparison engine. */
(function (root) {
  'use strict';

  const MAX_LINE_CELLS = 180000;
  const MAX_CHAR_CELLS = 220000;
  const MAX_HUNK_ALIGNMENT_CELLS = 90000;
  const DEFAULT_THRESHOLD = 0.34;
  const STRUCTURAL_TAGS = new Set([
    'address', 'article', 'aside', 'audio', 'blockquote', 'br', 'canvas', 'col', 'colgroup',
    'details', 'dialog', 'div', 'dl', 'dt', 'dd', 'fieldset', 'figcaption', 'figure',
    'footer', 'form', 'header', 'hgroup', 'hr', 'iframe', 'legend', 'li', 'main', 'menu',
    'nav', 'ol', 'optgroup', 'option', 'picture', 'section', 'source', 'summary', 'table',
    'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'track', 'ul', 'video'
  ]);
  const ASSET_TAGS = new Set(['img', 'source', 'track']);

  function resolveOptions(options = {}) {
    return {
      ignoreHtmlTags: typeof options.ignoreHtmlTags === 'boolean'
        ? options.ignoreHtmlTags
        : typeof document !== 'undefined',
      ignoreSoftFormatting: Boolean(options.ignoreSoftFormatting),
      lineMatchThreshold: Number.isFinite(options.lineMatchThreshold)
        ? Math.min(1, Math.max(0, options.lineMatchThreshold))
        : DEFAULT_THRESHOLD
    };
  }

  function compact(parts) {
    const output = [];
    for (const part of parts) {
      if (!part || !part.value) continue;
      const previous = output[output.length - 1];
      if (previous && previous.type === part.type && previous.hunkId === part.hunkId) previous.value += part.value;
      else output.push({ ...part });
    }
    return output;
  }

  function lcsDiff(a, b, maxCells = MAX_CHAR_CELLS) {
    const n = a.length;
    const m = b.length;
    if (!n && !m) return [];
    if (!n) return [{ type: 'add', values: b.slice() }];
    if (!m) return [{ type: 'remove', values: a.slice() }];

    if (n * m > maxCells) {
      let prefix = 0;
      const short = Math.min(n, m);
      while (prefix < short && a[prefix] === b[prefix]) prefix += 1;
      let endA = n - 1;
      let endB = m - 1;
      while (endA >= prefix && endB >= prefix && a[endA] === b[endB]) {
        endA -= 1;
        endB -= 1;
      }
      const fallback = [];
      if (prefix) fallback.push({ type: 'same', values: a.slice(0, prefix) });
      if (endA >= prefix) fallback.push({ type: 'remove', values: a.slice(prefix, endA + 1) });
      if (endB >= prefix) fallback.push({ type: 'add', values: b.slice(prefix, endB + 1) });
      if (endA < n - 1) fallback.push({ type: 'same', values: a.slice(endA + 1) });
      return fallback;
    }

    const width = m + 1;
    const matrix = new Uint32Array((n + 1) * (m + 1));
    const at = (i, j) => i * width + j;
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        matrix[at(i, j)] = a[i] === b[j]
          ? matrix[at(i + 1, j + 1)] + 1
          : Math.max(matrix[at(i + 1, j)], matrix[at(i, j + 1)]);
      }
    }

    const output = [];
    const push = (type, value) => {
      const previous = output[output.length - 1];
      if (previous && previous.type === type) previous.values.push(value);
      else output.push({ type, values: [value] });
    };
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        push('same', a[i]);
        i += 1;
        j += 1;
      } else if (matrix[at(i + 1, j)] >= matrix[at(i, j + 1)]) {
        push('remove', a[i]);
        i += 1;
      } else {
        push('add', b[j]);
        j += 1;
      }
    }
    while (i < n) push('remove', a[i++]);
    while (j < m) push('add', b[j++]);
    return output;
  }

  function stripTags(value) {
    return String(value || '')
      .replace(/<!--([\s\S]*?)-->/g, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<\/?[A-Za-z][^>]*>/g, '');
  }

  function decodeEntities(value) {
    const named = {
      nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
      rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…'
    };
    return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
      const key = body.toLowerCase();
      if (key.startsWith('#')) {
        const code = key[1] === 'x' ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
        try { return Number.isFinite(code) ? String.fromCodePoint(code) : match; } catch (_) { return match; }
      }
      return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : match;
    });
  }

  function normalizeSpaces(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t　]+/g, ' ').trim();
  }

  function tagNames(value) {
    return [...String(value || '').matchAll(/<\/?\s*([A-Za-z][\w:-]*)\b[^>]*>/g)].map((match) => match[1].toLowerCase());
  }

  function removeOuterCmsSpan(value) {
    const match = String(value || '').match(/^\s*<span\s+class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/span>\s*$/i);
    return match ? { className: match[1], inner: match[2] } : null;
  }

  function classifyRawLine(rawLine) {
    const body = String(rawLine || '').replace(/\r?\n$/, '');
    const trimmed = body.trim();
    if (!trimmed) return { type: 'blank', subtype: '', structural: false };

    const span = removeOuterCmsSpan(trimmed);
    if (span) {
      if (/\binfo(?:24|25|26)-t[1-5](?:-[\w-]+)?\b/i.test(span.className)) return { type: 'heading', subtype: span.className, structural: false };
      if (/\binfo(?:24|25|26)-label\b/i.test(span.className)) return { type: 'label', subtype: span.className, structural: false };
    }

    const names = tagNames(trimmed);
    const visible = decodeEntities(stripTags(trimmed)).replace(/[\s\u00a0　]/g, '');
    if (names.length && !visible) {
      if (names.some((name) => ASSET_TAGS.has(name))) return { type: 'asset', subtype: names.join(','), structural: true };
      if (names.every((name) => STRUCTURAL_TAGS.has(name))) return { type: 'layout', subtype: names.join(','), structural: true };
      return { type: 'layout', subtype: 'tag-only', structural: true };
    }

    if (/^<a\b/i.test(trimmed) || /^https?:\/\/\S+$/i.test(trimmed)) return { type: 'link', subtype: 'url', structural: false };
    if (/^[◆◇♢■□●○◎・▶︎▶▸▹]\s*\S/u.test(trimmed)) return { type: 'heading', subtype: 'bullet-heading', structural: false };
    if (/^【[^】]{1,80}】\s*$/u.test(trimmed) || /^≪[^≫]{1,80}≫\s*$/u.test(trimmed)) return { type: 'heading', subtype: 'bracket-heading', structural: false };
    if (/^＜[^＞]{1,80}＞\s*$/u.test(trimmed)) return { type: 'label', subtype: 'bracket-label', structural: false };
    return { type: 'text', subtype: '', structural: false };
  }

  function visibleText(rawLine, meta, options) {
    const raw = String(rawLine || '');
    if (!options.ignoreHtmlTags) return raw;
    const hasNewline = /\n$/.test(raw);
    const end = hasNewline ? '\n' : '';
    const body = raw.replace(/\r?\n$/, '');
    if (meta.type === 'blank') return end || body;
    return `${decodeEntities(stripTags(body))}${end}`;
  }

  function comparisonText(rawLine, meta, options) {
    if (meta.type === 'blank') return '';
    if (options.ignoreHtmlTags && meta.structural) return '';
    let text = String(rawLine || '').replace(/\r?\n$/, '');
    if (options.ignoreHtmlTags) {
      text = decodeEntities(stripTags(text))
        .replace(/^[◆◇♢■□●○◎・▶︎▶▸▹]\s*/u, '')
        .replace(/^【([^】]{1,100})】\s*$/u, '$1')
        .replace(/^≪([^≫]{1,100})≫\s*$/u, '$1')
        .replace(/^＜([^＞]{1,100})＞\s*$/u, '$1');
    }
    return normalizeSpaces(text);
  }

  function buildUnits(rawText, inputOptions = {}, side = 'before') {
    const options = resolveOptions(inputOptions);
    const raw = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const units = [];
    let start = 0;
    let primaryIndex = 0;

    const pushLine = (end) => {
      const rawLine = raw.slice(start, end);
      const meta = classifyRawLine(rawLine);
      const unit = {
        side,
        allIndex: units.length,
        primaryIndex: -1,
        raw: rawLine,
        text: visibleText(rawLine, meta, options),
        compareText: comparisonText(rawLine, meta, options),
        type: meta.type,
        subtype: meta.subtype,
        structural: meta.structural,
        omitted: options.ignoreHtmlTags && meta.structural,
        rawStart: start,
        rawEnd: end
      };
      unit.primary = !unit.omitted && unit.type !== 'blank' && Boolean(unit.compareText);
      if (unit.primary) unit.primaryIndex = primaryIndex++;
      units.push(unit);
      start = end;
    };

    for (let index = 0; index < raw.length; index += 1) if (raw[index] === '\n') pushLine(index + 1);
    if (start < raw.length) pushLine(raw.length);
    return { raw, options, units, primary: units.filter((unit) => unit.primary) };
  }

  function bigrams(value) {
    const chars = Array.from(value);
    const map = new Map();
    for (let index = 0; index < chars.length - 1; index += 1) {
      const gram = chars[index] + chars[index + 1];
      map.set(gram, (map.get(gram) || 0) + 1);
    }
    return map;
  }

  function diceSimilarity(left, right) {
    const a = normalizeSpaces(String(left || '').replace(/[\r\n]/g, ''));
    const b = normalizeSpaces(String(right || '').replace(/[\r\n]/g, ''));
    if (a === b) return 1;
    if (!a || !b || a.length < 2 || b.length < 2) return 0;
    const ga = bigrams(a);
    const gb = bigrams(b);
    let totalA = 0;
    let totalB = 0;
    let intersection = 0;
    ga.forEach((count, gram) => {
      totalA += count;
      if (gb.has(gram)) intersection += Math.min(count, gb.get(gram));
    });
    gb.forEach((count) => { totalB += count; });
    return totalA + totalB ? (2 * intersection) / (totalA + totalB) : 0;
  }

  function unitSimilarity(before, after) {
    if (!before?.compareText || !after?.compareText) return 0;
    const textScore = diceSimilarity(before.compareText, after.compareText);
    const sameType = before.type === after.type ? 0.08 : 0;
    const heading = before.type === 'heading' && after.type === 'heading' ? 0.12 : 0;
    const label = before.type === 'label' && after.type === 'label' ? 0.08 : 0;
    return Math.min(1, textScore + sameType + heading + label);
  }

  function alignHunk(removed, added, threshold = DEFAULT_THRESHOLD) {
    const n = removed.length;
    const m = added.length;
    if (!n) return added.map((after) => ({ before: null, after, similarity: 0 }));
    if (!m) return removed.map((before) => ({ before, after: null, similarity: 0 }));
    if (n * m > MAX_HUNK_ALIGNMENT_CELLS) {
      return [...removed.map((before) => ({ before, after: null, similarity: 0 })), ...added.map((after) => ({ before: null, after, similarity: 0 }))];
    }

    const score = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
    const back = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
    const similarities = Array.from({ length: n }, () => new Float32Array(m));
    const DIAGONAL = 1;
    const UP = 2;
    const LEFT = 3;
    for (let i = 1; i <= n; i += 1) back[i][0] = UP;
    for (let j = 1; j <= m; j += 1) back[0][j] = LEFT;

    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) {
        const similarity = unitSimilarity(removed[i - 1], added[j - 1]);
        similarities[i - 1][j - 1] = similarity;
        const diagonal = similarity >= threshold ? score[i - 1][j - 1] + similarity - threshold + 0.0001 : Number.NEGATIVE_INFINITY;
        const up = score[i - 1][j];
        const left = score[i][j - 1];
        if (diagonal >= up && diagonal >= left) {
          score[i][j] = diagonal;
          back[i][j] = DIAGONAL;
        } else if (up >= left) {
          score[i][j] = up;
          back[i][j] = UP;
        } else {
          score[i][j] = left;
          back[i][j] = LEFT;
        }
      }
    }

    const pairs = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      const move = i > 0 && j > 0 ? back[i][j] : i > 0 ? UP : LEFT;
      if (move === DIAGONAL) {
        pairs.push({ before: removed[i - 1], after: added[j - 1], similarity: similarities[i - 1][j - 1] });
        i -= 1;
        j -= 1;
      } else if (move === UP) {
        pairs.push({ before: removed[i - 1], after: null, similarity: 0 });
        i -= 1;
      } else {
        pairs.push({ before: null, after: added[j - 1], similarity: 0 });
        j -= 1;
      }
    }
    const aligned = pairs.reverse();
    if (!aligned.some((pair) => pair.before && pair.after)) {
      return [...removed.map((before) => ({ before, after: null, similarity: 0 })), ...added.map((after) => ({ before: null, after, similarity: 0 }))];
    }
    return aligned;
  }

  function classifySeverity(before, after) {
    const all = `${before}${after}`;
    if (/(https?:\/\/|www\.|@[\w.-]+\.|<\/?[A-Za-z][^>]*>|[0-9０-９]+\s*(年|月|日|時|分|円|%|％))/i.test(all)) return 'critical';
    if (/^[\s\n\r\t、。,.!！?？()（）\[\]【】「」『』]+$/u.test(all)) return 'minor';
    return 'normal';
  }

  function inlineDiff(beforeText, afterText, hunkId, beforeStart, afterStart) {
    if (!beforeText && !afterText) return [];
    if (!beforeText) return [{ type: 'add', value: afterText, hunkId, beforeStart, afterStart }];
    if (!afterText) return [{ type: 'remove', value: beforeText, hunkId, beforeStart, afterStart }];
    const operations = lcsDiff(Array.from(beforeText), Array.from(afterText), MAX_CHAR_CELLS);
    const common = operations.filter((op) => op.type === 'same').reduce((count, op) => count + op.values.length, 0);
    const size = Math.max(Array.from(beforeText).length, Array.from(afterText).length);
    if (size >= 18 && common / size < 0.28) {
      return [
        { type: 'remove', value: beforeText, hunkId, beforeStart, afterStart },
        { type: 'add', value: afterText, hunkId, beforeStart, afterStart }
      ];
    }
    const parts = [];
    let beforeCursor = beforeStart;
    let afterCursor = afterStart;
    for (const operation of operations) {
      const value = operation.values.join('');
      if (!value) continue;
      parts.push({ type: operation.type, value, hunkId: operation.type === 'same' ? null : hunkId, beforeStart: beforeCursor, afterStart: afterCursor });
      if (operation.type !== 'add') beforeCursor += value.length;
      if (operation.type !== 'remove') afterCursor += value.length;
    }
    return parts;
  }

  function makeRow(kind, beforeUnit, afterUnit, id, position) {
    const before = beforeUnit?.text || '';
    const after = afterUnit?.text || '';
    const beforeStart = beforeUnit?.rawStart ?? position.before;
    const afterStart = afterUnit?.rawStart ?? position.after;
    return {
      id,
      kind,
      before,
      after,
      beforeRaw: beforeUnit?.raw || '',
      afterRaw: afterUnit?.raw || '',
      beforeStart,
      beforeEnd: beforeUnit?.rawEnd ?? beforeStart,
      afterStart,
      afterEnd: afterUnit?.rawEnd ?? afterStart,
      beforeType: beforeUnit?.type || 'empty',
      afterType: afterUnit?.type || 'empty',
      severity: kind === 'same' ? 'minor' : classifySeverity(before, after),
      parts: kind === 'same'
        ? [{ type: 'same', value: before, hunkId: null, beforeStart, afterStart }]
        : inlineDiff(before, after, id, beforeStart, afterStart)
    };
  }

  function alignWeakUnits(beforeWeak, afterWeak) {
    const rows = [];
    let i = 0;
    let j = 0;
    while (i < beforeWeak.length || j < afterWeak.length) {
      const before = beforeWeak[i];
      const after = afterWeak[j];
      if (before && after && before.type === 'blank' && after.type === 'blank') {
        rows.push({ before, after, kind: 'same' });
        i += 1;
        j += 1;
      } else if (before) {
        rows.push({ before, after: null, kind: 'delete' });
        i += 1;
      } else if (after) {
        rows.push({ before: null, after, kind: 'insert' });
        j += 1;
      }
    }
    return rows;
  }

  function buildPrimaryPairs(beforePrimary, afterPrimary, threshold) {
    const operations = lcsDiff(beforePrimary.map((unit) => unit.compareText), afterPrimary.map((unit) => unit.compareText), MAX_LINE_CELLS);
    const pairs = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    let operationIndex = 0;
    while (operationIndex < operations.length) {
      const operation = operations[operationIndex];
      if (operation.type === 'same') {
        for (let count = 0; count < operation.values.length; count += 1) {
          const before = beforePrimary[beforeIndex++];
          const after = afterPrimary[afterIndex++];
          pairs.push({ before, after, kind: before.text === after.text ? 'same' : 'replace' });
        }
        operationIndex += 1;
        continue;
      }
      const removed = [];
      const added = [];
      while (operationIndex < operations.length && operations[operationIndex].type !== 'same') {
        const changed = operations[operationIndex];
        if (changed.type === 'remove') {
          for (let count = 0; count < changed.values.length; count += 1) removed.push(beforePrimary[beforeIndex++]);
        } else {
          for (let count = 0; count < changed.values.length; count += 1) added.push(afterPrimary[afterIndex++]);
        }
        operationIndex += 1;
      }
      for (const pair of alignHunk(removed, added, threshold)) {
        if (pair.before && pair.after) pairs.push({ before: pair.before, after: pair.after, kind: pair.before.text === pair.after.text ? 'same' : 'replace' });
        else if (pair.before) pairs.push({ before: pair.before, after: null, kind: 'delete' });
        else pairs.push({ before: null, after: pair.after, kind: 'insert' });
      }
    }
    return pairs;
  }

  function diffRows(beforeText, afterText, inputOptions = {}) {
    const options = resolveOptions(inputOptions);
    const beforeDoc = buildUnits(beforeText, options, 'before');
    const afterDoc = buildUnits(afterText, options, 'after');
    const primaryPairs = buildPrimaryPairs(beforeDoc.primary, afterDoc.primary, options.lineMatchThreshold);
    const rows = [];
    const hunks = [];
    let sameCount = 0;
    let changeCount = 0;
    let beforeCursor = 0;
    let afterCursor = 0;

    const anchors = () => ({
      before: beforeDoc.units[beforeCursor]?.rawStart ?? beforeDoc.raw.length,
      after: afterDoc.units[afterCursor]?.rawStart ?? afterDoc.raw.length
    });
    const addRow = (kind, beforeUnit, afterUnit) => {
      const id = kind === 'same' ? `same-${++sameCount}` : `diff-${++changeCount}`;
      const row = makeRow(kind, beforeUnit, afterUnit, id, anchors());
      rows.push(row);
      if (kind !== 'same') hunks.push({
        id, kind, before: row.before, after: row.after,
        beforeStart: row.beforeStart, beforeEnd: row.beforeEnd,
        afterStart: row.afterStart, afterEnd: row.afterEnd,
        severity: row.severity
      });
    };
    const emitGap = (beforeEnd, afterEnd) => {
      const beforeWeak = beforeDoc.units.slice(beforeCursor, beforeEnd).filter((unit) => !unit.primary && !unit.omitted);
      const afterWeak = afterDoc.units.slice(afterCursor, afterEnd).filter((unit) => !unit.primary && !unit.omitted);
      for (const row of alignWeakUnits(beforeWeak, afterWeak)) addRow(row.kind, row.before, row.after);
      beforeCursor = beforeEnd;
      afterCursor = afterEnd;
    };

    for (const pair of primaryPairs) {
      emitGap(pair.before ? pair.before.allIndex : beforeCursor, pair.after ? pair.after.allIndex : afterCursor);
      addRow(pair.kind, pair.before, pair.after);
      if (pair.before) beforeCursor = pair.before.allIndex + 1;
      if (pair.after) afterCursor = pair.after.allIndex + 1;
    }
    emitGap(beforeDoc.units.length, afterDoc.units.length);

    const summary = {
      changes: rows.filter((row) => row.kind !== 'same').length,
      replaces: rows.filter((row) => row.kind === 'replace').length,
      inserts: rows.filter((row) => row.kind === 'insert').length,
      deletes: rows.filter((row) => row.kind === 'delete').length
    };
    return {
      rows,
      hunks,
      parts: compact(rows.flatMap((row) => row.parts)),
      before: beforeDoc.units.filter((unit) => !unit.omitted).map((unit) => unit.text).join(''),
      after: afterDoc.units.filter((unit) => !unit.omitted).map((unit) => unit.text).join(''),
      summary,
      ignoredTags: options.ignoreHtmlTags,
      ignoredSoftFormatting: options.ignoreSoftFormatting
    };
  }

  function diffText(beforeText, afterText, options = {}) {
    const result = diffRows(beforeText, afterText, options);
    return { parts: result.parts, hunks: result.hunks, summary: result.summary };
  }

  function reconstructBefore(parts) {
    return parts.filter((part) => part.type !== 'add').map((part) => part.value).join('');
  }

  function reconstructAfter(parts) {
    return parts.filter((part) => part.type !== 'remove').map((part) => part.value).join('');
  }

  const api = {
    diffText,
    diffRows,
    reconstructBefore,
    reconstructAfter,
    buildUnits,
    classifyRawLine,
    _lcsDiff: lcsDiff,
    _lineSimilarity: diceSimilarity,
    _unitSimilarity: unitSimilarity,
    _alignHunk: alignHunk
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextReviewDiffCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
