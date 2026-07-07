/*
 * Text Review Studio – changed-hunk alignment patch.
 *
 * Keeps the public TextReviewDiffCore API intact while replacing only the
 * row-alignment stage. It is loaded after diff-core.js and before the grid view.
 */
(function (root) {
  'use strict';

  const core = root.TextReviewDiffCore;
  if (!core || typeof core.prepareComparisonText !== 'function' || typeof core._lcsDiff !== 'function') return;

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

  function rawOffsetAt(prepared, offset) {
    if (!prepared.text.length) return 0;
    if (offset <= 0) return prepared.map[0] ?? 0;
    if (offset >= prepared.text.length) return prepared.raw.length;
    return prepared.map[offset] ?? prepared.raw.length;
  }

  function splitUnits(prepared) {
    const text = prepared.text;
    if (!text) return [];
    const separator = prepared.options.ignoreSoftFormatting ? /\n{2,}/g : /\n/g;
    const units = [];
    let start = 0;
    let match;
    while ((match = separator.exec(text))) {
      const end = match.index + match[0].length;
      units.push({ text: text.slice(start, end), rawStart: rawOffsetAt(prepared, start), rawEnd: rawOffsetAt(prepared, end) });
      start = end;
    }
    if (start < text.length) {
      units.push({ text: text.slice(start), rawStart: rawOffsetAt(prepared, start), rawEnd: rawOffsetAt(prepared, text.length) });
    }
    return units;
  }

  function isBlankUnit(value) {
    return !value || !String(value).trim();
  }

  function normalizeLine(value) {
    return String(value || '').replace(/[\r\n]/g, '').replace(/[ \t　]+/g, ' ').trim();
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

  function lineSimilarity(left, right) {
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
        const similarity = lineSimilarity(removed[i - 1].text, added[j - 1].text);
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

  function diffRows(beforeText, afterText, options = {}) {
    const beforePrepared = core.prepareComparisonText(beforeText, options);
    const afterPrepared = core.prepareComparisonText(afterText, options);
    const beforeUnits = splitUnits(beforePrepared);
    const afterUnits = splitUnits(afterPrepared);
    const operations = lcsDiff(beforeUnits.map(unit => unit.text), afterUnits.map(unit => unit.text), 180000);
    const rows = [];
    const hunks = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    let sameCount = 0;
    let changeCount = 0;
    let pendingRemoved = [];
    let pendingAdded = [];
    let pendingPosition = null;
    const threshold = Number.isFinite(options.lineMatchThreshold) ? options.lineMatchThreshold : DEFAULT_THRESHOLD;

    const anchors = () => ({
      before: beforeUnits[beforeIndex]?.rawStart ?? beforePrepared.raw.length,
      after: afterUnits[afterIndex]?.rawStart ?? afterPrepared.raw.length
    });

    const addRow = (kind, beforeUnit, afterUnit, position = anchors()) => {
      const id = kind === 'same' ? `same-${++sameCount}` : `diff-${++changeCount}`;
      const before = beforeUnit?.text || '';
      const after = afterUnit?.text || '';
      const beforeStart = beforeUnit?.rawStart ?? position.before;
      const afterStart = afterUnit?.rawStart ?? position.after;
      const row = {
        id,
        kind,
        before,
        after,
        beforeStart,
        beforeEnd: beforeUnit?.rawEnd ?? beforeStart,
        afterStart,
        afterEnd: afterUnit?.rawEnd ?? afterStart,
        severity: kind === 'same' ? 'minor' : classifySeverity(before, after),
        parts: kind === 'same'
          ? [{ type: 'same', value: before, hunkId: null, beforeStart, afterStart }]
          : inlineDiff(before, after, id, beforeStart, afterStart)
      };
      rows.push(row);
      if (kind !== 'same') hunks.push({ id, kind, before, after, beforeStart: row.beforeStart, beforeEnd: row.beforeEnd, afterStart: row.afterStart, afterEnd: row.afterEnd, severity: row.severity });
    };

    const flushPending = () => {
      if (!pendingRemoved.length && !pendingAdded.length) return;
      const position = pendingPosition || anchors();
      alignHunk(pendingRemoved, pendingAdded, threshold).forEach((pair) => {
        if (pair.before && pair.after) addRow('replace', pair.before, pair.after, position);
        else if (pair.before) addRow('delete', pair.before, null, position);
        else addRow('insert', null, pair.after, position);
      });
      pendingRemoved = [];
      pendingAdded = [];
      pendingPosition = null;
    };

    for (const operation of operations) {
      if (operation.type === 'same') {
        for (let count = 0; count < operation.values.length; count += 1) {
          const beforeUnit = beforeUnits[beforeIndex];
          const afterUnit = afterUnits[afterIndex];
          const blankBridge = isBlankUnit(beforeUnit?.text) && isBlankUnit(afterUnit?.text);
          // A shared blank line separates paragraphs visually, but it must not
          // terminate a pending changed hunk. Otherwise a rewritten paragraph
          // before/after that blank never gets a chance to align.
          if (!blankBridge || (!pendingRemoved.length && !pendingAdded.length)) flushPending();
          addRow('same', beforeUnit, afterUnit);
          beforeIndex += 1;
          afterIndex += 1;
        }
      } else if (operation.type === 'remove') {
        if (!pendingPosition) pendingPosition = anchors();
        for (let count = 0; count < operation.values.length; count += 1) pendingRemoved.push(beforeUnits[beforeIndex++]);
      } else {
        if (!pendingPosition) pendingPosition = anchors();
        for (let count = 0; count < operation.values.length; count += 1) pendingAdded.push(afterUnits[afterIndex++]);
      }
    }
    flushPending();

    return {
      rows,
      hunks,
      parts: compact(rows.flatMap(row => row.parts)),
      before: beforePrepared.text,
      after: afterPrepared.text,
      ignoredTags: beforePrepared.options.ignoreHtmlTags,
      ignoredSoftFormatting: beforePrepared.options.ignoreSoftFormatting
    };
  }

  core.diffRows = diffRows;
  core.diffText = (beforeText, afterText, options = {}) => {
    const result = diffRows(beforeText, afterText, options);
    return { parts: result.parts, hunks: result.hunks };
  };
  core._lineSimilarity = lineSimilarity;
  core._alignHunk = alignHunk;
  core._isBlankUnit = isBlankUnit;
})(typeof window !== 'undefined' ? window : globalThis);
