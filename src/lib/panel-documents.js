// The standalone build embeds PDFKit's standard font metrics, which keeps the
// generated documents portable inside Next.js's bundled route output.
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import SVGtoPDF from "svg-to-pdfkit";

import { sandboxConsolidatedCutlist, sandboxPanelCutlist, sandboxPanelDrawingSvg } from "@/lib/panel-sandbox-output";

const PANEL_PATTERN = /\bCP-(\d{4})-(\d{4})-(\d{4})-([A-Z])-([A-Z])-([A-Z])-([A-Z])-([A-Z])(?:-(\d{4})-(\d{4})-(\d{4})-(\d{4}))?\b/i;
const RULES = { stile: 25.4, rail: 19.05, meshX: 20, meshY: 100, endRailInset: 12.7, endRailCenter: 22.225, midrailStandard: 733.65, midrailLower: 433.65, cutoutReuse: 200 };

export function parsePanelPartNumber(value) {
  const match = String(value || "").trim().toUpperCase().match(PANEL_PATTERN);
  if (!match) throw new Error("A recognized CP panel part number is required.");
  const width = Number(match[1]);
  const height = Number(match[2]);
  const sweep = Number(match[3]);
  const cut = match.slice(9, 13).map((item) => Number(item || 0));
  if (width <= RULES.stile * 2 || height <= RULES.rail * 2) throw new Error("Panel dimensions are too small.");
  if (!['A', 'B'].includes(match[4]) || !['S', 'L'].includes(match[5])) throw new Error("Panel fitting code is invalid.");
  return {
    partNumber: match[0].toUpperCase(), width, height, sweep,
    fitting: match[4], lowerPosition: match[5], removeLower: match[6], removeUpper: match[7],
    customCutoutCode: match[8], cutoutSelected: match[8] === 'B' && cut[2] > 0 && cut[3] > 0,
    cutout: { x: cut[0], y: cut[1], width: cut[2], height: cut[3] },
  };
}

function clippedCutout(panel) {
  const left = Math.max(0, Math.min(panel.width, panel.cutout.x));
  const top = Math.max(0, Math.min(panel.height, panel.cutout.y));
  const right = Math.max(left, Math.min(panel.width, panel.cutout.x + panel.cutout.width));
  const bottom = Math.max(top, Math.min(panel.height, panel.cutout.y + panel.cutout.height));
  return { x: left, y: top, width: right - left, height: bottom - top, right, bottom, leftOpen: left === 0, rightOpen: right === panel.width, topOpen: top === 0, bottomOpen: bottom === panel.height };
}

function supportRails(panel) {
  const halfRail = RULES.rail / 2;
  const spacing = panel.lowerPosition === 'L' ? RULES.midrailLower : RULES.midrailStandard;
  const rails = [{ y: RULES.endRailCenter - halfRail, center: RULES.endRailCenter, name: 'Top rail', source: 'end' }];
  const mids = [];
  const upperCenter = RULES.endRailCenter + spacing;
  const lowerCenter = panel.height - RULES.endRailCenter - spacing;
  if (panel.removeUpper === 'A' && upperCenter > RULES.endRailCenter + RULES.rail && upperCenter < panel.height - RULES.endRailCenter - RULES.rail) mids.push({ y: upperCenter - halfRail, center: upperCenter, name: 'Upper mid-rail', source: 'upper' });
  if (panel.removeLower === 'A' && lowerCenter > RULES.endRailCenter + RULES.rail && lowerCenter < panel.height - RULES.endRailCenter - RULES.rail) mids.push({ y: lowerCenter - halfRail, center: lowerCenter, name: 'Lower mid-rail', source: 'lower' });
  if (panel.cutoutSelected) {
    const cut = clippedCutout(panel);
    const targets = [];
    if (!cut.topOpen && cut.width > 0 && cut.height > 0) targets.push({ y: cut.y - RULES.rail, center: cut.y - halfRail, edge: 'top' });
    if (!cut.bottomOpen && cut.width > 0 && cut.height > 0) targets.push({ y: cut.bottom, center: cut.bottom + halfRail, edge: 'bottom' });
    const used = new Set();
    for (const target of targets) {
      let best = -1; let distance = Infinity;
      mids.forEach((mid, index) => { const candidate = Math.abs(mid.center - target.center); if (!used.has(index) && candidate < distance) { best = index; distance = candidate; } });
      if (best >= 0 && distance <= RULES.cutoutReuse) {
        used.add(best); rails.push({ ...target, name: `${mids[best].name} relocated`, source: mids[best].source });
      } else rails.push({ ...target, name: `Added cutout ${target.edge} rail`, source: 'added' });
    }
    mids.forEach((mid, index) => { if (!used.has(index)) rails.push(mid); });
  } else rails.push(...mids);
  rails.push({ y: panel.height - RULES.endRailCenter - halfRail, center: panel.height - RULES.endRailCenter, name: 'Bottom rail', source: 'end' });
  return rails.sort((a, b) => a.y - b.y);
}

