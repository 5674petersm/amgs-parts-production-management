"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { CUSTOM_PART_MATERIALS } from "@/constants/custom-part-materials";
import type {
  CustomPartDraft,
  CustomPartOrderLookup,
  CustomPartUploadResponse,
} from "@/types/custom-part";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PartDetails({ draft }: { draft: CustomPartDraft }) {
  return (
    <dl className="part-details">
      <div>
        <dt>AMGS order number</dt>
        <dd>{draft.amgsOrderNumber}</dd>
      </div>
      <div>
        <dt>Customer name</dt>
        <dd>{draft.customerName}</dd>
      </div>
      <div>
        <dt>Part number</dt>
        <dd>{draft.partNumber}</dd>
      </div>
      <div>
        <dt>Description</dt>
        <dd>{draft.description}</dd>
      </div>
      <div>
        <dt>Qty needed</dt>
        <dd>{draft.qtyNeeded}</dd>
      </div>
      <div>
        <dt>Material</dt>
        <dd>{draft.material}</dd>
      </div>
      <div>
        <dt>Custom color</dt>
        <dd>{draft.hasCustomColor ? draft.customColor : "No"}</dd>
      </div>
      <div>
        <dt>Drawings</dt>
        <dd>
          <ul className="file-list compact">
            {draft.drawingFiles.map((file) => (
              <li key={`${file.name}-${file.size}`}>
                {file.name}
                <span className="file-meta"> ({formatFileSize(file.size)})</span>
              </li>
            ))}
          </ul>
        </dd>
      </div>
    </dl>
  );
}

