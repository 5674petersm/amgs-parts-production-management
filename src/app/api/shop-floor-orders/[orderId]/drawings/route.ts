import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { createShopFloorOrderDrawing } from "@/lib/shop-floor-orders";

type RouteContext = { params: Promise<{ orderId: string }> };

export const maxDuration = 120;

export async function POST(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  try {
    const formData = await request.formData();
    const files = formData.getAll("drawings").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) return NextResponse.json({ error: "Choose at least one drawing file." }, { status: 400 });
    const shareWithCustomer = formData.get("shareWithCustomer") === "true";
    const session = await auth();
    const uploadedBy = session?.user?.name || session?.user?.email || "Production site user";
    const drawings = [];
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25 MB.`);
      drawings.push(await createShopFloorOrderDrawing({
        orderId,
        fileName: file.name,
        contentBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        shareWithCustomer,
        uploadedBy,
      }));
    }
    return NextResponse.json({ ok: true, drawings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add the order drawings." }, { status: 502 });
  }
}