function cutoutVerticals(panel) {
  if (!panel.cutoutSelected) return [];
  const cut = clippedCutout(panel); const verticals = [];
  const top = cut.topOpen ? RULES.endRailInset : cut.y;
  const bottom = cut.bottomOpen ? panel.height - RULES.endRailInset : cut.bottom;
  const length = Math.max(0, bottom - top);
  if (!cut.leftOpen && cut.x > RULES.stile && length > 0) verticals.push({ x: cut.x - RULES.rail, y: top, length, name: 'Cutout left vertical', edge: 'left' });
  if (!cut.rightOpen && cut.right < panel.width - RULES.stile && length > 0) verticals.push({ x: cut.right, y: top, length, name: 'Cutout right vertical', edge: 'right' });
  return verticals;
}

function horizontalRailPieces(panel) {
  const start = RULES.stile; const end = panel.width - RULES.stile;
  if (!panel.cutoutSelected) return supportRails(panel).map((rail) => ({ ...rail, x: start, length: end - start, segment: 'full' }));
  const cut = clippedCutout(panel); const verticals = cutoutVerticals(panel);
  const leftVertical = verticals.find((item) => item.edge === 'left');
  const rightVertical = verticals.find((item) => item.edge === 'right');
  return supportRails(panel).flatMap((rail) => {
    const intersects = !rail.edge && rail.y < cut.bottom && rail.y + RULES.rail > cut.y;
    if (!intersects) return [{ ...rail, x: start, length: end - start, segment: 'full' }];
    const pieces = []; const leftEnd = Math.min(end, leftVertical ? leftVertical.x : cut.x); const rightStart = Math.max(start, rightVertical ? rightVertical.x + RULES.rail : cut.right);
    if (leftEnd > start) pieces.push({ ...rail, x: start, length: leftEnd - start, segment: 'left' });
    if (rightStart < end) pieces.push({ ...rail, x: rightStart, length: end - rightStart, segment: 'right' });
    return pieces;
  });
}

function tapLocations(panel) {
  const top = panel.fitting === 'A' ? 300 : 100;
  const bottom = panel.fitting === 'A' ? panel.height - 298 : panel.height - 98;
  return [top, top + 13, top + 26, bottom, bottom + 26].filter((value, index, values) => value >= 0 && value <= panel.height && values.indexOf(value) === index);
}

function stilePieces(panel) {
  const pieces = [];
  for (const side of ['left', 'right']) {
    const cut = panel.cutoutSelected ? clippedCutout(panel) : null;
    const open = cut && (side === 'left' ? cut.leftOpen : cut.rightOpen) && cut.height > 0;
    if (!open) pieces.push({ side, y: 0, length: panel.height });
    else { if (cut.y > 0) pieces.push({ side, y: 0, length: cut.y }); if (cut.bottom < panel.height) pieces.push({ side, y: cut.bottom, length: panel.height - cut.bottom }); }
  }
  return pieces;
}