export function CustomPartForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [amgsOrderNumber, setAmgsOrderNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [nextPartNumber, setNextPartNumber] = useState("");
  const [orderPartCount, setOrderPartCount] = useState(0);
  const [orderLookupLoading, setOrderLookupLoading] = useState(false);
  const [orderLookupError, setOrderLookupError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [qtyNeeded, setQtyNeeded] = useState("");
  const [material, setMaterial] = useState("");
  const [hasCustomColor, setHasCustomColor] = useState(false);
  const [customColor, setCustomColor] = useState("");
  const [drawingFiles, setDrawingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<CustomPartDraft | null>(null);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);

  useEffect(() => {
    const order = amgsOrderNumber.trim();
    if (!order) {
      setNextPartNumber("");
      setOrderPartCount(0);
      setOrderLookupError(null);
      setOrderLookupLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setOrderLookupLoading(true);
      setOrderLookupError(null);

      try {
        const response = await fetch(
          `/api/custom-parts/order-lookup?order=${encodeURIComponent(order)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as
          | CustomPartOrderLookup
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            (data as { error?: string }).error ?? "Unable to look up order.",
          );
        }

        const lookup = data as CustomPartOrderLookup;
        setNextPartNumber(lookup.nextPartNumber);
        setOrderPartCount(lookup.partCount);
        if (lookup.existingCustomerName) {
          setCustomerName((current) => current.trim() || lookup.existingCustomerName || "");
        }
      } catch (lookupError) {
        if (lookupError instanceof DOMException && lookupError.name === "AbortError") {
          return;
        }
        setNextPartNumber("");
        setOrderPartCount(0);
        setOrderLookupError(
          lookupError instanceof Error
            ? lookupError.message
            : "Unable to look up order.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setOrderLookupLoading(false);
        }
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [amgsOrderNumber]);

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const incoming = Array.from(fileList);

    setDrawingFiles((current) => {
      const existing = new Set(current.map((f) => `${f.name}-${f.size}`));
      const added = incoming.filter(
        (f) => !existing.has(`${f.name}-${f.size}`),
      );
      return [...current, ...added];
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeFile(index: number) {
    setDrawingFiles((current) => current.filter((_, i) => i !== index));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const qty = Number(qtyNeeded);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      setError("Qty needed must be a positive whole number.");
      return;
    }

    if (!material) {
      setError("Select a material.");
      return;
    }

    if (hasCustomColor && !customColor.trim()) {
      setError("Enter a custom color or uncheck custom color.");
      return;
    }

    if (!amgsOrderNumber.trim()) {
      setError("Enter an AMGS order number.");
      return;
    }

    if (!nextPartNumber) {
      setError(orderLookupError ?? "Wait for the part number to be assigned.");
      return;
    }

    if (drawingFiles.length === 0) {
      setError("Add at least one drawing file.");
      return;
    }

    setDraft({
      amgsOrderNumber: amgsOrderNumber.trim(),
      customerName: customerName.trim(),
      partNumber: nextPartNumber,
      description: description.trim(),
      qtyNeeded: qty,
      material,
      hasCustomColor,
      customColor: customColor.trim(),
      drawingFiles,
    });
    setReviewing(true);
  }

  async function handleSaveToDrive() {
    if (!draft) {
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("amgsOrderNumber", draft.amgsOrderNumber);
    formData.append("customerName", draft.customerName);
    formData.append("description", draft.description);
    formData.append("qtyNeeded", String(draft.qtyNeeded));
    formData.append("material", draft.material);
    formData.append("hasCustomColor", String(draft.hasCustomColor));
    formData.append("customColor", draft.customColor);
    for (const file of draft.drawingFiles) {
      formData.append("drawings", file);
    }

    try {
      const response = await fetch("/api/custom-parts", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as
        | CustomPartUploadResponse
        | { error?: string };

      if (!response.ok) {
        const err = data as { error?: string };
        throw new Error(err.error ?? "Unable to upload to Google Drive.");
      }

      const result = data as CustomPartUploadResponse;
      setDraft({ ...draft, partNumber: result.partNumber });
      setFolderUrl(result.folderUrl);
      setSaved(true);
      setReviewing(false);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload to Google Drive.",
      );
    } finally {
      setUploading(false);
    }
  }

  function handleBackToEdit() {
    setReviewing(false);
    setError(null);
  }

  function handleCreateAnother() {
    setSaved(false);
    setReviewing(false);
    setDraft(null);
    setFolderUrl(null);
    setAmgsOrderNumber("");
    setCustomerName("");
    setNextPartNumber("");
    setOrderPartCount(0);
    setOrderLookupError(null);
    setDescription("");
    setQtyNeeded("");
    setMaterial("");
    setHasCustomColor(false);
    setCustomColor("");
    setDrawingFiles([]);
    setError(null);
  }

  if (saved && draft && folderUrl) {
    return (
      <section>
        <div className="card success-card">
          <h2>Saved to Google Drive</h2>
          <p>
            Drawings and part details were uploaded to the shared drive folder.
          </p>
          <PartDetails draft={draft} />
          <p className="hint">
            <a href={folderUrl} target="_blank" rel="noopener noreferrer">
              Open folder in Google Drive
            </a>
          </p>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            onClick={handleCreateAnother}
          >
            Add another custom part
          </button>
          <Link href="/" className="secondary-button link-as-button">
            Back to scan
          </Link>
        </div>
      </section>
    );
  }

  if (reviewing && draft) {
    return (
      <section>
        <div className="card">
          <h2>Review custom part</h2>
          <p>Confirm details, then save drawings to the shared Google Drive.</p>
          <PartDetails draft={draft} />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            onClick={handleSaveToDrive}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Save to Google Drive"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleBackToEdit}
            disabled={uploading}
          >
            Edit
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <p className="notice">
        Enter custom part details and attach drawings. Files are saved to your
        company shared drive on submit.
      </p>

      <form className="card form-card" onSubmit={handleSubmit}>
        <label>
          AMGS order number
          <input
            type="text"
            required
            value={amgsOrderNumber}
            onChange={(e) => setAmgsOrderNumber(e.target.value)}
            placeholder="e.g. 1234"
            autoComplete="off"
          />
        </label>

        <div className="field-block">
          <span className="field-label">Part number</span>
          <p className="read-only-field" aria-live="polite">
            {orderLookupLoading
              ? "Looking up order…"
              : nextPartNumber || "Enter an AMGS order number"}
          </p>
          {orderPartCount > 0 && nextPartNumber && (
            <p className="hint field-hint">
              {orderPartCount} existing part{orderPartCount === 1 ? "" : "s"} on this order.
            </p>
          )}
          {orderLookupError && (
            <p className="error field-hint">{orderLookupError}</p>
          )}
        </div>

        <label>
          Customer name
          <input
            type="text"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer name"
            autoComplete="off"
          />
        </label>

        <label>
          Description
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Part description"
          />
        </label>

        <label>
          Qty needed
          <input
            type="number"
            required
            min={1}
            step={1}
            inputMode="numeric"
            value={qtyNeeded}
            onChange={(e) => setQtyNeeded(e.target.value)}
            placeholder="e.g. 10"
          />
        </label>

        <label>
          Material
          <select
            required
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
          >
            <option value="">Select material</option>
            {CUSTOM_PART_MATERIALS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={hasCustomColor}
            onChange={(e) => {
              setHasCustomColor(e.target.checked);
              if (!e.target.checked) {
                setCustomColor("");
              }
            }}
          />
          Custom color
        </label>

        {hasCustomColor && (
          <label>
            Custom color
            <input
              type="text"
              required
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              placeholder="e.g. RAL 5015"
              autoComplete="off"
            />
          </label>
        )}

        <div className="field-block">
          <span className="field-label">Drawing files</span>
          <p className="hint field-hint">
            PDF, images, CAD, or other drawing formats. You can select multiple
            files (max 50 MB each).
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="file-input"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.dwg,.dxf,.step,.stp,.iges,.igs,.svg"
            onChange={(e) => addFiles(e.target.files)}
          />
          {drawingFiles.length > 0 && (
            <ul className="file-list">
              {drawingFiles.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`}>
                  <span>
                    {file.name}{" "}
                    <span className="file-meta">({formatFileSize(file.size)})</span>
                  </span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => removeFile(index)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="primary-button">
          Review custom part
        </button>
      </form>

      <p className="hint" style={{ marginTop: "1rem" }}>
        <Link href="/">Back to scan</Link>
      </p>
    </section>
  );
}
