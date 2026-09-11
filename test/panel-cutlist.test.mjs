import assert from "node:assert/strict";
import test from "node:test";

import { approvedCutlistRows, consolidateApprovedRows, drawingAssemblyQuantity } from "../src/lib/panel-cutlist.js";
import { sandboxPanelCutlist } from "../src/lib/panel-sandbox-output.js";

const part = "CP-1000-2000-0150-A-S-B-B-A";
const baseRows = [
  { kind: "stile", item: "Both stiles", material: "Mild steel tube", profile: "25.4 × 25.4 sq.", length: 2000, qty: 2, note: "300.0, 313.0, 326.0, 1702.0, 1728.0" },
  { kind: "rail", item: "Top rail / Bottom rail", material: "Mild steel tube", profile: "19.05 × 19.05 sq.", length: 949.2, qty: 2, note: "" },
];

function document(overrides = {}) {
  return { partNumber: part, orderedQty: 1, cutlistJson: JSON.stringify(baseRows), drawingSvg: "", ...overrides };
}

test("reads both current and legacy assembly quantity metadata", () => {
  assert.equal(drawingAssemblyQuantity('<svg data-assembly-quantity="4"></svg>'), 4);
  assert.equal(drawingAssemblyQuantity('<text>QTY</text><text class="value">3</text>'), 3);
});

test("live production generation uses the reviewed dashboard row vocabulary and quantities", () => {
  const panel = {
    partNumber: part, width: 1000, height: 2000, sweep: 150, fitting: "A", lowerPosition: "S",
    removeLower: "B", removeUpper: "B", customCutoutCode: "A", cutoutSelected: false,
    cutout: { x: 0, y: 0, width: 0, height: 0 },
  };
  const rows = sandboxPanelCutlist(panel, 3);
  assert.deepEqual(rows.map((row) => row.item), ["Both stiles", "Top rail / Bottom rail"]);
  assert.deepEqual(rows.map((row) => row.qty), [6, 6]);
  assert.match(rows[0].note, /313\.0 Ø9/);
  assert.equal(rows[1].note, "");
});

test("rescales an approved snapshot when the live order quantity changes", () => {
  const rows = approvedCutlistRows(document({ cutlistQuantity: 1, orderedQty: 3 }));
  assert.deepEqual(rows.map((row) => row.qty), [6, 6]);
  assert.ok(rows.every((row) => row.partNumber.endsWith("×6")));
});

test("repairs legacy restored cutlists whose drawing quantity was newer than their rows", () => {
  const rows = approvedCutlistRows(document({
    orderedQty: 4,
    drawingSvg: '<text>QTY</text><text class="value">4</text>',
  }));
  assert.deepEqual(rows.map((row) => row.qty), [8, 8]);
});

test("keeps distinct fabrication items separate and accounts for duplicate panel lines exactly", () => {
  const railRows = [
    { kind: "rail", item: "Top rail", material: "Steel", profile: "19.05 × 19.05 sq.", length: 900, qty: 1, note: "" },
    { kind: "rail", item: "Bottom rail", material: "Steel", profile: "19.05 × 19.05 sq.", length: 900, qty: 1, note: "" },
  ];
  const rows = consolidateApprovedRows([
    document({ orderedQty: 1, cutlistQuantity: 1, cutlistJson: JSON.stringify(railRows) }),
    document({ orderedQty: 2, cutlistQuantity: 1, cutlistJson: JSON.stringify(railRows) }),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.qty), [3, 3]);
  assert.ok(rows.every((row) => row.partNumber === `${part} ×3`));
  assert.deepEqual(rows.map((row) => row.item).sort(), ["Bottom rail", "Top rail"]);
});

test("lists every exact contributing panel instead of using substring matches", () => {
  const similarPart = `${part}-0000-0100-0200-0300`;
  const [row] = consolidateApprovedRows([
    document(),
    document({ partNumber: similarPart }),
  ]);
  assert.match(row.partNumber, new RegExp(part.replaceAll("-", "\\-")));
  assert.match(row.partNumber, new RegExp(similarPart.replaceAll("-", "\\-")));
});