export function panelCutlist(panel, quantity = 1) {
  const rows = [];
  const stileGroups = new Map();
  for (const piece of stilePieces(panel)) {
    const localTaps = tapLocations(panel).filter((value) => value >= piece.y && value <= piece.y + piece.length).map((value) => value - piece.y);
    const note = localTaps.length ? `Drill/tap local Y ${localTaps.map((value) => value.toFixed(1)).join(', ')}` : 'No drilling';
    const key = `${piece.length.toFixed(3)}|${note}`;
    const group = stileGroups.get(key) || { item: 'ST', material: 'Mild steel tube', profile: '25.4 × 25.4 sq.', length: piece.length, qty: 0, sides: [], note };
    group.qty += quantity; group.sides.push(piece.side); stileGroups.set(key, group);
  }
  [...stileGroups.values()].forEach((row, index) => rows.push({ ...row, item: `ST-${String(index + 1).padStart(2, '0')}`, note: `${[...new Set(row.sides)].join(' + ')} stile · ${row.note}` }));
  const railGroups = new Map();
  for (const piece of horizontalRailPieces(panel)) {
    const key = piece.length.toFixed(3); const description = `${piece.name}${piece.segment === 'full' ? '' : ` · ${piece.segment} segment`}`;
    const group = railGroups.get(key) || { item: 'RL', material: 'Mild steel tube', profile: '19.05 × 19.05 sq.', length: piece.length, qty: 0, descriptions: new Set() };
    group.qty += quantity; group.descriptions.add(description); railGroups.set(key, group);
  }
  [...railGroups.values()].forEach((row, index) => rows.push({ ...row, item: `RL-${String(index + 1).padStart(2, '0')}`, note: [...row.descriptions].join('; ') }));
  const verticals = cutoutVerticals(panel);
  if (verticals.length) rows.push({ item: 'CV-01', material: 'Mild steel tube', profile: '19.05 × 19.05 sq.', length: verticals[0].length, qty: verticals.length * quantity, note: `${verticals.map((item) => item.edge).join(' + ')} cutout verticals` });
  return rows;
}

function pdfBuffer(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 28 }); const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    draw(doc); doc.end();
  });
}

function setSvgAttribute(tag, name, value, replace = false) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = new RegExp(`\\s${escapedName}=(["'])[^"']*\\1`, 'i');
  if (existing.test(tag)) {
    return replace ? tag.replace(existing, ` ${name}="${value}"`) : tag;
  }
  return tag.replace(/\s*(\/?>)$/, ` ${name}="${value}"$1`);
}

