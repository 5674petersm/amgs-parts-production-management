// This module is a server-safe extraction of the fabrication rules and drawing
// markup in /srv/amgs/sandbox/public/app.js. Keep the output logic identical so
// a CP code has one shop-floor interpretation in both applications.
const RULES = { stile: 25.4, rail: 19.05, wire: 3, meshX: 20, meshY: 100, endRailCenter: 12.7, midrailStandard: 733.65, midrailLower: 433.65, cutoutReuse: 200 };
const escapeXml = (value) => String(value).replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);

function clippedCutout(panel) {
  const left = Math.max(0, Math.min(panel.width, panel.cutout.x)); const top = Math.max(0, Math.min(panel.height, panel.cutout.y));
  const right = Math.max(left, Math.min(panel.width, panel.cutout.x + panel.cutout.width)); const bottom = Math.max(top, Math.min(panel.height, panel.cutout.y + panel.cutout.height));
  return { x: left, y: top, width: right - left, height: bottom - top, right, bottom, leftOpen: left === 0, rightOpen: right === panel.width, topOpen: top === 0, bottomOpen: bottom === panel.height };
}

function supportRails(panel) {
  const halfRail = RULES.rail / 2; const spacing = panel.lowerPosition === 'L' ? RULES.midrailLower : RULES.midrailStandard;
  const topY = RULES.endRailCenter - halfRail; const bottomY = panel.height - RULES.endRailCenter - halfRail;
  const rails = [{ y: topY, center: RULES.endRailCenter, name: 'Top rail', source: 'end' }]; const mids = [];
  const upperCenter = RULES.endRailCenter + spacing; const lowerCenter = panel.height - RULES.endRailCenter - spacing;
  if (panel.removeUpper === 'A' && upperCenter > RULES.endRailCenter + RULES.rail && upperCenter < panel.height - RULES.endRailCenter - RULES.rail) mids.push({ y: upperCenter - halfRail, center: upperCenter, name: 'Upper mid-rail', source: 'upper' });
  if (panel.removeLower === 'A' && lowerCenter > RULES.endRailCenter + RULES.rail && lowerCenter < panel.height - RULES.endRailCenter - RULES.rail) mids.push({ y: lowerCenter - halfRail, center: lowerCenter, name: 'Lower mid-rail', source: 'lower' });
  if (panel.cutoutSelected) {
    const cut = clippedCutout(panel); const targets = [];
    if (!cut.topOpen && cut.width > 0 && cut.height > 0) targets.push({ y: cut.y - RULES.rail, center: cut.y - halfRail, edge: 'top' });
    if (!cut.bottomOpen && cut.width > 0 && cut.height > 0) targets.push({ y: cut.bottom, center: cut.bottom + halfRail, edge: 'bottom' });
    const used = new Set();
    targets.forEach((target) => {
      let best = -1; let bestDistance = Infinity;
      mids.forEach((mid, index) => { const distance = Math.abs(mid.center - target.center); if (!used.has(index) && distance < bestDistance) { best = index; bestDistance = distance; } });
      if (best >= 0 && bestDistance <= RULES.cutoutReuse) { used.add(best); rails.push({ ...target, name: `${mids[best].name} · relocated to cutout ${target.edge}`, source: mids[best].source, relocated: true, moveDistance: bestDistance }); }
      else rails.push({ ...target, name: `Added cutout ${target.edge} rail`, source: 'added', relocated: false });
    });
    mids.forEach((mid, index) => { if (!used.has(index)) rails.push(mid); });
  } else rails.push(...mids);
  rails.push({ y: bottomY, center: panel.height - RULES.endRailCenter, name: 'Bottom rail', source: 'end' });
  return rails.sort((a, b) => a.y - b.y);
}

