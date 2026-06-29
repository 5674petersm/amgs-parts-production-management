import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardView } from "@/components/DashboardView";
import { getDefaultDashboardStats } from "@/lib/dashboard";
import { getStockInventoryStatus } from "@/lib/dashboard-inventory";
import { hasPermission } from "@/lib/permissions";
import { plantLocalWeekRange } from "@/lib/time";

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!role || !hasPermission(role, "dashboards")) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const { startDate, endDate } = plantLocalWeekRange();
  let initialStats;
  let initialInventoryRows;
  try {
    [initialStats, initialInventoryRows] = await Promise.all([
      getDefaultDashboardStats(),
      getStockInventoryStatus().then((result) => result.rows),
    ]);
  } catch (error) {
    console.error("DashboardPage load error", error);
    return (
      <section className="card">
        <h1>Dashboard</h1>
        <p className="error">Unable to load dashboard data. Try again later.</p>
      </section>
    );
  }

  return (
    <DashboardView
      initialStats={initialStats}
      initialInventoryRows={initialInventoryRows}
      defaultStartDate={startDate}
      defaultEndDate={endDate}
    />
  );
}
