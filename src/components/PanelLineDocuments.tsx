"use client";

import { CustomPartFilePreview } from "@/components/CustomPartFilePreview";
import type { ShopFloorPanelDocument } from "@/types/shop-floor-order";

export function PanelLineDocuments({ documents }: { documents: ShopFloorPanelDocument[] }) {
  if (!documents.length) return null;
  return (
    <section className="panel-line-documents" aria-label="Engineering-approved panel fabrication documents">
      <div className="panel-document-heading">
        <strong>Approved Panel Documents</strong>
        <span>Engineering documents · not custom parts</span>
      </div>
      {documents.map((document) => {
        const base = `/api/assigned-panel-documents/${encodeURIComponent(document.orderNumber)}/${encodeURIComponent(document.orderLineId)}`;
        return (
          <div className="panel-document-set" key={`${document.orderNumber}:${document.orderLineId}`}>
            <strong>{document.partNumber}</strong>
            <CustomPartFilePreview file={{ id: `${document.orderLineId}-drawing`, name: document.drawingOriginalName || `${document.partNumber} approved drawing.pdf`, mimeType: "application/pdf", url: `${base}/drawing` }} />
            {document.cutlistMode === "none" ? <span className="panel-no-cutlist">No cutlist required</span> : <CustomPartFilePreview file={{ id: `${document.orderLineId}-cutlist`, name: document.cutlistOriginalName || `${document.partNumber} approved cutlist.pdf`, mimeType: "application/pdf", url: `${base}/cutlist` }} />}
          </div>
        );
      })}
    </section>
  );
}