function cutoutVerticals(panel) {
  if (!panel.cutoutSelected) return [];
  const cut = clippedCutout(panel); const verticals = [];
  if (!cut.leftOpen && cut.x > RULES.stile) verticals.push({ x: cut.x - RULES.rail, y: cut.y, length: cut.height, name: 'Cutout left vertical', edge: 'left' });
  if (!cut.rightOpen && cut.right < panel.width - RULES.stile) verticals.push({ x: cut.right, y: cut.y, length: cut.height, name: 'Cutout right vertical', edge: 'right' });
  return verticals;
}

function horizontalRailPieces(panel) {
  const rails = supportRails(panel); const start = RULES.stile; const end = panel.width - RULES.stile;
  if (!panel.cutoutSelected) return rails.map((rail) => ({ ...rail, x: start, length: end - start, segment: 'full', split: false }));
  const cut = clippedCutout(panel); const verticals = cutoutVerticals(panel); const leftVertical = verticals.find((item) => item.edge === 'left'); const rightVertical = verticals.find((item) => item.edge === 'right');
  return rails.flatMap((rail) => {
    const intersects = !rail.edge && rail.y < cut.bottom && rail.y + RULES.rail > cut.y;
    if (!intersects) return [{ ...rail, x: start, length: end - start, segment: 'full', split: false }];
    const pieces = []; const leftEnd = Math.min(end, leftVertical ? leftVertical.x : cut.x); const rightStart = Math.max(start, rightVertical ? rightVertical.x + RULES.rail : cut.right);
    if (leftEnd > start) pieces.push({ ...rail, x: start, length: leftEnd - start, segment: 'left', split: true });
    if (rightStart < end) pieces.push({ ...rail, x: rightStart, length: end - rightStart, segment: 'right', split: true });
    return pieces;
  });
}

function stilePieces(panel) {
  const pieces = [];
  ['left', 'right'].forEach((side) => {
    const cut = panel.cutoutSelected ? clippedCutout(panel) : null; const open = cut && (side === 'left' ? cut.leftOpen : cut.rightOpen) && cut.height > 0;
    if (!open) pieces.push({ side, y: 0, length: panel.height });
    else { if (cut.y > 0) pieces.push({ side, y: 0, length: cut.y }); if (cut.bottom < panel.height) pieces.push({ side, y: cut.bottom, length: panel.height - cut.bottom }); }
  });
  return pieces;
}

function tapLocations(panel) {
  const top = panel.fitting === 'A' ? 300 : 100; const bottom = panel.height - (panel.fitting === 'A' ? 298 : 98);
  const candidates = [top, top + 13, top + 26, bottom, bottom + 26];
  return candidates.filter((y, index) => y >= 0 && y <= panel.height && candidates.findIndex((other) => Math.abs(other - y) < 0.01) === index);
}

function fittingConflicts(panel) {
  const conflicts = { left: [], right: [] }; if (!panel.cutoutSelected) return conflicts;
  const cut = clippedCutout(panel); const taps = tapLocations(panel);
  if (cut.leftOpen) conflicts.left = taps.filter((y) => y >= cut.y && y <= cut.bottom);
  if (cut.rightOpen) conflicts.right = taps.filter((y) => y >= cut.y && y <= cut.bottom);
  return conflicts;
}

function segmentTapLocations(panel, piece) {
  const end = piece.y + piece.length;
  return tapLocations(panel).filter((y) => y >= piece.y && (y < end || end === panel.height)).map((y) => y - piece.y);
}

