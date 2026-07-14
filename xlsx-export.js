/* Text Review Studio – page-like Excel diff export. */
(function (root) {
  'use strict';

  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const COLORS = {
    ink: 'FF17213A',
    soft: 'FF53627E',
    faint: 'FF7D8AA3',
    navy: 'FF101D34',
    white: 'FFFFFFFF',
    line: 'FFD8DEEA',
    before: 'FFC3505F',
    beforeSoft: 'FFFDEBED',
    after: 'FF17725A',
    afterSoft: 'FFE5F6EF',
    gold: 'FFA56B0A',
    goldSoft: 'FFFFF5DF',
    graySoft: 'FFF6F7FB',
    blueSoft: 'FFEAF0FF'
  };

  function xml(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function utf8(value) {
    return new TextEncoder().encode(String(value));
  }

  function concat(chunks) {
    const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const output = new Uint8Array(size);
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
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  function zip(files) {
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;
    const stamp = dosDateTime();

    files.forEach((file) => {
      const name = utf8(file.name);
      const data = typeof file.data === 'string' ? utf8(file.data) : file.data;
      const crc = crc32(data);
      const local = concat([
        uint32(0x04034B50), uint16(20), uint16(0x0800), uint16(0),
        uint16(stamp.time), uint16(stamp.day), uint32(crc), uint32(data.length), uint32(data.length),
        uint16(name.length), uint16(0), name, data
      ]);
      localChunks.push(local);

      const central = concat([
        uint32(0x02014B50), uint16(20), uint16(20), uint16(0x0800), uint16(0),
        uint16(stamp.time), uint16(stamp.day), uint32(crc), uint32(data.length), uint32(data.length),
        uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name
      ]);
      centralChunks.push(central);
      offset += local.length;
    });

    const centralDirectory = concat(centralChunks);
    const end = concat([
      uint32(0x06054B50), uint16(0), uint16(0), uint16(files.length), uint16(files.length),
      uint32(centralDirectory.length), uint32(offset), uint16(0)
    ]);
    return concat([...localChunks, centralDirectory, end]);
  }

  function richRun(text, color, bold = false, size = 11) {
    if (!text) return '';
    return `<r><rPr><rFont val="Yu Gothic"/><sz val="${size}"/><color rgb="${color}"/>${bold ? '<b/>' : ''}</rPr><t xml:space="preserve">${xml(text)}</t></r>`;
  }

  function textCell(ref, value, style) {
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }

  function richCell(ref, runs, style) {
    const content = runs.length ? runs.join('') : richRun('', COLORS.ink);
    return `<c r="${ref}" s="${style}" t="inlineStr"><is>${content}</is></c>`;
  }

  function sideRuns(row, side) {
    const include = side === 'before' ? new Set(['same', 'remove']) : new Set(['same', 'add']);
    const changeType = side === 'before' ? 'remove' : 'add';
    const changeColor = side === 'before' ? COLORS.before : COLORS.after;
    const parts = Array.isArray(row.parts) ? row.parts : [];
    const runs = parts
      .filter((part) => include.has(part.type))
      .map((part) => richRun(part.value, part.type === changeType ? changeColor : COLORS.ink, part.type === changeType));
    if (runs.length) return runs;
    const fallback = side === 'before' ? row.before : row.after;
    return fallback ? [richRun(fallback, row.kind === 'same' ? COLORS.ink : changeColor, row.kind !== 'same')] : [];
  }

  function markerFor(kind) {
    if (kind === 'replace') return '↔';
    if (kind === 'insert') return '＋';
    if (kind === 'delete') return '−';
    return '';
  }

  function stylesForRow(kind, before, after) {
    if (kind === 'same') return { before: 6, marker: 6, after: 6 };
    if (kind === 'replace') return { before: 7, marker: 9, after: 8 };
    if (kind === 'delete') return { before: 7, marker: 10, after: 12 };
    if (kind === 'insert') return { before: 12, marker: 11, after: 8 };
    return { before: before ? 13 : 12, marker: 6, after: after ? 13 : 12 };
  }

  function rowHeight(row) {
    const length = Math.max(String(row.before || '').length, String(row.after || '').length);
    const lines = Math.max(String(row.before || '').split('\n').length, String(row.after || '').split('\n').length);
    return Math.min(120, Math.max(24, 22 + Math.floor(length / 70) * 15 + (lines - 1) * 12));
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="8">
    <font><sz val="11"/><color rgb="${COLORS.ink}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="${COLORS.white}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="${COLORS.navy}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="${COLORS.white}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="${COLORS.before}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="${COLORS.after}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="${COLORS.gold}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><sz val="10"/><color rgb="${COLORS.faint}"/><name val="Yu Gothic"/><family val="2"/></font>
  </fonts>
  <fills count="9">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${COLORS.navy}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${COLORS.graySoft}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${COLORS.beforeSoft}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${COLORS.afterSoft}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${COLORS.goldSoft}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F5F9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${COLORS.blueSoft}"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="${COLORS.line}"/></left><right style="thin"><color rgb="${COLORS.line}"/></right><top style="thin"><color rgb="${COLORS.line}"/></top><bottom style="thin"><color rgb="${COLORS.line}"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="8" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="7" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
  }

  function sheetXml(model) {
    const rows = model.rows || [];
    const changed = rows.filter((row) => row.kind !== 'same').length;
    const replace = rows.filter((row) => row.kind === 'replace').length;
    const insert = rows.filter((row) => row.kind === 'insert').length;
    const deleted = rows.filter((row) => row.kind === 'delete').length;
    const lastRow = Math.max(5, rows.length + 4);
    const now = new Date();
    const stamp = now.toLocaleString('ja-JP', { hour12: false });
    const sheetRows = [];

    sheetRows.push(`<row r="1" ht="30" customHeight="1">${textCell('A1', 'Text Review Studio｜差分確認', 1)}</row>`);
    sheetRows.push(`<row r="2" ht="25" customHeight="1">${textCell('A2', `変更前 ${String(model.before || '').length.toLocaleString()}文字`, 2)}${textCell('B2', `差分 ${changed}件`, 4)}${textCell('C2', `修正後 ${String(model.after || '').length.toLocaleString()}文字`, 2)}</row>`);
    sheetRows.push(`<row r="3" ht="24" customHeight="1">${textCell('A3', `出力日時 ${stamp}　｜　置換 ${replace}　追加 ${insert}　削除 ${deleted}`, 13)}</row>`);
    sheetRows.push(`<row r="4" ht="28" customHeight="1">${textCell('A4', '変更前（BEFORE）', 3)}${textCell('B4', '差分', 4)}${textCell('C4', '修正後（AFTER）', 5)}</row>`);

    if (!rows.length) {
      sheetRows.push(`<row r="5" ht="30" customHeight="1">${textCell('A5', '比較できる内容がありません', 12)}${textCell('B5', '', 12)}${textCell('C5', '', 12)}</row>`);
    } else {
      rows.forEach((row, index) => {
        const number = index + 5;
        const styles = stylesForRow(row.kind, row.before, row.after);
        sheetRows.push(`<row r="${number}" ht="${rowHeight(row)}" customHeight="1">${richCell(`A${number}`, sideRuns(row, 'before'), styles.before)}${textCell(`B${number}`, markerFor(row.kind), styles.marker)}${richCell(`C${number}`, sideRuns(row, 'after'), styles.after)}</row>`);
      });
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:C${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="1" width="72" customWidth="1"/><col min="2" max="2" width="8" customWidth="1"/><col min="3" max="3" width="72" customWidth="1"/></cols>
  <sheetData>${sheetRows.join('')}</sheetData>
  <mergeCells count="2"><mergeCell ref="A1:C1"/><mergeCell ref="A3:C3"/></mergeCells>
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
  }

  function buildWorkbookBytes(model) {
    const created = new Date().toISOString();
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Text Review Studio 差分確認</dc:title><dc:creator>Text Review Studio</dc:creator><cp:lastModifiedBy>Text Review Studio</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>` },
      { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Text Review Studio</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>差分確認</vt:lpstr></vt:vector></TitlesOfParts><Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>1.0</AppVersion></Properties>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews><sheets><sheet name="差分確認" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: stylesXml() },
      { name: 'xl/worksheets/sheet1.xml', data: sheetXml(model) }
    ];
    return zip(files);
  }

  function fileStamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  function notify(message) {
    if (typeof document === 'undefined') return;
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = root.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  function currentModel() {
    const before = document.querySelector('#baselineText')?.value || '';
    const after = document.querySelector('#workingText')?.value || '';
    if (!root.TextReviewDiffCore?.diffRows) throw new Error('差分エンジンを読み込めませんでした');
    const options = {
      ignoreHtmlTags: document.querySelector('#ignoreHtmlTagsToggle')?.checked ?? true,
      ignoreSoftFormatting: document.querySelector('#ignoreSoftFormattingToggle')?.checked ?? false
    };
    const result = root.TextReviewDiffCore.diffRows(before, after, options);
    return { before, after, rows: result.rows || [] };
  }

  function exportCurrentDiff() {
    const model = currentModel();
    if (!model.before && !model.after) {
      notify('変更前または修正後の原稿を入力してください');
      return;
    }
    const bytes = buildWorkbookBytes(model);
    const blob = new Blob([bytes], { type: MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `差分確認_${fileStamp()}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1200);
    const menu = document.querySelector('#copyMenu');
    if (menu) menu.hidden = true;
    document.querySelector('#copyButton')?.setAttribute('aria-expanded', 'false');
    notify('差分確認用Excelを出力しました');
  }

  function installStyle() {
    if (document.querySelector('#excelExportStyle')) return;
    const style = document.createElement('style');
    style.id = 'excelExportStyle';
    style.textContent = `
      .topbar { z-index:1000 !important; overflow:visible !important; }
      .top-actions { position:relative; z-index:1010; }
      .copy-wrap { position:relative; z-index:1020; }
      .copy-menu { z-index:1030 !important; overflow:visible; }
      .copy-menu .excel-export-entry { border-top:1px solid #e4e8f0; }
      .copy-menu .excel-export-entry strong { color:#244d9e; }
    `;
    document.head.appendChild(style);
  }

  function installButton() {
    const menu = document.querySelector('#copyMenu');
    if (!menu || document.querySelector('#exportDiffExcelButton')) return;
    const button = document.createElement('button');
    button.id = 'exportDiffExcelButton';
    button.type = 'button';
    button.className = 'excel-export-entry';
    button.dataset.action = 'export-diff-excel';
    button.innerHTML = '<strong>Excelで差分確認</strong><span>ページに近い左右比較で出力</span>';
    menu.appendChild(button);
  }

  function boot() {
    installStyle();
    installButton();
    document.addEventListener('click', (event) => {
      if (!event.target.closest('[data-action="export-diff-excel"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        exportCurrentDiff();
      } catch (error) {
        console.error(error);
        notify(`Excelを出力できませんでした：${error.message || error}`);
      }
    }, true);
  }

  root.TextReviewExcel = { buildWorkbookBytes, exportCurrentDiff };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
