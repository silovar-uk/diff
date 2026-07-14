/* Text Review Studio – ignore image-only HTML rows when tags are ignored. */
(function (root) {
  'use strict';

  function compact(parts) {
    const output = [];
    for (const part of parts || []) {
      if (!part || !part.value) continue;
      const previous = output[output.length - 1];
      if (previous && previous.type === part.type && previous.hunkId === part.hunkId) previous.value += part.value;
      else output.push({ ...part });
    }
    return output;
  }

  function stripImageOnlyLines(value) {
    return String(value || '').replace(/^[ \t]*<img\b[^>]*\/?[ \t]*>[ \t]*(?:\n|$)/gim, '');
  }

  function install() {
    const core = root.TextReviewDiffCore;
    // _buildUnits is installed by the CMS-aware bridge. Waiting for it avoids
    // wrapping the older diffRows implementation and being overwritten later.
    if (!core || typeof core.diffRows !== 'function' || typeof core._buildUnits !== 'function') return false;
    if (core.__imageTagsIgnored) return true;

    const baseDiffRows = core.diffRows.bind(core);
    const filteredDiffRows = (beforeText, afterText, options = {}) => {
      const result = baseDiffRows(beforeText, afterText, options);
      if (options.ignoreHtmlTags === false) return result;

      const rows = (result.rows || []).filter((row) => row.beforeType !== 'asset' && row.afterType !== 'asset');
      const hunks = rows
        .filter((row) => row.kind !== 'same')
        .map((row) => ({
          id: row.id,
          kind: row.kind,
          before: row.before,
          after: row.after,
          beforeStart: row.beforeStart,
          beforeEnd: row.beforeEnd,
          afterStart: row.afterStart,
          afterEnd: row.afterEnd,
          severity: row.severity
        }));

      return {
        ...result,
        rows,
        hunks,
        parts: compact(rows.flatMap((row) => row.parts || [])),
        before: stripImageOnlyLines(result.before),
        after: stripImageOnlyLines(result.after)
      };
    };

    core.diffRows = filteredDiffRows;
    core.diffText = (beforeText, afterText, options = {}) => {
      const result = filteredDiffRows(beforeText, afterText, options);
      return { parts: result.parts, hunks: result.hunks };
    };
    core.__imageTagsIgnored = true;
    return true;
  }

  if (!install()) {
    const timer = root.setInterval(() => {
      if (install()) root.clearInterval(timer);
    }, 25);
    root.setTimeout(() => root.clearInterval(timer), 10000);
  }
})(typeof window !== 'undefined' ? window : globalThis);
