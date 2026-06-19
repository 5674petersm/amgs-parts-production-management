"use client";

import { Html5Qrcode } from "html5-qrcode";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ManualLookup } from "@/components/ManualLookup";
import { isCustomPartQr, parsePartFromQr } from "@/lib/parse-qr";

const SCAN_TIMEOUT_MS = 10_000;
const SCANNER_ELEMENT_ID = "qr-reader";

type ScanPhase = "idle" | "scanning" | "manual";

export function QrScanHome() {
  const router = useRouter();
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState("Waiting for QR code…");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const processingRef = useRef(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) {
      return;
    }
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      // Camera may already be released
    }
  }, []);

  const openManual = useCallback(async () => {
    handledRef.current = true;
    await stopScanner();
    setPhase("manual");
  }, [stopScanner]);

  const handleDecoded = useCallback(
    async (text: string) => {
      if (handledRef.current || processingRef.current) {
        return;
      }

      processingRef.current = true;
      const preview =
        text.length > 72 ? `${text.slice(0, 72)}…` : text;
      setScanError(null);
      setScanStatus(`QR detected: ${preview}`);

      const partNumber = parsePartFromQr(text);
      if (!partNumber) {
        processingRef.current = false;
        setScanError(
          "That QR is not a part link. Use a code from the part book, or enter the part manually.",
        );
        setScanStatus("Still scanning — center the QR in the box");
        return;
      }

      if (isCustomPartQr(partNumber)) {
        setScanStatus("Custom part code detected. Opening form…");
        await stopScanner();
        router.push("/p/custom");
        return;
      }

      setScanStatus(`Looking up part ${partNumber} in database…`);
      handledRef.current = true;

      try {
        const response = await fetch(
          `/api/parts/${encodeURIComponent(partNumber)}`,
        );
        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          handledRef.current = false;
          processingRef.current = false;
          setScanError(
            data.error ??
              `Part "${partNumber}" was not found. Check the code or enter it manually.`,
          );
          setScanStatus("Scan again or use manual entry below");
          return;
        }

        setScanStatus(`Found ${partNumber}. Opening form…`);
        await stopScanner();
        router.push(`/p/${encodeURIComponent(partNumber)}`);
      } catch {
        handledRef.current = false;
        processingRef.current = false;
        setScanError("Could not reach the server. Check your connection.");
        setScanStatus("Try scanning again");
      }
    },
    [router, stopScanner],
  );

  const handleDecodedRef = useRef(handleDecoded);
  handleDecodedRef.current = handleDecoded;

  useEffect(() => {
    if (phase !== "scanning") {
      return;
    }

    handledRef.current = false;
    processingRef.current = false;
    setScanError(null);
    setScanStatus("Camera on — center the QR code in the box");
    setSecondsLeft(SCAN_TIMEOUT_MS / 1000);

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    let countdownId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const start = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const size = Math.floor(
                Math.min(viewfinderWidth, viewfinderHeight) * 0.85,
              );
              return { width: size, height: size };
            },
            aspectRatio: 1,
          },
          (decodedText) => {
            void handleDecodedRef.current(decodedText);
          },
          () => {},
        );

        countdownId = setInterval(() => {
          setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
        }, 1000);

        timeoutId = setTimeout(() => {
          void openManual();
        }, SCAN_TIMEOUT_MS);
      } catch {
        setScanError(
          "Could not open the camera. Allow camera access or enter the part manually.",
        );
        await openManual();
      }
    };

    void start();

    return () => {
      if (countdownId) {
        clearInterval(countdownId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      void stopScanner();
    };
  }, [phase, openManual, stopScanner]);

  if (phase === "manual") {
    return (
      <section>
        <p className="notice">Enter the part number or item ID below.</p>
        <ManualLookup />
        <p className="hint" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setPhase("idle");
              setScanError(null);
            }}
          >
            Scan QR code instead
          </button>
        </p>
      </section>
    );
  }

  if (phase === "scanning") {
    return (
      <section>
        <p className="notice">
          Point at the QR code. Manual entry in <strong>{secondsLeft}</strong>s.
        </p>
        <div className="scan-status-box" role="status" aria-live="polite">
          {scanStatus}
        </div>
        {scanError && <p className="error">{scanError}</p>}
        <div id={SCANNER_ELEMENT_ID} className="qr-reader" />
        <button
          type="button"
          className="secondary-button"
          onClick={() => void openManual()}
        >
          Enter part manually
        </button>
        <p className="hint" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              handledRef.current = true;
              void stopScanner().then(() => setPhase("idle"));
            }}
          >
            Cancel
          </button>
        </p>
      </section>
    );
  }

  return (
    <section>
      <p className="notice">
        Tap below to scan a part QR code and record production.
      </p>
      <button
        type="button"
        className="primary-button"
        onClick={() => setPhase("scanning")}
      >
        Scan code
      </button>
      <Link href="/custom-part" className="secondary-button link-as-button">
        Add custom part
      </Link>
    </section>
  );
}
