/*
 * Text Review Studio – CMS-aware changed-hunk alignment patch.
 *
 * Replaces TextReviewDiffCore.diffRows() after diff-core.js is loaded.
 * The patch models each line as a Unit with display text, comparison text and
 * semantic type so CMS markup, visual bullets, blank rows and assets do not
 * distort row matching.
 */
(function (root) {
  'use strict';

  const core = root.TextReviewDiffCore;
  if (!core || typeof core._lcsDiff !== 'function') return;

  const MAX_LINE_CELLS = 180000;
  const MAX_CHAR_CELLS = 220000;
  const MAX_HUNK_ALIGNMENT_CELLS = 90000;
  const DEFAULT_THRESHOLD = 0.34;
  const lcsDiff = core._lcsDiff;

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

  function stripTags(value) {
    return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<\/?[A-Za-z][^>]*>/g, '');
  }

  function decodeEntities(value) {
    const input = String(value || '');
    const named = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
    return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
      const key = body.toLowerCase();
      if (key[0] === '#') {
        const code = key[1] === 'x' ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : match;
    });
  }

  function normalizeSpaces(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t　]+/g, ' ').trim();
  }

  function removeOuterCmsSpan(value) {
    const line = String(value || '');
    const match = line.match(/^\s*<span\s+class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/span>\s*$/i);
    if (!match) return null;
    return { className: match[1], inner: match[2] };
  }

  function classifyRawLine(rawLine) {
    const line = String(rawLine || '').replace(/\r?\n$/, '');
    const trimmed = line.trim();
    if (!trimmed) return { type: 'blank', subtype: '', structural: true };

    const span = removeOuterCmsSpan(trimmed);
    if (span) {
      if (/\binfo(?:24|26)-t[1-5]\b/.test(span.className)) return { type: 'heading', subtype: span.className, structural: false };
      if (/\binfo24-label\b/.test(span.className)) return { type: 'label', subtype: span.className, structural: false };
    }

    if (/^<img\b/i.test(trimmed)) return { type: 'asset', subtype: 'image', structural: true };
    if (/^<\/?div\b/i.test(trimmed)) return { type: 'layout', subtype: 'div', structural: true };
    if (/^<hr\b/i.test(trimmed)) return { type: 'layout', subtype: 'hr', structural: true };
    if (/^<a\b/i.test(trimmed) || /^https?:\/\/\S+$/i.test(trimmed)) return { type: 'link', subtype: 'url', structural: false };
    if (/^[◆◇♢■□●○◎・▶︎▶▸▹]\s*\S/.test(trimmed)) return { type: 'heading', subtype: 'bullet-heading', structural: false };
    if (/^【[^】]{1,60}】\s*$/.test(trimmed) || /^≪[^≫]{1,60}≫\s*$/.test(trimmed)) return { type: 'heading', subtype: 'bracket-heading', structural: false };
    if (/^＜[^＞]{1,60}＞\s*$/.test(trimmed) || /^<[^>\n]{1,60}>\s*$/.test(trimmed)) return { type: 'label', subtype: 'bracket-label', structural: false };
    return { type: 'text', subtype: '', structural: false };
  }

  function displayText(rawLine, meta) {
    const hasNewline = /\n$/.test(rawLine);
    const end = hasNewline ? '\n' : '';
    const body = String(rawLine || '').replace(/\r?\n$/, '');
    const trimmed = body.trim();
    if (meta.type === 'asset' || meta.type === 'layout') return `${trimmed}${end}`;
    if (meta.type === 'blank') return end || body;
    return `${decodeEntities(stripTags(body))}${end}`;
  }

  function compareText(rawLine, meta, options = {}) {
    if (meta.structural || meta.type === 'blank') return '';
    let text = String(rawLine || '').replace(/\r?\n$/, '');

    if (options.ignoreHtmlTags !== false) text = stripTags(text);
    else {
      const span = removeOuterCmsSpan(text.trim());
      if (span && (meta.type === 'heading' || meta.type === 'label')) text = stripTags(text);
    }

    text = decodeEntities(text);
    text = text
      .replace(/^[◆◇♢■□●○◎・▶︎▶▸▹]\s*/, '')
      .replace(/^【([^】]{1,80})】\s*$/, '$1')
      .replace(/^≪([^≫]{1,80})≫\s*$/, '$1')
      .replace(/^＜([^＞]{1,80})＞\s*$/, '$1')
      .replace(/^<([^>\n]{1,80})>\s*$/, '$1');

    return normalizeSpaces(text);
  }

  function buildUnits(rawText, options = {}, side = 'before') {
    const raw = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const units = [];
    let start = 0;
    let primaryIndex = 0;

    const pushLine = (end) => {
      const rawLine = raw.slice(start, end);
      const meta = classifyRawLine(rawLine);
      const text = displayText(rawLine, meta);
      const unit = {
        side,
        allIndex: units.length,
        primaryIndex: -1,
        raw: rawLine,
        text,
        visibleText: text,
        compareText: compareText(rawLine, meta, options),
        type: meta.type,
        subtype: meta.subtype,
        structural: meta.structural,
        rawStart: start,
        rawEnd: end
      };
      unit.primary = Boolean(unit.compareText) && !unit.structural && unit.type !== 'blank';
      if (unit.primary) unit.primaryIndex = primaryIndex++;
      units.push(unit);
      start = end;
    };

    for (let index = 0; index < raw.length; index += 1) {
      if (raw[index] === '\n') pushLine(index + 1);
    }
    if (start < raw.length) pushLine(raw.length);
    return { raw, units, primary: units.filter(unit => unit.primary) };
  }

  function normalizeLine(value) {
    return normalizeSpaces(String(value || '').replace(/[\r\n]/g, ''));
  }

  function bigrams(value) {
    const characters = Array.from(value);
    const map = new Map();
    for (let index = 0; index < characters.length - 1; index += 1) {
      const gram = `${characters[index]}${characters[index + 1]}`;
      map.set(gram, (map.get(gram) || 0) + 1);
    }
    return map;
  }

  function diceSimilarity(left, right) {
    const a = normalizeLine(left);
    const b = normalizeLine(right);
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
    if (!before || !after || !before.compareText || !after.compareText) return 0;
    const textScore = diceSimilarity(before.compareText, after.compareText);
    const typeBonus = before.type === after.type ? 0.08 : 0;
    const headingBonus = before.type === 'heading' && after.type === 'heading' ? 0.12 : 0;
    const labelBonus = before.type === 'label' && after.type === 'label' ? 0.08 : 0;
    return Math.min(1, textScore + typeBonus + headingBonus + labelBonus);
  }

  function lineSimilarity(left, right) {
    return diceSimilarity(left, right);
  }

  function alignHunk(removed, added, threshold = DEFAULT_THRESHOLD) {
    const n = removed.length;
    const m = added.length;
    if (!n) return added.map(after => ({ before: null, after, similarity: 0 }));
    if (!m) return removed.map(before => ({ before, after: null, similarity: 0 }));
    if (n * m > MAX_HUNK_ALIGNMENT_CELLS) {
      return [
        ...removed.map(before => ({ before, after: null, similarity: 0 })),
        ...added.map(after => ({ before: null, after, similarity: 0 }))
      ];
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
        const diagonal = similarity >= threshold
          ? score[i - 1][j - 1] + (similarity - threshold + 0.0001)
          : Number.NEGATIVE_INFINITY;
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
      const move = i > 0 && j > 0 ? back[i][j] : (i > 0 ? UP : LEFT);
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
    return pairs.reverse();
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
    const common = operations.filter(op => op.type === 'same').reduce((count, op) => count + op.values.length, 0);
    const size = Math.max([...beforeText].length, [...afterText].length);
    if (size >= 18 && common / size < 0.28) {
      return [
        { type: 'remove', value: beforeText, hunkId, beforeStart, afterStart },
        { type: 'add', value: afterText, hunkId, beforeStart, afterStart }
      ];
    }

    const parts = [];
    let beforeCursor = beforeStart;
    let afterCursor = afterStart;
    operations.forEach((operation) => {
      const value = operation.values.join('');
      if (!value) return;
      parts.push({ type: operation.type, value, hunkId: operation.type === 'same' ? null : hunkId, beforeStart: beforeCursor, afterStart: afterCursor });
      if (operation.type !== 'add') beforeCursor += value.length;
      if (operation.type !== 'remove') afterCursor += value.length;
    });
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
      } else if (before && after && before.structural && after.structural && before.raw === after.raw) {
        rows.push({ before, after, kind: 'same' });
        i += 1;
        j += 1;
      } else if (before && before.type !== 'blank') {
        rows.push({ before, after: null, kind: 'delete' });
        i += 1;
      } else if (after && after.type !== 'blank') {
        rows.push({ before: null, after, kind: 'insert' });
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
    const operations = lcsDiff(beforePrimary.map(unit => unit.compareText), afterPrimary.map(unit => unit.compareText), MAX_LINE_CELLS);
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
          const kind = before.text === after.text ? 'same' : 'replace';
          pairs.push({ before, after, kind });
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

      alignHunk(removed, added, threshold).forEach((pair) => {
        if (pair.before && pair.after) pairs.push({ before: pair.before, after: pair.after, kind: pair.before.text === pair.after.text ? 'same' : 'replace' });
        else if (pair.before) pairs.push({ before: pair.before, after: null, kind: 'delete' });
        else pairs.push({ before: null, after: pair.after, kind: 'insert' });
      });
    }

    return pairs;
  }

  function diffRows(beforeText, afterText, options = {}) {
    const beforeDoc = buildUnits(beforeText, options, 'before');
    const afterDoc = buildUnits(afterText, options, 'after');
    const threshold = Number.isFinite(options.lineMatchThreshold) ? options.lineMatchThreshold : DEFAULT_THRESHOLD;
    const primaryPairs = buildPrimaryPairs(beforeDoc.primary, afterDoc.primary, threshold);
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
      if (kind !== 'same') {
        hunks.push({
          id,
          kind,
          before: row.before,
          after: row.after,
          beforeStart: row.beforeStart,
          beforeEnd: row.beforeEnd,
          afterStart: row.afterStart,
          afterEnd: row.afterEnd,
          severity: row.severity
        });
      }
    };

    const emitGap = (beforeEnd, afterEnd) => {
      const beforeWeak = beforeDoc.units.slice(beforeCursor, beforeEnd).filter(unit => !unit.primary);
      const afterWeak = afterDoc.units.slice(afterCursor, afterEnd).filter(unit => !unit.primary);
      alignWeakUnits(beforeWeak, afterWeak).forEach(row => addRow(row.kind, row.before, row.after));
      beforeCursor = beforeEnd;
      afterCursor = afterEnd;
    };

    primaryPairs.forEach((pair) => {
      const beforeTarget = pair.before ? pair.before.allIndex : beforeCursor;
      const afterTarget = pair.after ? pair.after.allIndex : afterCursor;
      emitGap(beforeTarget, afterTarget);
      addRow(pair.kind, pair.before, pair.after);
      if (pair.before) beforeCursor = pair.before.allIndex + 1;
      if (pair.after) afterCursor = pair.after.allIndex + 1;
    });
    emitGap(beforeDoc.units.length, afterDoc.units.length);

    return {
      rows,
      hunks,
      parts: compact(rows.flatMap(row => row.parts)),
      before: beforeDoc.units.map(unit => unit.text).join(''),
      after: afterDoc.units.map(unit => unit.text).join(''),
      ignoredTags: options.ignoreHtmlTags !== false,
      ignoredSoftFormatting: Boolean(options.ignoreSoftFormatting)
    };
  }

  core.diffRows = diffRows;
  core.diffText = (beforeText, afterText, options = {}) => {
    const result = diffRows(beforeText, afterText, options);
    return { parts: result.parts, hunks: result.hunks };
  };
  core._buildUnits = buildUnits;
  core._lineSimilarity = lineSimilarity;
  core._unitSimilarity = unitSimilarity;
  core._alignHunk = alignHunk;
})(typeof window !== 'undefined' ? window : globalThis);
