import { auth } from "@/auth";
import { ProductionOrderLog } from "@/components/ProductionOrderLog";
import { hasPermission } from "@/lib/permissions";

export default async function OrdersPage() {
  const session = await auth();
  const role = session?.user?.role;
  const canCorrectCompletion = Boolean(role && hasPermission(role, "editParts"));

  return (
    <div className="floor-wide-page">
      <ProductionOrderLog canCorrectCompletion={canCorrectCompletion} />
    </div>
  );
}
