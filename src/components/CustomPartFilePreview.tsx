"use client";

import DxfParser from "dxf-parser";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type PreviewFile = { id: string; name: string; mimeType: string; url: string };
type Point2 = { x: number; y: number };

let occtPromise: Promise<any> | null = null;

function loadOcct(): Promise<any> {
  if (occtPromise) return occtPromise;
  occtPromise = new Promise((resolve, reject) => {
    const initialize = () => {
      const factory = (window as typeof window & { occtimportjs?: (options: object) => Promise<any> }).occtimportjs;
      if (!factory) return reject(new Error("STEP importer did not initialize."));
      factory({ locateFile: (name: string) => `/api/cad-assets/${name}` }).then(resolve, reject);
    };
    if ((window as typeof window & { occtimportjs?: unknown }).occtimportjs) return initialize();
    const script = document.createElement("script");
    script.src = "/api/cad-assets/occt-import-js.js";
    script.onload = initialize;
    script.onerror = () => reject(new Error("Could not load STEP importer."));
    document.head.appendChild(script);
  });
  return occtPromise;
}

function fileExtension(name: string) {
  return name.toLowerCase().split(".").pop() || "";
}

function arcPoints(center: Point2, radius: number, start: number, end: number) {
  let finish = end;
  while (finish <= start) finish += Math.PI * 2;
  const count = Math.max(16, Math.ceil((finish - start) / (Math.PI / 32)));
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = start + ((finish - start) * index / count);
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

function entityPolylines(entity: any): Point2[][] {
  const type = String(entity?.type || "").toUpperCase();
  const point = (value: any): Point2 | null => {
    const x = Number(value?.x ?? value?.[0]);
    const y = Number(value?.y ?? value?.[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };
  if (type === "LINE") {
    const vertices = entity.vertices || [entity.startPoint, entity.endPoint];
    const points = vertices.map(point).filter(Boolean) as Point2[];
    return points.length > 1 ? [points] : [];
  }
  if (type === "LWPOLYLINE" || type === "POLYLINE") {
    const points = (entity.vertices || []).map(point).filter(Boolean) as Point2[];
    if ((entity.closed || entity.shape) && points.length) points.push(points[0]);
    return points.length > 1 ? [points] : [];
  }
  if (type === "CIRCLE") {
    const center = point(entity.center);
    const radius = Number(entity.radius);
    return center && Number.isFinite(radius) ? [arcPoints(center, radius, 0, Math.PI * 2)] : [];
  }
  if (type === "ARC") {
    const center = point(entity.center);
    const radius = Number(entity.radius);
    return center && Number.isFinite(radius)
      ? [arcPoints(center, radius, Number(entity.startAngle || 0), Number(entity.endAngle || 0))]
      : [];
  }
  return [];
}

function DxfPreview({ url }: { url: string }) {
  const [lines, setLines] = useState<Point2[][]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(url).then(async (response) => {
      if (!response.ok) throw new Error("Could not load DXF file.");
      const parsed = new DxfParser().parseSync(await response.text());
      setLines((parsed?.entities || []).flatMap(entityPolylines));
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Could not preview DXF."));
  }, [url]);
  const bounds = useMemo(() => {
    const points = lines.flat();
    if (!points.length) return { minX: 0, minY: 0, width: 100, height: 100 };
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const padding = Math.max(maxX - minX, maxY - minY, 1) * 0.04;
    return { minX: minX - padding, minY: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
  }, [lines]);
  if (error) return <p className="file-preview-error">{error}</p>;
  if (!lines.length) return <p className="file-preview-loading">Loading DXF drawing…</p>;
  return (
    <svg className="dxf-preview" viewBox={`${bounds.minX} ${-(bounds.minY + bounds.height)} ${bounds.width} ${bounds.height}`} aria-label="DXF drawing preview">
      {lines.map((line, index) => <polyline key={index} points={line.map((point) => `${point.x},${-point.y}`).join(" ")} />)}
    </svg>
  );
}

function PdfPreview({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    setPageNumber(1);
    import("pdfjs-dist/build/pdf.mjs").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/api/cad-assets/pdf.worker.min.mjs";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not load PDF file.");
      const pdf = await pdfjs.getDocument({ data: await response.arrayBuffer() }).promise;
      if (cancelled) return pdf.destroy();
      documentRef.current = pdf;
      setPageCount(pdf.numPages);
    }).catch((loadError: unknown) => !cancelled && setError(loadError instanceof Error ? loadError.message : "Could not preview PDF."));
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
      documentRef.current?.destroy?.();
      documentRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const pdf = documentRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || !pageCount) return;
    let cancelled = false;
    pdf.getPage(pageNumber).then((page: any) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom * Math.min(window.devicePixelRatio || 1, 2) });
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PDF canvas is unavailable.");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / Math.min(window.devicePixelRatio || 1, 2)}px`;
      canvas.style.height = `${viewport.height / Math.min(window.devicePixelRatio || 1, 2)}px`;
      renderTaskRef.current?.cancel?.();
      renderTaskRef.current = page.render({ canvasContext: context, viewport });
      return renderTaskRef.current.promise;
    }).catch((renderError: unknown) => {
      if (!cancelled && (renderError as { name?: string })?.name !== "RenderingCancelledException") {
        setError(renderError instanceof Error ? renderError.message : "Could not render PDF.");
      }
    });
    return () => { cancelled = true; renderTaskRef.current?.cancel?.(); };
  }, [pageNumber, pageCount, zoom]);

  if (error) return <p className="file-preview-error">{error}</p>;
  return (
    <div className="pdf-canvas-preview">
      <div className="pdf-preview-toolbar">
        <button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber((page) => page - 1)}>←</button>
        <span>{pageCount ? `Page ${pageNumber} of ${pageCount}` : "Loading PDF…"}</span>
        <button type="button" disabled={!pageCount || pageNumber >= pageCount} onClick={() => setPageNumber((page) => page + 1)}>→</button>
        <button type="button" disabled={zoom <= 0.6} onClick={() => setZoom((value) => Math.max(0.5, value - 0.2))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" disabled={zoom >= 2.4} onClick={() => setZoom((value) => Math.min(2.5, value + 0.2))}>+</button>
      </div>
      <div className="pdf-preview-page"><canvas ref={canvasRef} /></div>
    </div>
  );
}

