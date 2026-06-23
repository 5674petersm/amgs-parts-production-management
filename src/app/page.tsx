import { auth } from "@/auth";
import { EngineerHome } from "@/components/EngineerHome";
import { QrScanHome } from "@/components/QrScanHome";
import { hasPermission } from "@/lib/permissions";

export default async function HomePage() {
  const session = await auth();
  const role = session?.user?.role ?? "operator";

  if (!hasPermission(role, "production")) {
    return <EngineerHome role={role} />;
  }

  return <QrScanHome canCreateCustomParts={hasPermission(role, "customParts")} />;
}