function cutlist(panel) {
  const railPieces = horizontalRailPieces(panel); const verticals = cutoutVerticals(panel); const rows = []; const pieces = stilePieces(panel); const conflicts = fittingConflicts(panel); const stileGroups = new Map();
  pieces.forEach((piece) => { const localTaps = segmentTapLocations(panel, piece); const manual = conflicts[piece.side].length > 0; const note = `${localTaps.length ? `Drill/tap local Y ${localTaps.map((y) => y.toFixed(1)).join(', ')}` : 'No drilling'}${manual ? ' · MANUAL FITTING INPUT REQUIRED' : ''}`; const key = `${piece.length.toFixed(3)}|${note}`; const existing = stileGroups.get(key); if (existing) { existing.qty += 1; existing.sides.push(piece.side); } else stileGroups.set(key, { kind: 'stile', item: 'ST', material: 'Mild steel tube', profile: '25.4 × 25.4 sq.', length: piece.length, qty: 1, operationKey: note, note, sides: [piece.side] }); });
  [...stileGroups.values()].forEach((row, index) => rows.push({ ...row, item: `ST-${String(index + 1).padStart(2, '0')}`, note: `${[...new Set(row.sides)].join(' + ')} stile${row.qty > 1 ? 's' : ''} · ${row.note}` }));
  const railGroups = new Map(); railPieces.forEach((piece) => { const key = piece.length.toFixed(3); const description = `${piece.name}${piece.segment === 'full' ? '' : ` · ${piece.segment} segment`}`; if (!railGroups.has(key)) railGroups.set(key, { kind: 'rail', item: 'RL', material: 'Mild steel tube', profile: '19.05 × 19.05 sq.', length: piece.length, qty: 0, descriptions: new Set() }); const group = railGroups.get(key); group.qty += 1; group.descriptions.add(description); });
  [...railGroups.values()].forEach((row, index) => rows.push({ ...row, item: `RL-${String(index + 1).padStart(2, '0')}`, note: `Horizontal rail${row.qty > 1 ? 's' : ''} · ${[...row.descriptions].join('; ')}` }));
  if (verticals.length) rows.push({ kind: 'cutout-vertical', item: 'CV-01', material: 'Mild steel tube', profile: '19.05 × 19.05 sq.', length: verticals[0].length, qty: verticals.length, note: `${verticals.map((item) => item.edge).join(' + ')} cutout vertical${verticals.length > 1 ? 's' : ''} · fit between horizontal rails` });
  return rows;
}

export function sandboxPanelCutlist(panel, quantity) {
  return cutlist(panel).map((row) => ({ ...row, partNumber: `${panel.partNumber} ×${row.qty * quantity}`, qty: row.qty * quantity, note: row.kind === 'rail' ? 'Horizontal rails · consolidated job quantity' : row.note }));
}

export function sandboxConsolidatedCutlist(items) {
  const groups = new Map();
  items.forEach(({ panel, quantity }) => cutlist(panel).forEach((row) => {
    const noteKey = row.kind === 'stile' ? (row.operationKey || row.note) : '';
    const key = [row.kind, row.material, row.profile, row.length, noteKey].join('|');
    const itemQuantity = row.qty * quantity;
    if (!groups.has(key)) groups.set(key, { ...row, qty: 0, parts: new Map(), notes: new Set() });
    const group = groups.get(key); group.qty += itemQuantity; group.parts.set(panel.partNumber, (group.parts.get(panel.partNumber) || 0) + itemQuantity); group.notes.add(row.note);
  }));
  return [...groups.values()].map((row, index) => ({
    ...row,
    item: `${row.kind === 'stile' ? 'ST' : row.kind === 'rail' ? 'RL' : 'CV'}-${String(index + 1).padStart(2, '0')}`,
    partNumber: [...row.parts.entries()].map(([part, quantity]) => `${part} ×${quantity}`).join('; '),
    note: row.kind === 'rail' ? 'Horizontal rails · consolidated job quantity' : row.kind === 'stile' ? row.note : [...row.notes].join('; '),
  }));
}

