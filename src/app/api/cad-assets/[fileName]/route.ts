import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ fileName: string }> };

const ASSETS: Record<string, { relativePath: string; contentType: string }> = {
  "occt-import-js.js": { relativePath: "dist/occt-import-js.js", contentType: "text/javascript; charset=utf-8" },
  "occt-import-js.wasm": { relativePath: "dist/occt-import-js.wasm", contentType: "application/wasm" },
  "occt-import-js-worker.js": { relativePath: "dist/occt-import-js-worker.js", contentType: "text/javascript; charset=utf-8" },
  "pdf.worker.min.mjs": { relativePath: "../pdfjs-dist/build/pdf.worker.min.mjs", contentType: "text/javascript; charset=utf-8" },
};

export async function GET(_request: Request, context: RouteContext) {
  const { fileName } = await context.params;
  const asset = ASSETS[fileName];
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  try {
    const file = await readFile(path.join(process.cwd(), "node_modules", "occt-import-js", asset.relativePath));
    return new Response(file, {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error(`CAD asset ${fileName}`, error);
    return NextResponse.json({ error: "Asset unavailable." }, { status: 404 });
  }
}
