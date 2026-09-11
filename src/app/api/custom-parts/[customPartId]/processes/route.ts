import { NextResponse } from "next/server";

import { CUSTOM_PART_PROCESSES, type CustomPartProcess } from "@/constants/custom-part-processes";
import { optionalAuthEmail } from "@/lib/api-auth";
import { completeCustomPart } from "@/lib/custom-part-completion";
import { setCustomPartProcessCompletion } from "@/lib/custom-parts";

type RouteContext = { params: Promise<{ customPartId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { customPartId: rawId } = await context.params;
  const customPartId = Number(rawId);
  let body: { process?: unknown; checked?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const process = String(body.process || "").toLowerCase() as CustomPartProcess;
  if (!Number.isInteger(customPartId) || customPartId <= 0 || !CUSTOM_PART_PROCESSES.includes(process) || typeof body.checked !== "boolean") {
    return NextResponse.json({ error: "Valid custom part, process, and checked state are required." }, { status: 400 });
  }
  try {
    const progress = await setCustomPartProcessCompletion({ customPartId, process, checked: body.checked });
    const allComplete = progress.requiredProcesses.length > 0
      && progress.requiredProcesses.every((required) => Boolean(progress.processProgress[required]));
    if (allComplete) {
      return NextResponse.json({ ok: true, completed: true, progress, completion: await completeCustomPart(customPartId, await optionalAuthEmail()) });
    }
    return NextResponse.json({ ok: true, completed: false, progress });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the custom part process." }, { status: 500 });
  }
}
