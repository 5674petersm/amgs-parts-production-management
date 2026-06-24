import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ManualLookup } from "@/components/ManualLookup";
import { hasPermission } from "@/lib/permissions";

type SearchPageProps = {
  searchParams: Promise<{ notFound?: string; timeout?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const session = await auth();
  const role = session?.user?.role ?? "operator";

  if (!hasPermission(role, "production")) {
    redirect("/");
  }

  const { notFound, timeout } = await searchParams;
  const timedOut = timeout === "1";

  return (
    <section>
      {timedOut && !notFound && (
        <p className="notice">No QR code scanned — enter the part below.</p>
      )}
      <ManualLookup initialNotFound={notFound?.trim()} />
      <p className="hint" style={{ marginTop: "1rem" }}>
        <Link href="/">Scan QR code</Link>
      </p>
    </section>
  );
}