function StepPreview({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let scene: THREE.Scene | null = null;
    Promise.all([fetch(url), loadOcct()]).then(async ([response, occt]) => {
      if (!response.ok) throw new Error("Could not load STEP file.");
      const result = occt.ReadStepFile(new Uint8Array(await response.arrayBuffer()), {
        linearUnit: "millimeter",
        linearDeflectionType: "bounding_box_ratio",
        linearDeflection: 0.0008,
        angularDeflection: 0.5,
      });
      if (!result?.success || disposed) throw new Error("STEP import failed.");
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf5f7f8);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.replaceChildren(renderer.domElement);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      scene.add(new THREE.AmbientLight(0xffffff, 1.2));
      const light = new THREE.DirectionalLight(0xffffff, 1.8); light.position.set(100, 140, 100); scene.add(light);
      const group = new THREE.Group();
      for (const mesh of result.meshes || []) {
        const position = (mesh.attributes?.position?.array || []).flat(Infinity);
        if (!position.length) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
        const normals = (mesh.attributes?.normal?.array || []).flat(Infinity);
        if (normals.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3)); else geometry.computeVertexNormals();
        const indices = (mesh.index?.array || []).flat(Infinity);
        if (indices.length) geometry.setIndex(indices);
        group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x8299aa, roughness: 0.55, side: THREE.DoubleSide })));
      }
      if (!group.children.length) throw new Error("STEP file has no renderable geometry.");
      scene.add(group);
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 1);
      camera.position.set(center.x + size * 1.8, center.y + size * 1.3, center.z + size * 1.8);
      camera.near = Math.max(size / 1000, 0.1); camera.far = size * 30; camera.updateProjectionMatrix();
      controls.target.copy(center); controls.update();
      const resize = () => {
        if (!renderer) return;
        const width = container.clientWidth || 700; const height = container.clientHeight || 480;
        renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
      };
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize();
      const animate = () => { frame = requestAnimationFrame(animate); controls?.update(); if (renderer && scene) renderer.render(scene, camera); };
      animate();
    }).catch((loadError: unknown) => !disposed && setError(loadError instanceof Error ? loadError.message : "Could not preview STEP file."));
    return () => {
      disposed = true; cancelAnimationFrame(frame); resizeObserver?.disconnect(); controls?.dispose(); renderer?.dispose();
      scene?.traverse((object: any) => { object.geometry?.dispose?.(); object.material?.dispose?.(); });
    };
  }, [url]);
  return <div className="step-preview" ref={containerRef}>{error ? <p className="file-preview-error">{error}</p> : <p className="file-preview-loading">Loading 3D model…</p>}</div>;
}

function FilePreview({ file }: { file: PreviewFile }) {
  const extension = fileExtension(file.name);
  if (extension === "pdf" || file.mimeType === "application/pdf") return <PdfPreview url={file.url} />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) return <img className="image-file-preview" src={file.url} alt={file.name} />;
  if (extension === "dxf") return <DxfPreview url={file.url} />;
  if (extension === "step" || extension === "stp") return <StepPreview url={file.url} />;
  return <p className="file-preview-loading">Preview is not available for this file type. You can still download it below.</p>;
}

export function CustomPartFilePreview({ file }: { file: PreviewFile }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <button className="custom-file-preview-button" type="button" onClick={() => setOpen(true)}>{file.name}</button>
      {open && (
        <div className="file-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="file-preview-modal" role="dialog" aria-modal="true" aria-label={`Preview ${file.name}`}>
            <header><strong>{file.name}</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close preview">×</button></header>
            <div className="file-preview-body"><FilePreview file={file} /></div>
            <footer><a className="primary-button" href={`${file.url}${file.url.includes("?") ? "&" : "?"}download=1`}>Download file</a><button className="secondary-button" type="button" onClick={() => setOpen(false)}>Close</button></footer>
          </section>
        </div>
      )}
    </>
  );
}
