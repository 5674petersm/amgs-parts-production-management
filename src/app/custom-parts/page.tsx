import { auth } from "@/auth";
import { CurrentCustomParts } from "@/components/CurrentCustomParts";
import { hasPermission } from "@/lib/permissions";

export default async function CurrentCustomPartsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; order?: string; line?: string; customer?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role;
  const query = await searchParams;
  return <div className="floor-wide-page"><CurrentCustomParts
    canManage={Boolean(role && hasPermission(role, "customParts"))}
    signedIn={Boolean(session?.user?.email)}
    initialAddOrder={query.add === "1" ? String(query.order || "").trim() : ""}
    initialAddLine={query.add === "1" ? String(query.line || "").trim() : ""}
    initialAddCustomer={query.add === "1" ? String(query.customer || "").trim() : ""}
  /></div>;
}
