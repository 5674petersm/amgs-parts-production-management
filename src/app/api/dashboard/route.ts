import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/api-auth";
import { getDashboardStats } from "@/lib/dashboard";
import { isCalendarDateString } from "@/lib/time";

export async function GET(request: Request) {
  const authResult = await requirePermission("dashboards");
  if ("response" in authResult) {
    return authResult.response;
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start")?.trim() ?? "";
  const endDate = searchParams.get("end")?.trim() ?? "";

  if (!isCalendarDateString(startDate) || !isCalendarDateString(endDate)) {
    return NextResponse.json(
      { error: "Start and end dates are required (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  if (startDate > endDate) {
    return NextResponse.json(
      { error: "Start date must be on or before end date." },
      { status: 400 },
    );
  }

  try {
    const stats = await getDashboardStats(startDate, endDate);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("GET /api/dashboard", error);
    const message =
      error instanceof Error ? error.message : "Unable to load dashboard data.";
    const status = message.includes("date") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
