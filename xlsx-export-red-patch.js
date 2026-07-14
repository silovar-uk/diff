/* Text Review Studio – Excel presentation adjustments. */
(function (root) {
  'use strict';

  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const GREEN = 'FF17725A';
  const RED = 'FFC3505F';

  function utf8(value) {
    return new TextEncoder().encode(String(value));
  }

  function decode(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  function concat(chunks) {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  }

  function uint16(value) {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    return bytes;
  }

  function uint32(value) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
    return bytes;
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function readStoredZip(bytes) {
    const files = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034B50) {
      const method = view.getUint16(offset + 8, true);
      if (method !== 0) throw new Error('未対応のExcel圧縮形式です');
      const size = view.getUint32(offset + 18, true);
      const nameLength = view.getUint16(offset + 26, true);
      const extraLength = view.getUint16(offset + 28, true);
      const nameStart = offset + 30;
      const dataStart = nameStart + nameLength + extraLength;
      const name = decode(bytes.slice(nameStart, nameStart + nameLength));
      files.push({ name, data: bytes.slice(dataStart, dataStart + size) });
      offset = dataStart + size;
    }
    return files;
  }

  function writeStoredZip(files) {
    const localChunks = [];
    const centralChunks = [];
    const stamp = dosDateTime();
    let offset = 0;

    files.forEach((file) => {
      const name = utf8(file.name);
      const data = file.data instanceof Uint8Array ? file.data : utf8(file.data);
      const crc = crc32(data);
      const local = concat([
        uint32(0x04034B50), uint16(20), uint16(0x0800), uint16(0),
        uint16(stamp.time), uint16(stamp.day), uint32(crc), uint32(data.length), uint32(data.length),
        uint16(name.length), uint16(0), name, data
      ]);
      localChunks.push(local);
      centralChunks.push(concat([
        uint32(0x02014B50), uint16(20), uint16(20), uint16(0x0800), uint16(0),
        uint16(stamp.time), uint16(stamp.day), uint32(crc), uint32(data.length), uint32(data.length),
        uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name
      ]));
      offset += local.length;
    });

    const central = concat(centralChunks);
    return concat([
      ...localChunks,
      central,
      concat([
        uint32(0x06054B50), uint16(0), uint16(0), uint16(files.length), uint16(files.length),
        uint32(central.length), uint32(offset), uint16(0)
      ])
    ]);
  }

  function patchWorkbook(bytes) {
    const files = readStoredZip(bytes).map((file) => {
      if (file.name !== 'xl/worksheets/sheet1.xml') return file;
      let sheet = decode(file.data);
      // Modified text on both sides is red in Excel. Marker and cell fills keep
      // their existing page-like distinction between before and after.
      sheet = sheet.replaceAll(`<color rgb="${GREEN}"/>`, `<color rgb="${RED}"/>`);
      // Keep the compact summary but remove source/destination character counts.
      sheet = sheet
        .replace(/変更前 [0-9,]+文字/g, '変更前')
        .replace(/修正後 [0-9,]+文字/g, '修正後');
      return { ...file, data: utf8(sheet) };
    });
    return writeStoredZip(files);
  }

  function currentModel() {
    const before = document.querySelector('#baselineText')?.value || '';
    const after = document.querySelector('#workingText')?.value || '';
    if (!root.TextReviewDiffCore?.diffRows) throw new Error('差分エンジンを読み込めませんでした');
    const result = root.TextReviewDiffCore.diffRows(before, after, {
      ignoreHtmlTags: document.querySelector('#ignoreHtmlTagsToggle')?.checked ?? true,
      ignoreSoftFormatting: document.querySelector('#ignoreSoftFormattingToggle')?.checked ?? false
    });
    return { before, after, rows: result.rows || [] };
  }

  function stamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  function notify(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = root.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  function exportAdjustedExcel() {
    const base = root.TextReviewExcel;
    if (!base?.buildWorkbookBytes) throw new Error('Excel出力機能を読み込めませんでした');
    const model = currentModel();
    if (!model.before && !model.after) {
      notify('変更前または修正後の原稿を入力してください');
      return;
    }

    const bytes = patchWorkbook(base.buildWorkbookBytes(model));
    const url = URL.createObjectURL(new Blob([bytes], { type: MIME }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `差分確認_${stamp()}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1200);
    const menu = document.querySelector('#copyMenu');
    if (menu) menu.hidden = true;
    document.querySelector('#copyButton')?.setAttribute('aria-expanded', 'false');
    notify('差分確認用Excelを出力しました');
  }

  function install() {
    if (!root.TextReviewExcel?.buildWorkbookBytes) return false;
    root.TextReviewExcel.exportCurrentDiff = exportAdjustedExcel;
    root.TextReviewExcel.patchWorkbook = patchWorkbook;

    // Window capture runs before the older document-level exporter handler.
    root.addEventListener('click', (event) => {
      if (!event.target.closest?.('[data-action="export-diff-excel"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        exportAdjustedExcel();
      } catch (error) {
        console.error(error);
        notify(`Excelを出力できませんでした：${error.message || error}`);
      }
    }, true);
    return true;
  }

  if (!install()) {
    const timer = root.setInterval(() => {
      if (install()) root.clearInterval(timer);
    }, 25);
    root.setTimeout(() => root.clearInterval(timer), 10000);
  }
})(typeof window !== 'undefined' ? window : globalThis);
