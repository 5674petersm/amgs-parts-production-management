import Link from "next/link";
import { redirect } from "next/navigation";

import { ProductionForm } from "@/components/ProductionForm";
import { getStockByMasterPNo } from "@/lib/stock";

type PartPageProps = {
  params: Promise<{ partNumber: string }>;
};

export default async function PartPage({ params }: PartPageProps) {
  const { partNumber } = await params;
  const masterPNo = decodeURIComponent(partNumber).trim();

  if (!masterPNo) {
    redirect("/");
  }

  let item = null;
  try {
    item = await getStockByMasterPNo(masterPNo);
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
      notFound: masterPNo,
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