function segmentedSideViewSvg(panel) {
  const pieces = stilePieces(panel); if (pieces.length <= 2) return '';
  const conflicts = fittingConflicts(panel); const columns = { left: 718, right: 824 }; let content = '<rect x="700" y="82" width="218" height="382" fill="#fff" stroke="#d7dad5"/>';
  ['left', 'right'].forEach((side) => {
    const sidePieces = pieces.filter((piece) => piece.side === side); const column = columns[side]; const available = 292; const gap = sidePieces.length > 1 ? 24 : 0; const total = sidePieces.reduce((sum, piece) => sum + piece.length, 0); const usable = available - gap * (sidePieces.length - 1); const heights = sidePieces.length === 2 ? (() => { const first = Math.max(60, Math.min(usable - 60, usable * (sidePieces[0].length / total))); return [first, usable - first]; })() : [usable];
    content += `<text x="${column - 8}" y="103" class="title" style="font-size:12px">${side.toUpperCase()} STILE</text><text x="${column - 8}" y="117" class="tiny">${sidePieces.length} SEGMENT${sidePieces.length === 1 ? '' : 'S'} · LOCAL DATUMS</text>`;
    if (conflicts[side].length) content += `<text x="${column - 8}" y="132" fill="#b52d20" style="font-size:8px;font-weight:bold">MANUAL FITTING INPUT</text>`;
    let currentY = conflicts[side].length ? 148 : 136;
    sidePieces.forEach((piece, index) => { const segmentH = heights[index]; const localTaps = segmentTapLocations(panel, piece); const labelYs = localTaps.map((tap) => currentY + (tap / piece.length) * segmentH); for (let i = 1; i < labelYs.length; i += 1) labelYs[i] = Math.max(labelYs[i], labelYs[i - 1] + 14); content += `<g class="segment-view"><text x="${column - 8}" y="${currentY - 5}" class="tiny" style="font-weight:bold">SEG ${index + 1} · ${piece.length.toFixed(1)} mm</text><rect x="${column}" y="${currentY}" width="11" height="${segmentH}"/><text x="${column + 17}" y="${currentY + 4}" class="side-label">0.0</text>${localTaps.map((tap, tapIndex) => `<circle cx="${column + 5.5}" cy="${currentY + (tap / piece.length) * segmentH}" r="3"/><path d="M${column + 9},${currentY + (tap / piece.length) * segmentH} L${column + 16},${labelYs[tapIndex]}"/><text x="${column + 19}" y="${labelYs[tapIndex] + 4}" class="side-label">${tap.toFixed(1)}</text>`).join('')}<text x="${column + 17}" y="${currentY + segmentH + 4}" class="side-label">${piece.length.toFixed(1)}</text></g>`; currentY += segmentH + gap; });
  });
  return content;
}

