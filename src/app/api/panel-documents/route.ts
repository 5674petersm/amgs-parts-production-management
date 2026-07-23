import { NextResponse } from "next/server";

import { createPanelCutlistPdf, createPanelDrawingPdf, parsePanelPartNumber } from "@/lib/panel-documents";

export const dynamic = "force-dynamic";

function safeValue(value: string | null, maximum: number) {
  return String(value || "").replace(/[\r\n]/g, " ").trim().slice(0, maximum);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  try {
    const panel = parsePanelPartNumber(safeValue(query.get("partNumber"), 100));
    const type = query.get("type") === "cutlist" ? "cutlist" : "drawing";
    const context = {
      customer: safeValue(query.get("customer"), 100),
      order: safeValue(query.get("order"), 30),
      quantity: Math.max(1, Math.min(10000, Number(query.get("quantity") || 1))),
    };
    const pdf = type === "cutlist" ? await createPanelCutlistPdf(panel, context) : await createPanelDrawingPdf(panel, context);
    const fileName = `${panel.partNumber}-${type}.pdf`;
    const disposition = query.get("download") === "1" ? "attachment" : "inline";
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("GET /api/panel-documents", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate panel documents." }, { status: 400 });
  }
}
