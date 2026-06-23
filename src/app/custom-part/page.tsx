import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CustomPartForm } from "@/components/CustomPartForm";
import { hasPermission } from "@/lib/permissions";

export default async function CustomPartPage() {
  const session = await auth();
  const role = session?.user?.role ?? "operator";

  if (!hasPermission(role, "customParts")) {
    redirect("/");
  }

  return <CustomPartForm />;
}