function classNames(tag) {
  const match = tag.match(/\sclass=(["'])(.*?)\1/i);
  return new Set(match ? match[2].split(/\s+/).filter(Boolean) : []);
}

export function prepareApprovedDrawingSvg(drawingSvg) {
  const stack = [];
  const source = String(drawingSvg || '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  return source.replace(/<[^>]+>/g, (originalTag) => {
    const closing = originalTag.match(/^<\/\s*([a-z][\w:-]*)/i);
    if (closing) {
      const name = closing[1].toLowerCase();
      while (stack.length) {
        if (stack.pop().name === name) break;
      }
      return originalTag;
    }
    const opening = originalTag.match(/^<\s*([a-z][\w:-]*)/i);
    if (!opening || /^<\s*[!?]/.test(originalTag)) return originalTag;

    const name = opening[1].toLowerCase();
    const ownClasses = classNames(originalTag);
    const activeClasses = new Set(ownClasses);
    stack.forEach((entry) => entry.classes.forEach((className) => activeClasses.add(className)));
    let tag = originalTag;
    const set = (attribute, value, replace = false) => {
      tag = setSvgAttribute(tag, attribute, value, replace);
    };

    if (name === 'text') {
      set('font-family', 'Arial, sans-serif');
      set('fill', '#18201e');
    }
    if (name === 'line' && activeClasses.has('mesh')) {
      set('stroke', '#52635c');
      set('stroke-linecap', 'round');
    }
    if (name === 'rect' && activeClasses.has('frame')) {
      set('fill', '#eef1ee');
      set('stroke', '#17201e');
      set('stroke-width', '1.4');
    }
    if (ownClasses.has('dim')) {
      set('stroke', '#30423b');
      set('stroke-width', '1');
      set('fill', 'none');
    }
    if (ownClasses.has('dimtext')) {
      set('font-size', '15', true);
      set('font-weight', 'bold');
    }
    if (ownClasses.has('note')) {
      set('font-size', '11');
      set('fill', '#69736f');
    }
    if (activeClasses.has('cut')) {
      if (name === 'rect') {
        set('fill', '#fff');
        set('stroke', '#ef6840');
        set('stroke-width', '2');
        set('stroke-dasharray', '7 4');
      } else if (name === 'line') {
        set('stroke', '#ef6840');
        set('stroke-width', '1');
      } else if (name === 'text') {
        set('font-size', '10');
        set('fill', '#bd4c2b');
        set('text-anchor', 'middle');
      }
    }
    if (ownClasses.has('title')) {
      set('font-size', '17');
      set('font-weight', 'bold');
    }
    if (ownClasses.has('tiny')) set('font-size', '9');
    if (ownClasses.has('border')) {
      set('fill', 'none');
      set('stroke', '#26332e');
    }
    if (activeClasses.has('side-view')) {
      if (name === 'rect') {
        set('fill', '#eef1ee');
        set('stroke', '#17201e');
        set('stroke-width', '1.4');
      } else if (name === 'circle') {
        set('fill', '#fff');
        set('stroke', '#ef6840');
        set('stroke-width', '2');
      } else if (name === 'path') {
        set('fill', 'none');
        set('stroke', '#59645f');
        set('stroke-width', '.8');
      }
    }
    if (ownClasses.has('side-label')) {
      set('font-size', '10');
      set('font-weight', 'bold');
    }
    if (name === 'text' && activeClasses.has('draggable-dim')) {
      set('font-size', '16', true);
      set('font-weight', 'bold', true);
      // PDFKit paints text strokes over fills and does not implement the
      // browser's paint-order halo consistently, so keep the label legible.
      set('stroke', 'none', true);
    }

    if (!/\/>\s*$/.test(originalTag)) stack.push({ name, classes: ownClasses });
    return tag;
  });
}

function header(doc, title, panel, context) {
  doc.fillColor('#173f36').font('Helvetica-Bold').fontSize(17).text(title, 30, 24);
  doc.fillColor('#5f6e69').font('Helvetica').fontSize(8).text(`${context.customer || 'CUSTOMER'} · Order ${context.order || '—'} · ${panel.partNumber}`, 30, 47);
}

export function createPanelDrawingPdf(panel, context = {}) {
  return pdfBuffer((doc) => {
    doc.addPage({ size: 'LETTER', layout: 'landscape', margin: 0 });
    SVGtoPDF(doc, sandboxPanelDrawingSvg(panel, context), 24, 23, {
      width: 744,
      height: 446.4,
      preserveAspectRatio: 'xMidYMin meet',
      assumePt: true,
    });
  });
}

export function createApprovedPanelDrawingPdf(drawingSvg) {
  const svg = String(drawingSvg || '').trim();
  if (!svg.startsWith('<svg')) throw new Error('The approved drawing snapshot is unavailable.');
  return pdfBuffer((doc) => {
    doc.addPage({ size: 'LETTER', layout: 'landscape', margin: 0 });
    // Reviewed drawings are stored as complete 11 × 8.5 in SVG pages. Map that
    // page directly to Letter instead of adding another margin and rescaling it.
    SVGtoPDF(doc, prepareApprovedDrawingSvg(svg), 0, 0, {
      width: 792,
      height: 612,
      preserveAspectRatio: 'xMidYMid meet',
      assumePt: true,
    });
  });
}

function renderCutlistPages(doc, rows, context, uniquePanels) {
    doc.addPage({ size: 'LETTER', layout: 'landscape', margin: 28 });
    const totalPieces = rows.reduce((sum, row) => sum + row.qty, 0);
    doc.fillColor('#587067').font('Helvetica-Bold').fontSize(8).text('AMGS ENGINEERING', 28, 28, { characterSpacing: 1.2 });
    doc.fillColor('#17201e').font('Times-Roman').fontSize(25).text('Consolidated Cutlist', 28, 43);
    doc.fillColor('#66716c').font('Helvetica').fontSize(10).text(`${context.customer || 'CUSTOMER'} · Job ${context.order || 'JOB'}`, 28, 73);
    doc.fillColor('#173f36').font('Helvetica-Bold').fontSize(15).text(String(uniquePanels), 660, 31, { width: 30, align: 'right' });
    doc.fillColor('#747d79').font('Helvetica').fontSize(8).text('unique panels', 695, 36);
    doc.fillColor('#173f36').font('Helvetica-Bold').fontSize(15).text(String(totalPieces), 660, 52, { width: 30, align: 'right' });
    doc.fillColor('#747d79').font('Helvetica').fontSize(8).text('total cut pieces', 695, 57);
    doc.strokeColor('#173f36').lineWidth(2).moveTo(28, 93).lineTo(764, 93).stroke();
    const widths = [46, 155, 118, 76, 42, 299]; const headings = ['Item', 'Contributing part numbers', 'Material / profile', 'Cut length', 'Qty', 'Operation / note']; let y = 108;
    const tableHeader = () => { let x = 32; doc.fillColor('#59645f').font('Helvetica-Bold').fontSize(6.5); headings.forEach((label, index) => { doc.text(label.toUpperCase(), x, y + 7, { width: widths[index] - 6, characterSpacing: 0.4 }); x += widths[index]; }); doc.strokeColor('#8f9994').lineWidth(0.6).moveTo(28, y + 21).lineTo(764, y + 21).stroke(); y += 22; };
    tableHeader();
    rows.forEach((row) => {
      const height = Math.max(31, doc.heightOfString(row.note, { width: widths[5] - 8 }) + 14);
      if (y + height > 565) { doc.addPage({ size: 'LETTER', layout: 'landscape', margin: 28 }); y = 36; tableHeader(); }
      const values = [row.item, row.partNumber, `${row.material}\n${row.profile}`, `${row.length.toFixed(2)} mm`, String(row.qty), row.note]; let x = 32;
      doc.fillColor('#26312d').font('Helvetica').fontSize(8); values.forEach((value, index) => { doc.font(index === 0 || index === 3 || index === 4 ? 'Helvetica-Bold' : 'Helvetica').fontSize(index === 4 ? 11 : index === 1 ? 6.5 : 8).text(value, x, y + 8, { width: widths[index] - 7, align: index === 4 ? 'center' : 'left' }); x += widths[index]; });
      doc.strokeColor('#d9dcd8').lineWidth(0.5).moveTo(28, y + height).lineTo(764, y + height).stroke(); y += height;
    });
    doc.strokeColor('#aeb5b1').moveTo(28, 558).lineTo(764, 558).stroke();
    doc.fillColor('#69736e').font('Helvetica').fontSize(6.5).text(`Generated ${new Date().toLocaleDateString('en-US')}`, 28, 566);
    doc.text('DIMENSIONS IN MILLIMETRES · VERIFY MANUAL-INPUT FLAGS BEFORE RELEASE', 300, 566, { width: 464, align: 'right' });
}

export function createPanelCutlistPdf(panel, context = {}) {
  return pdfBuffer((doc) => {
    const rows = sandboxPanelCutlist(panel, Math.max(1, Number(context.quantity || 1)));
    renderCutlistPages(doc, rows, context, 1);
  });
}

export function createApprovedPanelCutlistPdf(rows, context = {}) {
  const cleanRows = (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    length: Number(row.length || 0),
    qty: Number(row.qty || 0),
  }));
  if (!cleanRows.length) throw new Error('The approved cutlist snapshot is unavailable.');
  return pdfBuffer((doc) => renderCutlistPages(doc, cleanRows, context, 1));
}

export function createPanelDrawingsPdf(items) {
  return pdfBuffer((doc) => {
    items.forEach(({ panel, context }) => {
      doc.addPage({ size: 'LETTER', layout: 'landscape', margin: 0 });
      SVGtoPDF(doc, sandboxPanelDrawingSvg(panel, context), 24, 23, {
        width: 744,
        height: 446.4,
        preserveAspectRatio: 'xMidYMin meet',
        assumePt: true,
      });
    });
  });
}

export function createPanelConsolidatedCutlistPdf(items, context = {}) {
  return pdfBuffer((doc) => {
    const rows = sandboxConsolidatedCutlist(items.map((item) => ({ panel: item.panel, quantity: Math.max(1, Number(item.context.quantity || 1)) })));
    renderCutlistPages(doc, rows, context, items.length);
  });
}
