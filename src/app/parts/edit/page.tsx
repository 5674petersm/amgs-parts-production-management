import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EditPartForm } from "@/components/EditPartForm";
import { hasPermission } from "@/lib/permissions";

type EditPartPageProps = {
  searchParams: Promise<{ itemId?: string }>;
};

export default async function EditPartPage({ searchParams }: EditPartPageProps) {
  const session = await auth();
  const role = session?.user?.role ?? "operator";

  if (!hasPermission(role, "editParts")) {
    redirect("/");
  }

  const { itemId } = await searchParams;

  return <EditPartForm initialItemId={itemId} />;
}
