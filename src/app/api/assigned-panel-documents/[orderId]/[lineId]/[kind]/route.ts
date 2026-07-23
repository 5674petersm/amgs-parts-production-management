import { NextResponse } from "next/server";

import { createApprovedPanelCutlistPdf, createApprovedPanelDrawingPdf } from "@/lib/panel-documents";
import { getPanelDocumentAssignments, getUploadedPanelDocument } from "@/lib/shop-floor-orders";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ orderId: string; lineId: string; kind: string }> };

function safeName(value: string) {
  return value.replace(/[\r\n"]/g, "_");
}

export async function GET(request: Request, context: RouteContext) {
  const { orderId, lineId, kind: rawKind } = await context.params;
  const kind = rawKind === "cutlist" ? "cutlist" : "drawing";
  try {
    const documents = await getPanelDocumentAssignments(orderId, true);
    const document = documents.find((item) => item.orderLineId === lineId);
    if (!document) return NextResponse.json({ error: "Approved panel documents were not found." }, { status: 404 });
    let bytes: Buffer | ArrayBuffer;
    let fileName: string;
    if (document[`${kind}Mode`] === "uploaded") {
      const uploaded = await getUploadedPanelDocument(orderId, lineId, kind);
      bytes = uploaded.bytes;
      fileName = document[kind === "drawing" ? "drawingOriginalName" : "cutlistOriginalName"] || `${document.partNumber}-${kind}.pdf`;
    } else if (kind === "drawing") {
      bytes = await createApprovedPanelDrawingPdf(document.drawingSvg);
      fileName = `${document.partNumber}-approved-drawing.pdf`;
    } else {
      bytes = await createApprovedPanelCutlistPdf(JSON.parse(document.cutlistJson || "[]"), { customer: document.customer, order: document.orderNumber });
      fileName = `${document.partNumber}-approved-cutlist.pdf`;
    }
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName(fileName)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("GET approved panel document", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the approved panel document." }, { status: 500 });
  }
}
