import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CustomProductionForm } from "@/components/CustomProductionForm";
import { ProductionForm } from "@/components/ProductionForm";
import { hasPermission } from "@/lib/permissions";
import { isCustomPartQr, parseItemIdFromQrKey } from "@/lib/parse-qr";
import { getStockByItemId } from "@/lib/stock";
type PartPageProps = {
  params: Promise<{ partNumber: string }>;
};

export default async function PartPage({ params }: PartPageProps) {
  const session = await auth();
  const role = session?.user?.role ?? "operator";

  if (!hasPermission(role, "production")) {
    redirect("/");
  }

  const { partNumber } = await params;  const qrKey = decodeURIComponent(partNumber).trim();

  if (!qrKey) {
    redirect("/");
  }

  if (isCustomPartQr(qrKey)) {
    return (
      <section>
        <CustomProductionForm source="QR" />
        <p className="hint" style={{ marginTop: "1rem" }}>
          <Link href="/">Scan another code</Link>
        </p>
      </section>
    );
  }

  const itemId = parseItemIdFromQrKey(qrKey);
  if (itemId === null) {
    const query = new URLSearchParams({ notFound: qrKey });
    redirect(`/search?${query.toString()}`);
  }

  let item = null;
  try {
    item = await getStockByItemId(itemId);
  } catch (error) {
    console.error("PartPage load error", error);
    return (
      <section>
        <p className="error">Unable to connect to the database. Try again later.</p>
        <p className="hint">
          <Link href="/">Back to scan</Link>
        </p>
      </section>
    );
  }

  if (!item) {
    const query = new URLSearchParams({
      notFound: String(itemId),
    });
    redirect(`/search?${query.toString()}`);
  }

  return (
    <section>
      <ProductionForm item={item} source="QR" />
      <p className="hint" style={{ marginTop: "1rem" }}>
        <Link href="/">Scan another code</Link>
      </p>
    </section>
  );
}
