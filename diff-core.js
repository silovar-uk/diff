/* Text Review Studio v0.6.9 – difff-style, tag-aware comparison core. */
(function (root) {
  'use strict';

  const MAX_LINE_CELLS = 180000;
  const MAX_CHAR_CELLS = 220000;
  const MAX_HUNK_ALIGNMENT_CELLS = 90000;
  const DEFAULT_LINE_MATCH_THRESHOLD = 0.34;
  const HTML_TAG_RE = /<\/?[A-Za-z][^>]*>/g;
  const SOFT_FORMATTING_KEY = 'text-review-studio-v067-ignore-soft-formatting';
  const IGNORE_TAGS_KEY = 'text-review-studio-v066-ignore-html-tags';

  function browserFlag(key, fallback) {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return fallback;
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value !== 'false';
    } catch (_) {
      return fallback;
    }
  }

  function resolveOptions(options) {
    const hasDom = typeof document !== 'undefined';
    return {
      ignoreHtmlTags: typeof options?.ignoreHtmlTags === 'boolean'
        ? options.ignoreHtmlTags
        : hasDom ? browserFlag(IGNORE_TAGS_KEY, true) : false,
      // difff-style comparison is line-first by default. This toggle is an
      // explicit relaxation for originals whose manual line wrapping differs.
      ignoreSoftFormatting: typeof options?.ignoreSoftFormatting === 'boolean'
        ? options.ignoreSoftFormatting
        : hasDom ? browserFlag(SOFT_FORMATTING_KEY, false) : false,
      lineMatchThreshold: Number.isFinite(options?.lineMatchThreshold)
        ? Math.min(1, Math.max(0, options.lineMatchThreshold))
        : DEFAULT_LINE_MATCH_THRESHOLD
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

  function lcsDiff(a, b, maxCells) {
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
    while (i < n) {
      push('remove', a[i]);
      i += 1;
    }
    while (j < m) {
      push('add', b[j]);
      j += 1;
    }
    return output;
  }

  function isHorizontalSpace(character) {
    return character === ' ' || character === '\t';
  }

  function isAsciiWord(character) {
    return /^[A-Za-z0-9]$/.test(character || '');
  }

  function entriesWithoutTags(raw, ignoreHtmlTags) {
    const entries = [];
    if (!ignoreHtmlTags) {
      for (let index = 0; index < raw.length; index += 1) entries.push({ char: raw[index], rawIndex: index });
      return entries;
    }

    const matcher = new RegExp(HTML_TAG_RE.source, 'g');
    let cursor = 0;
    let match;
    while ((match = matcher.exec(raw))) {
      for (let index = cursor; index < match.index; index += 1) entries.push({ char: raw[index], rawIndex: index });
      cursor = match.index + match[0].length;
    }
    for (let index = cursor; index < raw.length; index += 1) entries.push({ char: raw[index], rawIndex: index });
    return entries;
  }

  function condenseSoftFormatting(entries) {
    const output = [];
    let index = 0;
    const append = (entry) => output.push(entry);
    const trimTrailingSpaces = () => {
      while (output.length && isHorizontalSpace(output[output.length - 1].char)) output.pop();
    };

    while (index < entries.length) {
      const entry = entries[index];
      if (entry.char === '\r') {
        index += 1;
        continue;
      }
      if (entry.char !== '\n') {
        append(entry);
        index += 1;
        continue;
      }

      trimTrailingSpaces();
      const firstBreak = entry;
      let lastBreak = entry;
      let breaks = 0;
      let cursor = index;
      while (cursor < entries.length) {
        if (entries[cursor].char === '\r') {
          cursor += 1;
          continue;
        }
        if (entries[cursor].char === '\n') {
          breaks += 1;
          lastBreak = entries[cursor];
          cursor += 1;
          while (cursor < entries.length && isHorizontalSpace(entries[cursor].char)) cursor += 1;
          continue;
        }
        break;
      }

      if (breaks >= 2) {
        append({ char: '\n', rawIndex: firstBreak.rawIndex });
        append({ char: '\n', rawIndex: lastBreak.rawIndex });
      } else {
        const previous = output[output.length - 1]?.char || '';
        const next = entries[cursor]?.char || '';
        if (isAsciiWord(previous) && isAsciiWord(next)) append({ char: ' ', rawIndex: firstBreak.rawIndex });
      }
      index = cursor;
    }
    return output;
  }

  function prepareComparisonText(text, options = {}) {
    const resolved = resolveOptions(options);
    const raw = String(text || '');
    const withoutTags = entriesWithoutTags(raw, resolved.ignoreHtmlTags);
    const entries = resolved.ignoreSoftFormatting
      ? condenseSoftFormatting(withoutTags)
      : withoutTags.filter(entry => entry.char !== '\r');
    return {
      raw,
      text: entries.map(entry => entry.char).join(''),
      map: entries.map(entry => entry.rawIndex),
      options: resolved
    };
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
      units.push({
        text: text.slice(start, end),
        start,
        end,
        rawStart: rawOffsetAt(prepared, start),
        rawEnd: rawOffsetAt(prepared, end)
      });
      start = end;
    }
    if (start < text.length) {
      units.push({
        text: text.slice(start),
        start,
        end: text.length,
        rawStart: rawOffsetAt(prepared, start),
        rawEnd: rawOffsetAt(prepared, text.length)
      });
    }
    return units;
  }

  function normalizeLineForSimilarity(value) {
    return String(value || '')
      .replace(/[\r\n]/g, '')
      .replace(/[ \t　]+/g, ' ')
      .trim();
  }

  function bigrams(value) {
    const characters = Array.from(value);
    const output = new Map();
    if (characters.length < 2) return output;
    for (let index = 0; index < characters.length - 1; index += 1) {
      const gram = `${characters[index]}${characters[index + 1]}`;
      output.set(gram, (output.get(gram) || 0) + 1);
    }
    return output;
  }

  /**
   * Lightweight Dice similarity for line matching within a changed LCS hunk.
   * It is deliberately independent from the character-level LCS used for
   * highlighting: this score only decides whether two *rows* deserve ↔.
   */
  function lineSimilarity(left, right) {
    const a = normalizeLineForSimilarity(left);
    const b = normalizeLineForSimilarity(right);
    if (a === b) return 1;
    if (!a || !b) return 0;
    if (a.length < 2 || b.length < 2) return 0;

    const leftBigrams = bigrams(a);
    const rightBigrams = bigrams(b);
    let totalLeft = 0;
    let totalRight = 0;
    let intersection = 0;
    leftBigrams.forEach((count, gram) => {
      totalLeft += count;
      if (rightBigrams.has(gram)) intersection += Math.min(count, rightBigrams.get(gram));
    });
    rightBigrams.forEach((count) => { totalRight += count; });
    const total = totalLeft + totalRight;
    return total ? (2 * intersection) / total : 0;
  }

  /**
   * Needleman–Wunsch-style alignment of one changed line block.
   * Gaps score zero. A diagonal is available only when similarity is at or
   * above the threshold, so unrelated lines can never become a replace pair
   * merely because they occupy the same ordinal position in a hunk.
   */
  function alignHunk(removed, added, matchThreshold = DEFAULT_LINE_MATCH_THRESHOLD) {
    const n = removed.length;
    const m = added.length;
    if (!n) return added.map(after => ({ before: null, after, similarity: 0 }));
    if (!m) return removed.map(before => ({ before, after: null, similarity: 0 }));

    // A very large changed block should favour a conservative display over
    // allocating a large matrix or inventing unreliable row correspondences.
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

    for (let index = 1; index <= n; index += 1) back[index][0] = UP;
    for (let index = 1; index <= m; index += 1) back[0][index] = LEFT;

    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) {
        const similarity = lineSimilarity(removed[i - 1].text, added[j - 1].text);
        similarities[i - 1][j - 1] = similarity;
        const diagonal = similarity >= matchThreshold
          ? score[i - 1][j - 1] + (similarity - matchThreshold + 0.0001)
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
    const commonCount = operations
      .filter(operation => operation.type === 'same')
      .reduce((count, operation) => count + operation.values.length, 0);
    const size = Math.max([...beforeText].length, [...afterText].length);
    const similarity = size ? commonCount / size : 1;

    if (size >= 18 && similarity < 0.28) {
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
      parts.push({
        type: operation.type,
        value,
        hunkId: operation.type === 'same' ? null : hunkId,
        beforeStart: beforeCursor,
        afterStart: afterCursor
      });
      if (operation.type !== 'add') beforeCursor += value.length;
      if (operation.type !== 'remove') afterCursor += value.length;
    }
    return parts;
  }

  function makeRow(kind, beforeUnit, afterUnit, id, anchors) {
    const before = beforeUnit?.text || '';
    const after = afterUnit?.text || '';
    const beforeStart = beforeUnit?.rawStart ?? anchors.before;
    const afterStart = afterUnit?.rawStart ?? anchors.after;
    const parts = kind === 'same'
      ? [{ type: 'same', value: before, hunkId: null, beforeStart, afterStart }]
      : inlineDiff(before, after, id, beforeStart, afterStart);
    return {
      id,
      kind,
      before,
      after,
      beforeStart,
      beforeEnd: beforeUnit?.rawEnd ?? beforeStart,
      afterStart,
      afterEnd: afterUnit?.rawEnd ?? afterStart,
      severity: kind === 'same' ? 'minor' : classifySeverity(before, after),
      parts
    };
  }

  function diffRows(beforeText, afterText, options = {}) {
    const beforePrepared = prepareComparisonText(beforeText, options);
    const afterPrepared = prepareComparisonText(afterText, options);
    const beforeUnits = splitUnits(beforePrepared);
    const afterUnits = splitUnits(afterPrepared);
    const operations = lcsDiff(beforeUnits.map(unit => unit.text), afterUnits.map(unit => unit.text), MAX_LINE_CELLS);
    const rows = [];
    const hunks = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    let sameCount = 0;
    let changeCount = 0;

    const anchors = () => ({
      before: beforeUnits[beforeIndex]?.rawStart ?? beforePrepared.raw.length,
      after: afterUnits[afterIndex]?.rawStart ?? afterPrepared.raw.length
    });

    const addRow = (kind, beforeUnit, afterUnit, position = anchors()) => {
      const id = kind === 'same' ? `same-${++sameCount}` : `diff-${++changeCount}`;
      const row = makeRow(kind, beforeUnit, afterUnit, id, position);
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

    let operationIndex = 0;
    while (operationIndex < operations.length) {
      const operation = operations[operationIndex];
      if (operation.type === 'same') {
        for (let count = 0; count < operation.values.length; count += 1) {
          addRow('same', beforeUnits[beforeIndex++], afterUnits[afterIndex++]);
        }
        operationIndex += 1;
        continue;
      }

      const hunkPosition = anchors();
      const removed = [];
      const added = [];
      while (operationIndex < operations.length && operations[operationIndex].type !== 'same') {
        const changed = operations[operationIndex];
        if (changed.type === 'remove') {
          for (let count = 0; count < changed.values.length; count += 1) removed.push(beforeUnits[beforeIndex++]);
        } else {
          for (let count = 0; count < changed.values.length; count += 1) added.push(afterUnits[afterIndex++]);
        }
        operationIndex += 1;
      }

      // A changed LCS block is not automatically a list of replacement pairs.
      // Align only semantically similar rows; emit all other rows as + / −.
      for (const pair of alignHunk(removed, added, beforePrepared.options.lineMatchThreshold)) {
        if (pair.before && pair.after) addRow('replace', pair.before, pair.after, hunkPosition);
        else if (pair.before) addRow('delete', pair.before, null, hunkPosition);
        else addRow('insert', null, pair.after, hunkPosition);
      }
    }

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

  function diffText(beforeText, afterText, options = {}) {
    const result = diffRows(beforeText, afterText, options);
    return { parts: result.parts, hunks: result.hunks };
  }

  function reconstructBefore(parts) {
    return parts.filter(part => part.type !== 'add').map(part => part.value).join('');
  }

  function reconstructAfter(parts) {
    return parts.filter(part => part.type !== 'remove').map(part => part.value).join('');
  }

  const api = {
    diffText,
    diffRows,
    prepareComparisonText,
    reconstructBefore,
    reconstructAfter,
    _lcsDiff: lcsDiff,
    _lineSimilarity: lineSimilarity,
    _alignHunk: alignHunk
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextReviewDiffCore = api;

  // app.js was originally built against a broader static shell. Keep these
  // silent anchors so the comparison engine stays independent of page chrome.
  function ensureCompatibilityAnchors() {
    if (typeof document === 'undefined' || !document.body) return;
    const add = (parent, markup) => parent.insertAdjacentHTML('beforeend', markup);
    const afterPane = document.querySelector('.after-pane') || document.body;
    if (!document.querySelector('#searchBar')) {
      add(afterPane, '<div id="searchBar" class="search-bar" hidden><span>検索</span><input id="searchInput"><span id="searchCount">0件</span><button data-action="search-prev">←</button><button data-action="search-next">→</button><button data-action="toggle-replace">置換</button><button data-action="close-search">×</button><div id="replaceControls" hidden><input id="replaceInput"><input id="replaceProtect" type="checkbox" checked><button data-action="replace-one">1件置換</button><button data-action="replace-all">すべて置換</button></div></div>');
    }
    const ids = ['baselineEmptyText', 'workingEmptyText', 'workingMeta', 'railTotal', 'railSub', 'railDots', 'reviewCounts', 'activeReview', 'queueListCount', 'queueList', 'outputSettingsButton', 'historyButton', 'exceptionsButton', 'outputSettings', 'outputPreview', 'historyDrawer', 'historyList', 'exceptionsDrawer', 'exceptionList'];
    if (ids.some(id => !document.getElementById(id))) {
      const hidden = document.createElement('div');
      hidden.id = 'trs-compat-anchors';
      hidden.hidden = true;
      hidden.innerHTML = '<span id="baselineEmptyText"></span><span id="workingEmptyText"></span><span id="workingMeta"></span><span id="railTotal"></span><span id="railSub"></span><div id="railDots"></div><div id="reviewCounts"></div><div id="activeReview"></div><span id="queueListCount"></span><div id="queueList"></div><button id="outputSettingsButton"></button><button id="historyButton"></button><button id="exceptionsButton"></button><section id="outputSettings" hidden><pre id="outputPreview"></pre></section><section id="historyDrawer" hidden><div id="historyList"></div></section><section id="exceptionsDrawer" hidden><div id="exceptionList"></div></section>';
      document.body.appendChild(hidden);
    }
    const transform = document.querySelector('#transformDialog');
    if (transform && !document.querySelector('#transformSummary')) add(transform, '<span id="transformSummary"></span><div id="transformExamples"></div><button id="applyTransformButton" data-action="apply-pending-transform"></button>');
    const pattern = document.querySelector('#patternDialog');
    if (pattern && !document.querySelector('#patternPreview')) add(pattern, '<div id="patternPreview"></div><button id="applyPatternButton" data-action="apply-pending-transform"></button>');
    const audit = document.querySelector('#auditDialog');
    if (audit && !document.querySelector('#auditGrid')) add(audit, '<div id="auditGrid"></div>');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureCompatibilityAnchors, { once: true });
    else ensureCompatibilityAnchors();
  }
})(typeof window !== 'undefined' ? window : globalThis);
