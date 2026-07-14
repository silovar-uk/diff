/* Text Review Studio v1 – page-like XLSX exporter. */
(function (root) {
  'use strict';

  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const COLOR = {
    ink:'FF17213A', navy:'FF101D34', white:'FFFFFFFF', muted:'FF71809A', line:'FFDDE3ED',
    red:'FF9F2F40', redSoft:'FFFDEBED', greenSoft:'FFE5F6EF', gold:'FF936000', goldSoft:'FFFFF4DC', graySoft:'FFF6F7FA'
  };

  const encoder = new TextEncoder();
  const bytes = (value) => encoder.encode(String(value));
  const u16 = (value) => { const out = new Uint8Array(2); new DataView(out.buffer).setUint16(0, value, true); return out; };
  const u32 = (value) => { const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value >>> 0, true); return out; };

  function concat(chunks) {
    const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => { output.set(chunk, offset); offset += chunk.length; });
    return output;
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(input) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < input.length; index += 1) crc = CRC_TABLE[(crc ^ input[index]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosStamp(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time:(date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      day:((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function zip(files) {
    const locals = [];
    const centrals = [];
    const stamp = dosStamp();
    let offset = 0;
    files.forEach((file) => {
      const name = bytes(file.name);
      const data = typeof file.data === 'string' ? bytes(file.data) : file.data;
      const crc = crc32(data);
      const local = concat([
        u32(0x04034B50), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.day),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data
      ]);
      locals.push(local);
      centrals.push(concat([
        u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.day),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), name
      ]));
      offset += local.length;
    });
    const central = concat(centrals);
    return concat([...locals, central, u32(0x06054B50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0)]);
  }

  function xml(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function clip(value) {
    const chars = Array.from(String(value ?? ''));
    return chars.length <= 32760 ? chars.join('') : `${chars.slice(0, 32740).join('')}\n…（Excelのセル上限により省略）`;
  }

  function run(value, color = COLOR.ink, bold = false, size = 11) {
    const text = clip(value);
    if (!text) return '';
    return `<r><rPr><rFont val="Yu Gothic"/><sz val="${size}"/><color rgb="${color}"/>${bold ? '<b/>' : ''}</rPr><t xml:space="preserve">${xml(text)}</t></r>`;
  }

  function textCell(ref, value, style) {
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(clip(value))}</t></is></c>`;
  }

  function richCell(ref, runs, style) {
    return `<c r="${ref}" s="${style}" t="inlineStr"><is>${runs.join('') || run('')}</is></c>`;
  }

  function marker(kind) {
    return ({ replace:'↔', insert:'＋', delete:'−' }[kind] || '');
  }

  function sideRuns(row, side) {
    const include = side === 'before' ? new Set(['same', 'remove']) : new Set(['same', 'add']);
    const changedType = side === 'before' ? 'remove' : 'add';
    const result = (row.parts || [])
      .filter((part) => include.has(part.type))
      .map((part) => run(part.value, part.type === changedType ? COLOR.red : COLOR.ink, part.type === changedType));
    if (result.length) return result;
    const fallback = side === 'before' ? row.before : row.after;
    return fallback ? [run(fallback, row.kind === 'same' ? COLOR.ink : COLOR.red, row.kind !== 'same')] : [];
  }

  function rowStyles(kind) {
    if (kind === 'same') return [6, 6, 6];
    if (kind === 'replace') return [7, 9, 8];
    if (kind === 'delete') return [7, 10, 12];
    if (kind === 'insert') return [12, 11, 8];
    return [6, 6, 6];
  }

  function rowHeight(row) {
    const maxLength = Math.max(String(row.before || '').length, String(row.after || '').length);
    const maxLines = Math.max(String(row.before || '').split('\n').length, String(row.after || '').split('\n').length);
    return Math.min(150, Math.max(24, 22 + Math.floor(maxLength / 72) * 14 + (maxLines - 1) * 11));
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="7">
    <font><sz val="11"/><color rgb="${COLOR.ink}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="${COLOR.white}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="${COLOR.navy}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="${COLOR.white}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="${COLOR.red}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="${COLOR.gold}"/><name val="Yu Gothic"/><family val="2"/></font>
    <font><sz val="10"/><color rgb="${COLOR.muted}"/><name val="Yu Gothic"/><family val="2"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${COLOR.navy}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF6F7FA"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${COLOR.redSoft}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${COLOR.greenSoft}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${COLOR.goldSoft}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F5F8"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="${COLOR.line}"/></left><right style="thin"><color rgb="${COLOR.line}"/></right><top style="thin"><color rgb="${COLOR.line}"/></top><bottom style="thin"><color rgb="${COLOR.line}"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="7" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="6" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
  }

  function sheetXml(model) {
    const rows = model.rows || [];
    const changed = rows.filter((row) => row.kind !== 'same').length;
    const replace = rows.filter((row) => row.kind === 'replace').length;
    const insert = rows.filter((row) => row.kind === 'insert').length;
    const deleted = rows.filter((row) => row.kind === 'delete').length;
    const sheetRows = [
      `<row r="1" ht="30" customHeight="1">${textCell('A1', 'Text Review Studio｜差分確認', 1)}</row>`,
      `<row r="2" ht="25" customHeight="1">${textCell('A2', '変更前', 2)}${textCell('B2', `差分 ${changed}件`, 4)}${textCell('C2', '修正後', 5)}</row>`,
      `<row r="3" ht="24" customHeight="1">${textCell('A3', `出力日時 ${new Date().toLocaleString('ja-JP', { hour12:false })}　｜　置換 ${replace}　追加 ${insert}　削除 ${deleted}`, 13)}</row>`,
      `<row r="4" ht="28" customHeight="1">${textCell('A4', '変更前（BEFORE）', 3)}${textCell('B4', '差分', 4)}${textCell('C4', '修正後（AFTER）', 5)}</row>`
    ];
    if (!rows.length) {
      sheetRows.push(`<row r="5" ht="30" customHeight="1">${textCell('A5', '比較できる内容がありません', 12)}${textCell('B5', '', 12)}${textCell('C5', '', 12)}</row>`);
    } else {
      rows.forEach((row, index) => {
        const number = index + 5;
        const [beforeStyle, markerStyle, afterStyle] = rowStyles(row.kind);
        sheetRows.push(`<row r="${number}" ht="${rowHeight(row)}" customHeight="1">${richCell(`A${number}`, sideRuns(row, 'before'), beforeStyle)}${textCell(`B${number}`, marker(row.kind), markerStyle)}${richCell(`C${number}`, sideRuns(row, 'after'), afterStyle)}</row>`);
      });
    }
    const lastRow = Math.max(5, rows.length + 4);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:C${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="72" customWidth="1"/><col min="2" max="2" width="8" customWidth="1"/><col min="3" max="3" width="72" customWidth="1"/></cols><sheetData>${sheetRows.join('')}</sheetData><mergeCells count="2"><mergeCell ref="A1:C1"/><mergeCell ref="A3:C3"/></mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }

  function workbookBytes(model) {
    const created = new Date().toISOString();
    return zip([
      { name:'[Content_Types].xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
      { name:'_rels/.rels', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
      { name:'docProps/core.xml', data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Text Review Studio 差分確認</dc:title><dc:creator>Text Review Studio</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>` },
      { name:'docProps/app.xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Text Review Studio</Application><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>差分確認</vt:lpstr></vt:vector></TitlesOfParts></Properties>' },
      { name:'xl/workbook.xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="差分確認" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name:'xl/_rels/workbook.xml.rels', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name:'xl/styles.xml', data:stylesXml() },
      { name:'xl/worksheets/sheet1.xml', data:sheetXml(model) }
    ]);
  }

  function currentModel() {
    const cached = root.TextReviewApp?.getComparison?.();
    if (cached) return cached;
    const before = document.querySelector('#baselineText')?.value || '';
    const after = document.querySelector('#workingText')?.value || '';
    const rows = root.TextReviewDiffCore?.diffRows(before, after, { ignoreHtmlTags:document.querySelector('#ignoreHtmlTagsToggle')?.checked ?? true })?.rows || [];
    return { before, after, rows };
  }

  function notify(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(notify.timer);
    notify.timer = root.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function fileStamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  function exportCurrentDiff() {
    const model = currentModel();
    if (!model.before && !model.after) { notify('変更前または修正後の原稿を入力してください'); return; }
    const blob = new Blob([workbookBytes(model)], { type:MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `差分確認_${fileStamp()}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1200);
    const menu = document.querySelector('#copyMenu');
    if (menu) menu.hidden = true;
    document.querySelector('#copyButton')?.setAttribute('aria-expanded', 'false');
    notify('差分確認用Excelを出力しました');
  }

  function boot() {
    const menu = document.querySelector('#copyMenu');
    if (menu && !document.querySelector('#exportDiffExcelButton')) {
      const button = document.createElement('button');
      button.id = 'exportDiffExcelButton';
      button.type = 'button';
      button.className = 'excel-export-entry';
      button.innerHTML = '<strong>Excelで差分確認</strong><span>画面と同じ行対応で出力</span>';
      menu.appendChild(button);
      button.addEventListener('click', (event) => { event.preventDefault(); exportCurrentDiff(); });
    }
  }

  root.TextReviewExcel = { buildWorkbookBytes:workbookBytes, exportCurrentDiff };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
