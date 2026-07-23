import { auth } from "@/auth";
import { CurrentCustomParts } from "@/components/CurrentCustomParts";
import { hasPermission } from "@/lib/permissions";

export default async function CurrentCustomPartsPage() {
  const session = await auth();
  const role = session?.user?.role;
  return <div className="floor-wide-page"><CurrentCustomParts canManage={Boolean(role && hasPermission(role, "customParts"))} /></div>;
}
