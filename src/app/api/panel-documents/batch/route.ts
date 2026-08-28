import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

import { createApprovedPanelCutlistPdf, createApprovedPanelDrawingPdf } from "@/lib/panel-documents";
import { getPanelDocumentAssignments, getUploadedPanelDocument } from "@/lib/shop-floor-orders";
import type { ShopFloorPanelDocument } from "@/types/shop-floor-order";

export const dynamic = "force-dynamic";
type BatchItem = { order?: unknown; lineId?: unknown };

async function mergePdfs(pdfs: Array<Buffer | ArrayBuffer>) {
  const output = await PDFDocument.create();
  for (const input of pdfs) {
    const source = await PDFDocument.load(input);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  return Buffer.from(await output.save());
}

function consolidateApprovedRows(documents: ShopFloorPanelDocument[]) {
  const grouped = new Map<string, Record<string, unknown> & { qty: number; partNumber: string }>();
  for (const document of documents) {
    const rows = JSON.parse(document.cutlistJson || "[]") as Array<Record<string, unknown>>;
    for (const row of rows) {
      const key = [row.material, row.profile, Number(row.length || 0).toFixed(3), row.note].join("|");
      const existing = grouped.get(key);
      if (existing) {
        existing.qty += Number(row.qty || 0);
        if (!existing.partNumber.includes(document.partNumber)) existing.partNumber += `, ${document.partNumber}`;
      } else {
        grouped.set(key, { ...row, qty: Number(row.qty || 0), partNumber: document.partNumber });
      }
    }
  }
  return [...grouped.values()].map((row, index) => ({ ...row, item: `P-${String(index + 1).padStart(2, "0")}` }));
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { type?: unknown; items?: BatchItem[] };
    if (!Array.isArray(body.items) || !body.items.length) return NextResponse.json({ error: "Select at least one panel." }, { status: 400 });
    if (body.items.length > 500) return NextResponse.json({ error: "A batch is limited to 500 selected panels." }, { status: 400 });
    const wanted = body.items.map((item) => ({ order: String(item.order || "").trim(), lineId: String(item.lineId || "").trim() }));
    const byOrder = new Map<string, ShopFloorPanelDocument[]>();
    await Promise.all([...new Set(wanted.map((item) => item.order))].map(async (order) => byOrder.set(order, await getPanelDocumentAssignments(order, true))));
    const documents = wanted.map((item) => byOrder.get(item.order)?.find((document) => document.orderLineId === item.lineId))
      .filter((document): document is ShopFloorPanelDocument => Boolean(document));
    if (documents.length !== wanted.length) throw new Error("One or more selected panels are no longer assigned by engineering.");

    const isCutlist = body.type === "cutlist";
    const pdfs: Array<Buffer | ArrayBuffer> = [];
    if (isCutlist) {
      const generated = documents.filter((document) => document.cutlistMode === "generated");
      if (generated.length) {
        const orders = [...new Set(generated.map((document) => document.orderNumber))];
        pdfs.push(await createApprovedPanelCutlistPdf(consolidateApprovedRows(generated), { customer: `${orders.length} selected order${orders.length === 1 ? "" : "s"}`, order: orders.join(", ") }));
      }
      for (const document of documents.filter((item) => item.cutlistMode === "uploaded")) {
        pdfs.push((await getUploadedPanelDocument(document.orderNumber, document.orderLineId, "cutlist")).bytes);
      }
    } else {
      for (const document of documents) {
        pdfs.push(document.drawingMode === "uploaded"
          ? (await getUploadedPanelDocument(document.orderNumber, document.orderLineId, "drawing")).bytes
          : await createApprovedPanelDrawingPdf(document.drawingSvg));
      }
    }
    if (!pdfs.length) {
      return NextResponse.json({ error: isCutlist ? "None of the selected panels require a cutlist." : "No panel drawings were found." }, { status: 400 });
    }
    const pdf = await mergePdfs(pdfs);
    const fileName = isCutlist ? "selected-panels-consolidated-cutlist.pdf" : "selected-panels-approved-drawings.pdf";
    return new Response(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("POST /api/panel-documents/batch", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to combine selected panel documents." }, { status: 400 });
  }
}
