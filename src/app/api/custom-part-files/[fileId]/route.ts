import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { downloadCustomPartFile } from "@/lib/google-drive";

type RouteContext = { params: Promise<{ fileId: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  try {
    const file = await downloadCustomPartFile(fileId);
    const safeName = file.name.replace(/[\r\n"]/g, "_");
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(Readable.toWeb(file.stream) as ReadableStream, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(`GET /api/custom-part-files/${fileId}`, error);
    return NextResponse.json({ error: "Unable to open this custom part file." }, { status: 404 });
  }
}
