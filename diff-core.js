/*
 * Text Review Studio v0.6.6
 * Local-only, dependency-free diff core.
 *
 * Two views are intentionally supported:
 * - diffText(): raw source diff for audit/review records.
 * - diffRows(): difff-style paired rows for the side-by-side comparison view.
 *   It diffs line sequences first, then makes inline character diffs inside each
 *   paired changed row. When requested, HTML-like tags are removed from the
 *   comparison stream so class/style/font markup cannot overwhelm prose changes.
 */
(function (root) {
  'use strict';

  const MAX_LINE_CELLS = 220000;
  const MAX_CHAR_CELLS = 240000;
  const HTML_TAG_RE = /<\/?[A-Za-z][^>]*>/g;

  function compact(parts) {
    const out = [];
    for (const part of parts) {
      if (!part || !part.value) continue;
      const previous = out[out.length - 1];
      if (previous && previous.type === part.type && previous.hunkId === part.hunkId) {
        previous.value += part.value;
      } else {
        out.push({ ...part });
      }
    }
    return out;
  }

  function splitLines(text) {
    if (text === '') return [];
    const raw = String(text).split('\n');
    return raw.map((line, index) => index < raw.length - 1 ? `${line}\n` : line);
  }

  function splitChars(text) {
    return Array.from(String(text));
  }

  function commonEdgeDiff(a, b) {
    let start = 0;
    const min = Math.min(a.length, b.length);
    while (start < min && a[start] === b[start]) start += 1;

    let endA = a.length - 1;
    let endB = b.length - 1;
    while (endA >= start && endB >= start && a[endA] === b[endB]) {
      endA -= 1;
      endB -= 1;
    }

    const parts = [];
    if (start > 0) parts.push({ type: 'same', values: a.slice(0, start) });
    if (endA >= start) parts.push({ type: 'remove', values: a.slice(start, endA + 1) });
    if (endB >= start) parts.push({ type: 'add', values: b.slice(start, endB + 1) });
    if (endA < a.length - 1) parts.push({ type: 'same', values: a.slice(endA + 1) });
    return parts;
  }

  function lcsDiff(a, b, maxCells) {
    const n = a.length;
    const m = b.length;
    if (!n && !m) return [];
    if (!n) return [{ type: 'add', values: b.slice() }];
    if (!m) return [{ type: 'remove', values: a.slice() }];
    if (n * m > maxCells) return commonEdgeDiff(a, b);

    const width = m + 1;
    const dp = new Uint32Array((n + 1) * (m + 1));
    const at = (i, j) => i * width + j;

    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[at(i, j)] = a[i] === b[j]
          ? dp[at(i + 1, j + 1)] + 1
          : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
      }
    }

    const raw = [];
    const push = (type, value) => {
      const last = raw[raw.length - 1];
      if (last && last.type === type) last.values.push(value);
      else raw.push({ type, values: [value] });
    };

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        push('same', a[i]);
        i += 1;
        j += 1;
      } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
        push('remove', a[i]);
        i += 1;
      } else {
        push('add', b[j]);
        j += 1;
      }
    }
    while (i < n) {
      push('remove', a[i]);
      i += 1;
    }
    while (j < m) {
      push('add', b[j]);
      j += 1;
    }
    return raw;
  }

  function classifySeverity(before, after) {
    const combined = `${before}${after}`;
    if (/(https?:\/\/|www\.|@[\w.-]+\.|<\/?[A-Za-z][^>]*>|[0-9０-９]+\s*(年|月|日|時|分|円|%|％)|\b(?:AM|PM)\b)/i.test(combined)) return 'critical';
    if (/^[\s\n\r\t、。,.!！?？()（）\[\]【】「」『』]+$/u.test(combined)) return 'minor';
    return 'normal';
  }

  function textFromOps(ops) {
    return ops.map(op => op.values.join('')).join('');
  }

  function diffChangedBlock(beforeText, afterText, hunkId, beforeStart, afterStart) {
    if (!beforeText && !afterText) return [];
    if (!beforeText) return [{ type: 'add', value: afterText, hunkId, beforeStart, afterStart }];
    if (!afterText) return [{ type: 'remove', value: beforeText, hunkId, beforeStart, afterStart }];

    const charOps = lcsDiff(splitChars(beforeText), splitChars(afterText), MAX_CHAR_CELLS);
    const parts = [];
    let bPos = beforeStart;
    let aPos = afterStart;

    for (const op of charOps) {
      const value = op.values.join('');
      if (!value) continue;
      parts.push({
        type: op.type,
        value,
        hunkId: op.type === 'same' ? null : hunkId,
        beforeStart: bPos,
        afterStart: aPos
      });
      if (op.type !== 'add') bPos += value.length;
      if (op.type !== 'remove') aPos += value.length;
    }
    return parts;
  }

  function diffText(beforeText, afterText) {
    const before = String(beforeText || '');
    const after = String(afterText || '');
    const lineOps = lcsDiff(splitLines(before), splitLines(after), MAX_LINE_CELLS);

    const parts = [];
    const hunks = [];
    let beforePos = 0;
    let afterPos = 0;
    let i = 0;
    let hunkCounter = 0;

    while (i < lineOps.length) {
      const op = lineOps[i];
      if (op.type === 'same') {
        const value = textFromOps([op]);
        parts.push({ type: 'same', value, hunkId: null, beforeStart: beforePos, afterStart: afterPos });
        beforePos += value.length;
        afterPos += value.length;
        i += 1;
        continue;
      }

      const startBefore = beforePos;
      const startAfter = afterPos;
      let removed = '';
      let added = '';

      while (i < lineOps.length && lineOps[i].type !== 'same') {
        const current = lineOps[i];
        const value = textFromOps([current]);
        if (current.type === 'remove') {
          removed += value;
          beforePos += value.length;
        } else {
          added += value;
          afterPos += value.length;
        }
        i += 1;
      }

      const hunkId = `diff-${hunkCounter + 1}`;
      hunkCounter += 1;
      const kind = removed && added ? 'replace' : removed ? 'delete' : 'insert';
      hunks.push({ id: hunkId, kind, before: removed, after: added, beforeStart: startBefore, beforeEnd: startBefore + removed.length, afterStart: startAfter, afterEnd: startAfter + added.length, severity: classifySeverity(removed, added) });
      parts.push(...diffChangedBlock(removed, added, hunkId, startBefore, startAfter));
    }

    return { parts: compact(parts), hunks };
  }

  function prepareComparisonText(text, options = {}) {
    const raw = String(text || '');
    if (!options.ignoreHtmlTags) {
      return { raw, text: raw, map: Array.from({ length: raw.length }, (_, index) => index) };
    }

    let out = '';
    const map = [];
    let cursor = 0;
    const matcher = new RegExp(HTML_TAG_RE.source, 'g');
    let match;
    while ((match = matcher.exec(raw))) {
      for (let index = cursor; index < match.index; index += 1) {
        out += raw[index];
        map.push(index);
      }
      cursor = match.index + match[0].length;
    }
    for (let index = cursor; index < raw.length; index += 1) {
      out += raw[index];
      map.push(index);
    }
    return { raw, text: out, map };
  }

  function rawOffsetAt(prepared, normalizedOffset) {
    if (!prepared.text.length) return 0;
    if (normalizedOffset <= 0) return prepared.map[0] ?? 0;
    if (normalizedOffset >= prepared.text.length) return prepared.raw.length;
    return prepared.map[normalizedOffset] ?? prepared.raw.length;
  }

  function splitLineEntries(prepared) {
    const lines = splitLines(prepared.text);
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    let offset = 0;
    return lines.map((text, index) => {
      const start = offset;
      const end = start + text.length;
      offset = end;
      return { text, normalizedStart: start, normalizedEnd: end, rawStart: rawOffsetAt(prepared, start), rawEnd: rawOffsetAt(prepared, end), index };
    });
  }

  function makeRow(kind, beforeEntry, afterEntry, id, anchors = {}) {
    const before = beforeEntry?.text || '';
    const after = afterEntry?.text || '';
    const beforeStart = beforeEntry?.rawStart ?? anchors.before ?? 0;
    const beforeEnd = beforeEntry?.rawEnd ?? beforeStart;
    const afterStart = afterEntry?.rawStart ?? anchors.after ?? 0;
    const afterEnd = afterEntry?.rawEnd ?? afterStart;
    const parts = kind === 'same'
      ? [{ type: 'same', value: before, hunkId: null, beforeStart, afterStart }]
      : diffChangedBlock(before, after, id, beforeStart, afterStart);
    return { id, kind, before, after, beforeStart, beforeEnd, afterStart, afterEnd, severity: kind === 'same' ? 'minor' : classifySeverity(before, after), parts };
  }

  function diffRows(beforeText, afterText, options = {}) {
    const beforePrepared = prepareComparisonText(beforeText, options);
    const afterPrepared = prepareComparisonText(afterText, options);
    const beforeLines = splitLineEntries(beforePrepared);
    const afterLines = splitLineEntries(afterPrepared);
    const lineOps = lcsDiff(beforeLines.map(line => line.text), afterLines.map(line => line.text), MAX_LINE_CELLS);

    const rows = [];
    const hunks = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    let rowCounter = 0;
    let hunkCounter = 0;
    const anchors = () => ({ before: beforeLines[beforeIndex]?.rawStart ?? beforePrepared.raw.length, after: afterLines[afterIndex]?.rawStart ?? afterPrepared.raw.length });
    const addChangedRow = (kind, beforeEntry, afterEntry) => {
      hunkCounter += 1;
      const id = `compare-diff-${hunkCounter}`;
      const row = makeRow(kind, beforeEntry, afterEntry, id, anchors());
      rows.push(row);
      hunks.push({ id, kind, before: row.before, after: row.after, beforeStart: row.beforeStart, beforeEnd: row.beforeEnd, afterStart: row.afterStart, afterEnd: row.afterEnd, severity: row.severity });
    };

    let opIndex = 0;
    while (opIndex < lineOps.length) {
      const op = lineOps[opIndex];
      if (op.type === 'same') {
        for (let count = 0; count < op.values.length; count += 1) {
          const beforeEntry = beforeLines[beforeIndex++];
          const afterEntry = afterLines[afterIndex++];
          rowCounter += 1;
          rows.push(makeRow('same', beforeEntry, afterEntry, `compare-same-${rowCounter}`, anchors()));
        }
        opIndex += 1;
        continue;
      }

      const removed = [];
      const added = [];
      while (opIndex < lineOps.length && lineOps[opIndex].type !== 'same') {
        const changed = lineOps[opIndex];
        if (changed.type === 'remove') {
          for (let count = 0; count < changed.values.length; count += 1) removed.push(beforeLines[beforeIndex++]);
        } else {
          for (let count = 0; count < changed.values.length; count += 1) added.push(afterLines[afterIndex++]);
        }
        opIndex += 1;
      }

      const paired = Math.min(removed.length, added.length);
      for (let index = 0; index < paired; index += 1) addChangedRow('replace', removed[index], added[index]);
      for (let index = paired; index < removed.length; index += 1) addChangedRow('delete', removed[index], null);
      for (let index = paired; index < added.length; index += 1) addChangedRow('insert', null, added[index]);
    }

    const parts = [];
    rows.forEach(row => parts.push(...row.parts));
    return { rows, hunks, parts: compact(parts), before: beforePrepared.text, after: afterPrepared.text, ignoredTags: Boolean(options.ignoreHtmlTags) };
  }

  function reconstructBefore(parts) {
    return parts.filter(part => part.type !== 'add').map(part => part.value).join('');
  }

  function reconstructAfter(parts) {
    return parts.filter(part => part.type !== 'remove').map(part => part.value).join('');
  }

  const api = { diffText, diffRows, prepareComparisonText, reconstructBefore, reconstructAfter, _lcsDiff: lcsDiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextReviewDiffCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
