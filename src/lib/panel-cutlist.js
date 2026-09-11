import { sandboxPanelCutlist } from "./panel-sandbox-output.js";

const PANEL_PATTERN = /\bCP-(\d{4})-(\d{4})-(\d{4})-([A-Z])-([A-Z])-([A-Z])-([A-Z])-([A-Z])(?:-(\d{4})-(\d{4})-(\d{4})-(\d{4}))?\b/i;

function parsedPanel(value) {
  const match = String(value || "").trim().toUpperCase().match(PANEL_PATTERN);
  if (!match) return null;
  const cut = match.slice(9, 13).map((item) => Number(item || 0));
  return {
    partNumber: match[0], width: Number(match[1]), height: Number(match[2]), sweep: Number(match[3]),
    fitting: match[4], lowerPosition: match[5], removeLower: match[6], removeUpper: match[7], customCutoutCode: match[8],
    cutoutSelected: match[8] === "B" && cut[2] > 0 && cut[3] > 0,
    cutout: { x: cut[0], y: cut[1], width: cut[2], height: cut[3] },
  };
}

function positiveQuantity(value) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 10000 ? quantity : null;
}

export function drawingAssemblyQuantity(svg) {
  const attribute = String(svg || "").match(/\bdata-assembly-quantity=["'](\d+)["']/i);
  if (attribute) return positiveQuantity(attribute[1]);
  const legacy = String(svg || "").match(/>\s*QTY\s*<\/text>\s*<text[^>]*>\s*(\d+)\s*<\/text>/i);
  return legacy ? positiveQuantity(legacy[1]) : null;
}

// Older approvals did not record the assembly quantity separately. When every
// reviewed row still has a generated counterpart, the common row multiplier is
// the quantity at which that cutlist was reviewed. Inconsistent/manual rows are
// deliberately left to the drawing metadata fallback instead of being guessed.
export function inferCutlistQuantity(document, rows) {
  const panel = parsedPanel(document?.partNumber);
  if (!panel || !Array.isArray(rows) || !rows.length) return null;
  const available = sandboxPanelCutlist(panel, 1).map((row) => ({ ...row }));
  const ratios = [];
  for (const row of rows) {
    const matchIndex = available.findIndex((candidate) => candidate.kind === row.kind
      && String(candidate.profile || "") === String(row.profile || "")
      && Math.abs(Number(candidate.length) - Number(row.length)) < 0.01);
    if (matchIndex < 0 || !(Number(available[matchIndex].qty) > 0)) return null;
    ratios.push(Number(row.qty) / Number(available[matchIndex].qty));
    available.splice(matchIndex, 1);
  }
  const first = ratios[0];
  return ratios.every((ratio) => Math.abs(ratio - first) < 1e-8) ? positiveQuantity(first) : null;
}

function scaledQuantity(value, factor) {
  const scaled = Number(value || 0) * factor;
  return Math.abs(scaled - Math.round(scaled)) < 1e-8 ? Math.round(scaled) : Number(scaled.toFixed(4));
}

export function approvedCutlistRows(document) {
  const rows = JSON.parse(document?.cutlistJson || "[]");
  if (!Array.isArray(rows)) throw new Error("The approved cutlist snapshot is invalid.");
  const currentQuantity = positiveQuantity(document?.orderedQty);
  const sourceQuantity = positiveQuantity(document?.cutlistQuantity)
    || inferCutlistQuantity(document, rows)
    || drawingAssemblyQuantity(document?.drawingSvg)
    || currentQuantity
    || 1;
  const targetQuantity = currentQuantity || sourceQuantity;
  const factor = targetQuantity / sourceQuantity;
  return rows.map((row) => {
    const qty = scaledQuantity(row.qty, factor);
    return { ...row, qty, partNumber: `${document.partNumber} ×${qty}` };
  });
}

function profileOrder(profile) {
  const value = String(profile || "");
  return value.startsWith("25.4") ? 0 : value.startsWith("19.05") ? 1 : 2;
}

export function consolidateApprovedRows(documents) {
  const groups = new Map();
  for (const document of documents) {
    for (const row of approvedCutlistRows(document)) {
      const itemKey = row.kind === "stile" ? "" : row.item;
      const key = [row.kind, itemKey, row.material, row.profile, Number(row.length || 0).toFixed(3), row.note].join("|");
      if (!groups.has(key)) groups.set(key, { ...row, qty: 0, parts: new Map(), notes: new Set(), items: new Set() });
      const group = groups.get(key);
      group.qty += Number(row.qty || 0);
      group.parts.set(document.partNumber, (group.parts.get(document.partNumber) || 0) + Number(row.qty || 0));
      group.notes.add(String(row.note || ""));
      group.items.add(String(row.item || ""));
    }
  }
  return [...groups.values()].map((row) => {
    const items = [...row.items].filter(Boolean);
    const stileNames = items.join(" ");
    const item = row.kind === "stile" && (stileNames.includes("Both stiles")
      || (stileNames.includes("Left stile") && stileNames.includes("Right stile")))
      ? "Both stiles" : items.join(" / ") || "Tube";
    return {
      ...row,
      item,
      partNumber: [...row.parts.entries()].map(([part, qty]) => `${part} ×${qty}`).join("; "),
      note: [...row.notes].filter(Boolean).join("; "),
    };
  }).sort((left, right) => profileOrder(left.profile) - profileOrder(right.profile)
    || String(left.profile || "").localeCompare(String(right.profile || ""))
    || Number(left.length || 0) - Number(right.length || 0)
    || String(left.item || "").localeCompare(String(right.item || "")));
}