export function sandboxPanelDrawingSvg(sourcePanel, context) {
  let p = { ...sourcePanel, quantity: Math.max(1, Number(context.quantity || 1)) };
  if (p.cutoutSelected) { const cut = clippedCutout(p); p = { ...p, cutout: cut, cutoutSelected: cut.width > 0 && cut.height > 0 }; }
  const W = 1100; const H = 660; const left = 115; const top = 130; const maxW = 570; const maxH = 320; const scale = Math.min(maxW / p.width, maxH / p.height); const w = p.width * scale; const h = p.height * scale; const x = left + (maxW - w) / 2; const y = top + (maxH - h) / 2;
  const sx = (value) => x + value * scale; const sy = (value) => y + value * scale; const railPieces = horizontalRailPieces(p); const taps = tapLocations(p); const innerLeft = sx(RULES.stile); const innerRight = sx(p.width - RULES.stile);
  const drawingTitle = escapeXml(`${String(context.customer || 'CUSTOMER').trim()} ${String(context.order || 'JOB').trim()}`.trim()); let mesh = '';
  for (let px = RULES.stile; px <= p.width - RULES.stile; px += RULES.meshX) { const inCut = p.cutoutSelected && px >= p.cutout.x && px <= p.cutout.x + p.cutout.width; if (inCut) mesh += `<line x1="${sx(px)}" y1="${y}" x2="${sx(px)}" y2="${sy(p.cutout.y)}"/><line x1="${sx(px)}" y1="${sy(p.cutout.y + p.cutout.height)}" x2="${sx(px)}" y2="${y + h}"/>`; else mesh += `<line x1="${sx(px)}" y1="${y}" x2="${sx(px)}" y2="${y + h}"/>`; }
  for (let py = 0; py <= p.height; py += RULES.meshY) { if (p.cutoutSelected && py >= p.cutout.y && py <= p.cutout.y + p.cutout.height) mesh += `<line x1="${x}" y1="${sy(py)}" x2="${sx(p.cutout.x)}" y2="${sy(py)}"/><line x1="${sx(p.cutout.x + p.cutout.width)}" y1="${sy(py)}" x2="${x + w}" y2="${sy(py)}"/>`; else mesh += `<line x1="${x}" y1="${sy(py)}" x2="${x + w}" y2="${sy(py)}"/>`; }
  let railSvg = railPieces.map((piece) => `<rect x="${sx(piece.x)}" y="${sy(piece.y)}" width="${piece.length * scale}" height="${Math.max(4, RULES.rail * scale)}"/>`).join('');
  railSvg += railPieces.filter((piece) => piece.split).map((piece, index) => { const x1 = sx(piece.x); const x2 = sx(piece.x + piece.length); const dy = piece.segment === 'left' ? -10 : 10; const yy = sy(piece.y + RULES.rail / 2) + dy; return `<g class="rail-piece-dim"><line x1="${x1}" y1="${yy}" x2="${x2}" y2="${yy}" stroke="#30423b"/><path d="M${x1},${yy} l7,-3 v6z M${x2},${yy} l-7,-3 v6z" fill="#30423b"/><text x="${(x1 + x2) / 2}" y="${yy - 5}" text-anchor="middle" fill="#18201e" font-size="16" font-weight="bold">${piece.length.toFixed(2)} mm</text></g>`; }).join('');
  railSvg += cutoutVerticals(p).map((vertical) => `<rect x="${sx(vertical.x)}" y="${sy(vertical.y)}" width="${Math.max(4, RULES.rail * scale)}" height="${vertical.length * scale}"/>`).join('');
  const cutDims = p.cutoutSelected ? `<g class="cut"><rect x="${sx(p.cutout.x)}" y="${sy(p.cutout.y)}" width="${p.cutout.width * scale}" height="${p.cutout.height * scale}"/><line x1="${sx(p.cutout.x)}" y1="${sy(p.cutout.y + p.cutout.height) + 20}" x2="${sx(p.cutout.x + p.cutout.width)}" y2="${sy(p.cutout.y + p.cutout.height) + 20}"/><text x="${sx(p.cutout.x + p.cutout.width / 2)}" y="${sy(p.cutout.y + p.cutout.height) + 35}">${p.cutout.width}.0</text><line x1="${sx(p.cutout.x) - 20}" y1="${sy(p.cutout.y)}" x2="${sx(p.cutout.x) - 20}" y2="${sy(p.cutout.y + p.cutout.height)}"/><text x="${sx(p.cutout.x) - 30}" y="${sy(p.cutout.y + p.cutout.height / 2)}" transform="rotate(-90 ${sx(p.cutout.x) - 30} ${sy(p.cutout.y + p.cutout.height / 2)})">${p.cutout.height}.0</text></g>` : '';
  if (p.cutoutSelected) {
    const verticalEdges = new Set(cutoutVerticals(p).map((item) => item.edge)); const horizontalEdges = new Set(supportRails(p).filter((item) => item.edge).map((item) => item.edge));
    const leftTubeX = p.cutout.x - RULES.rail; const rightTubeOuterX = p.cutout.x + p.cutout.width + RULES.rail; const topTubeY = p.cutout.y - RULES.rail; const bottomTubeY = p.cutout.y + p.cutout.height; const leftDatumX = RULES.stile; const rightDatumX = p.width - RULES.stile;
    const lx = sx(leftTubeX); const leftDatum = sx(leftDatumX); const rightDatum = sx(rightDatumX); const rightTubeOuter = sx(rightTubeOuterX); const ty = sy(topTubeY); const by = sy(bottomTubeY); const hd1 = Math.min(535, y + h + 28); const hd2 = Math.min(563, y + h + 52); const vd1 = x - 12; const vd2 = x - 46;
    if (verticalEdges.has('left')) railSvg += `<g fill="none" stroke="#30423b"><line x1="${leftDatum}" y1="${y + h}" x2="${leftDatum}" y2="${hd1 + 5}"/><line x1="${lx}" y1="${sy(p.cutout.y)}" x2="${lx}" y2="${hd1 + 5}"/><line x1="${leftDatum}" y1="${hd1}" x2="${lx}" y2="${hd1}"/><path d="M${leftDatum},${hd1} l8,-3 v6z M${lx},${hd1} l-8,-3 v6z" fill="#30423b"/><text x="${(leftDatum + lx) / 2}" y="${hd1 - 6}" text-anchor="middle" stroke="none" font-size="16" font-weight="bold">${(leftTubeX - leftDatumX).toFixed(2)} mm</text></g>`;
    if (verticalEdges.has('right')) railSvg += `<g fill="none" stroke="#30423b"><line x1="${rightTubeOuter}" y1="${sy(p.cutout.y)}" x2="${rightTubeOuter}" y2="${hd2 + 5}"/><line x1="${rightDatum}" y1="${y + h}" x2="${rightDatum}" y2="${hd2 + 5}"/><line x1="${rightTubeOuter}" y1="${hd2}" x2="${rightDatum}" y2="${hd2}"/><path d="M${rightTubeOuter},${hd2} l8,-3 v6z M${rightDatum},${hd2} l-8,-3 v6z" fill="#30423b"/><text x="${(rightTubeOuter + rightDatum) / 2}" y="${hd2 - 6}" text-anchor="middle" stroke="none" font-size="16" font-weight="bold">${(rightDatumX - rightTubeOuterX).toFixed(2)} mm</text></g>`;
    if (horizontalEdges.has('top')) railSvg += `<g fill="none" stroke="#30423b"><line x1="${x}" y1="${y}" x2="${vd1 - 5}" y2="${y}"/><line x1="${sx(p.cutout.x)}" y1="${ty}" x2="${vd1 - 5}" y2="${ty}"/><line x1="${vd1}" y1="${y}" x2="${vd1}" y2="${ty}"/><path d="M${vd1},${y} l-3,8 h6z M${vd1},${ty} l-3,-8 h6z" fill="#30423b"/><text x="${vd1 - 7}" y="${(y + ty) / 2}" transform="rotate(-90 ${vd1 - 7} ${(y + ty) / 2})" text-anchor="middle" stroke="none" font-size="16" font-weight="bold">${topTubeY.toFixed(2)} mm</text></g>`;
    if (horizontalEdges.has('bottom')) railSvg += `<g fill="none" stroke="#30423b"><line x1="${x}" y1="${y}" x2="${vd2 - 5}" y2="${y}"/><line x1="${sx(p.cutout.x)}" y1="${by}" x2="${vd2 - 5}" y2="${by}"/><line x1="${vd2}" y1="${y}" x2="${vd2}" y2="${by}"/><path d="M${vd2},${y} l-3,8 h6z M${vd2},${by} l-3,-8 h6z" fill="#30423b"/><text x="${vd2 - 7}" y="${(y + by) / 2}" transform="rotate(-90 ${vd2 - 7} ${(y + by) / 2})" text-anchor="middle" stroke="none" font-size="16" font-weight="bold">${bottomTubeY.toFixed(2)} mm</text></g>`;
  }
  const sideX = 780; const labelX = 842; const labelYs = taps.map((tap) => sy(tap)); for (let i = 1; i < labelYs.length; i += 1) labelYs[i] = Math.max(labelYs[i], labelYs[i - 1] + 16); if (labelYs.at(-1) > y + h) { const shift = labelYs.at(-1) - (y + h); for (let i = 0; i < labelYs.length; i += 1) labelYs[i] -= shift; } if (labelYs[0] < y) { const shift = y - labelYs[0]; for (let i = 0; i < labelYs.length; i += 1) labelYs[i] += shift; }
  const segmentedViews = segmentedSideViewSvg(p); const sideHoles = segmentedViews || taps.map((tap, index) => `<circle cx="${sideX + 7}" cy="${sy(tap)}" r="3.5"/><path d="M${sideX + 11},${sy(tap)} L${labelX - 8},${labelYs[index]}"/><text x="${labelX}" y="${labelYs[index] + 4}" class="side-label">${tap.toFixed(1)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:Arial,sans-serif;fill:#18201e}.mesh line{stroke:#67726d;stroke-width:.65}.frame rect{fill:#fff;stroke:#17201e;stroke-width:3}.dim{stroke:#30423b;stroke-width:1;fill:none}.dimtext{font-size:16px;font-weight:bold}.note{font-size:11px;fill:#69736f}.cut rect{fill:#fff;stroke:#ef6840;stroke-width:2;stroke-dasharray:7 4}.cut line{stroke:#ef6840;stroke-width:1}.cut text{font-size:10px;fill:#bd4c2b;text-anchor:middle}.title{font-size:17px;font-weight:bold}.tiny{font-size:9px}.border{fill:none;stroke:#26332e}.side-view rect{fill:#fff;stroke:#17201e;stroke-width:2}.side-view circle{fill:#fff;stroke:#ef6840;stroke-width:2}.side-view path{fill:none;stroke:#59645f;stroke-width:.8}.side-label{font-size:10px;font-weight:bold}</style><rect x="20" y="20" width="1060" height="620" class="border"/><text x="48" y="53" class="title">${drawingTitle}</text><g class="mesh">${mesh}</g><g class="frame"><rect x="${x}" y="${y}" width="${RULES.stile * scale}" height="${h}"/>${railSvg}<rect x="${x + w - RULES.stile * scale}" y="${y}" width="${RULES.stile * scale}" height="${h}"/></g>${cutDims}<g class="dim"><line x1="${innerLeft}" y1="${y - 35}" x2="${innerRight}" y2="${y - 35}"/><line x1="${innerLeft}" y1="${y - 45}" x2="${innerLeft}" y2="${y - 5}"/><line x1="${innerRight}" y1="${y - 45}" x2="${innerRight}" y2="${y - 5}"/><path d="M${innerLeft},${y - 35} l10,-4 v8z M${innerRight},${y - 35} l-10,-4 v8z" fill="#30423b"/><text x="${(innerLeft + innerRight) / 2}" y="${y - 45}" text-anchor="middle" class="dimtext">${(p.width - 50.8).toFixed(1)} mm</text><line x1="${x - 88}" y1="${y}" x2="${x - 88}" y2="${y + h}"/><line x1="${x - 98}" y1="${y}" x2="${x - 5}" y2="${y}"/><line x1="${x - 98}" y1="${y + h}" x2="${x - 5}" y2="${y + h}"/><path d="M${x - 88},${y} l-4,10 h8z M${x - 88},${y + h} l-4,-10 h8z" fill="#30423b"/><text x="${x - 103}" y="${y + h / 2}" transform="rotate(-90 ${x - 103} ${y + h / 2})" text-anchor="middle" class="dimtext">${p.height}.0 mm</text></g><g class="side-view"><text x="${sideX - 20}" y="${y - 22}" class="title">SIDE VIEW</text><text x="${sideX - 20}" y="${y - 7}" class="note">DRILL &amp; TAP · BOTH STILES</text><rect x="${sideX}" y="${y}" width="14" height="${h}"/>${sideHoles}</g><g transform="translate(735 480)"><rect width="345" height="160" class="border"/><line x1="0" y1="53" x2="345" y2="53" class="border"/><line x1="0" y1="102" x2="345" y2="102" class="border"/><text x="15" y="20" class="tiny">CUSTOMER / JOB</text><text x="15" y="42" class="title">${drawingTitle}</text><text x="15" y="72" class="tiny">PART NUMBER</text><text x="15" y="92" style="font-size:12px;font-weight:bold">${p.partNumber}</text><text x="15" y="122" class="tiny">QTY</text><text x="15" y="146" style="font-size:22px;font-weight:bold">${p.quantity}</text></g></svg>`;
}
