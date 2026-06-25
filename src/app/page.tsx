import { auth } from "@/auth";
import { QrScanHome } from "@/components/QrScanHome";
import { hasPermission } from "@/lib/permissions";

export default async function HomePage() {
  const session = await auth();
  const role = session?.user?.role;
  const canCreateCustomParts =
    role !== undefined && hasPermission(role, "customParts");

  return <QrScanHome canCreateCustomParts={canCreateCustomParts} />;
}
