"use client";

import DxfParser from "dxf-parser";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

type PreviewFile = { id: string; name: string; mimeType: string; url: string };
type Point2 = { x: number; y: number };
type DxfCircle = {
  center: Point2;
  radius: number;
  startAngle: number | null;
  endAngle: number | null;
};
type MeasurementResult = {
  distance: number;
  delta: THREE.Vector3;
};

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

function circularEdgeCenters(geometry: THREE.BufferGeometry): Map<number, THREE.Vector3> {
  const position = geometry.getAttribute("position");
  const circlesBySegment = new Map<number, THREE.Vector3>();
  if (!position || position.count < 16) return circlesBySegment;

  geometry.computeBoundingBox();
  const diagonal = geometry.boundingBox?.getSize(new THREE.Vector3()).length() || 1;
  const tolerance = Math.max(diagonal * 1e-5, 1e-6);
  const pointKey = (point: THREE.Vector3) => [
    Math.round(point.x / tolerance),
    Math.round(point.y / tolerance),
    Math.round(point.z / tolerance),
  ].join(":");
  const segments: { start: THREE.Vector3; end: THREE.Vector3; startKey: string; endKey: string }[] = [];
  const adjacency = new Map<string, number[]>();
  const pointsByKey = new Map<string, THREE.Vector3>();

  for (let index = 0; index + 1 < position.count; index += 2) {
    const start = new THREE.Vector3().fromBufferAttribute(position, index);
    const end = new THREE.Vector3().fromBufferAttribute(position, index + 1);
    const startKey = pointKey(start);
    const endKey = pointKey(end);
    const segmentIndex = segments.length;
    segments.push({ start, end, startKey, endKey });
    pointsByKey.set(startKey, start);
    pointsByKey.set(endKey, end);
    adjacency.set(startKey, [...(adjacency.get(startKey) || []), segmentIndex]);
    adjacency.set(endKey, [...(adjacency.get(endKey) || []), segmentIndex]);
  }

  const unvisited = new Set(segments.map((_, index) => index));
  while (unvisited.size) {
    const first = unvisited.values().next().value as number;
    const component: number[] = [];
    const queue = [first];
    unvisited.delete(first);
    while (queue.length) {
      const segmentIndex = queue.pop()!;
      component.push(segmentIndex);
      const segment = segments[segmentIndex];
      for (const key of [segment.startKey, segment.endKey]) {
        for (const neighbor of adjacency.get(key) || []) {
          if (unvisited.delete(neighbor)) queue.push(neighbor);
        }
      }
    }

    const componentKeys = new Set(component.flatMap((index) => [
      segments[index].startKey,
      segments[index].endKey,
    ]));
    if (component.length < 8 || [...componentKeys].some((key) => adjacency.get(key)?.length !== 2)) continue;

    const ordered: THREE.Vector3[] = [];
    const orderedSegments: number[] = [];
    const used = new Set<number>();
    let currentKey = segments[component[0]].startKey;
    for (let count = 0; count < component.length; count++) {
      const nextSegment = (adjacency.get(currentKey) || []).find((index) => component.includes(index) && !used.has(index));
      if (nextSegment === undefined) break;
      used.add(nextSegment);
      ordered.push(pointsByKey.get(currentKey)!.clone());
      orderedSegments.push(nextSegment);
      const segment = segments[nextSegment];
      currentKey = segment.startKey === currentKey ? segment.endKey : segment.startKey;
    }
    if (ordered.length !== component.length) continue;

    const center = ordered.reduce((sum, point) => sum.add(point), new THREE.Vector3())
      .multiplyScalar(1 / ordered.length);
    const normal = new THREE.Vector3();
    for (let index = 0; index < ordered.length; index++) {
      const current = ordered[index].clone().sub(center);
      const next = ordered[(index + 1) % ordered.length].clone().sub(center);
      normal.add(current.cross(next));
    }
    if (normal.lengthSq() < tolerance * tolerance) continue;
    normal.normalize();
    const radii = ordered.map((point) => {
      const offset = point.clone().sub(center);
      return offset.addScaledVector(normal, -offset.dot(normal)).length();
    });
    const radius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
    if (radius <= tolerance) continue;
    const radialError = Math.max(...radii.map((value) => Math.abs(value - radius))) / radius;
    const planarError = Math.max(...ordered.map((point) => Math.abs(point.clone().sub(center).dot(normal)))) / radius;
    const perimeter = ordered.reduce((sum, point, index) =>
      sum + point.distanceTo(ordered[(index + 1) % ordered.length]), 0);
    const circumferenceRatio = perimeter / (Math.PI * 2 * radius);
    const isCompleteCircle = radialError <= 0.035
      && planarError <= 0.02
      && circumferenceRatio >= 0.9
      && circumferenceRatio <= 1.05;
    if (isCompleteCircle) {
      component.forEach((segmentIndex) => circlesBySegment.set(segmentIndex * 2, center.clone()));
      continue;
    }

    const arcJoints = ordered.map((point, index) => {
      const previous = ordered[(index - 1 + ordered.length) % ordered.length];
      const next = ordered[(index + 1) % ordered.length];
      const incoming = point.clone().sub(previous);
      const outgoing = next.clone().sub(point);
      const turn = incoming.angleTo(outgoing);
      if (!Number.isFinite(turn) || turn < THREE.MathUtils.degToRad(0.75)) return null;
      const a = point.clone().sub(previous);
      const b = next.clone().sub(previous);
      const cross = new THREE.Vector3().crossVectors(a, b);
      const denominator = 2 * cross.lengthSq();
      if (denominator <= tolerance * tolerance) return null;
      const arcCenter = previous.clone()
        .add(new THREE.Vector3().crossVectors(b, cross).multiplyScalar(a.lengthSq()))
        .add(new THREE.Vector3().crossVectors(cross, a).multiplyScalar(b.lengthSq()))
        .addScaledVector(previous, -1)
        .multiplyScalar(1 / denominator)
        .add(previous);
      const arcRadius = arcCenter.distanceTo(point);
      const expandedBounds = geometry.boundingBox!.clone().expandByScalar(diagonal * 0.03);
      return arcRadius > tolerance
        && arcRadius <= diagonal
        && expandedBounds.containsPoint(arcCenter)
        ? { index, center: arcCenter, radius: arcRadius, turn }
        : null;
    });

    const firstStraight = arcJoints.findIndex((joint) => joint === null);
    const orderedJoints = firstStraight >= 0
      ? [...arcJoints.slice(firstStraight + 1), ...arcJoints.slice(0, firstStraight + 1)]
      : arcJoints;
    let run: NonNullable<(typeof arcJoints)[number]>[] = [];
    const saveRun = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      const accumulatedTurn = run.reduce((sum, joint) => sum + joint.turn, 0);
      if (accumulatedTurn < THREE.MathUtils.degToRad(30)) {
        run = [];
        return;
      }
      const runCenter = run.reduce((sum, joint) => sum.add(joint.center), new THREE.Vector3())
        .multiplyScalar(1 / run.length);
      run.forEach((joint) => {
        const previousSegment = orderedSegments[(joint.index - 1 + orderedSegments.length) % orderedSegments.length];
        const nextSegment = orderedSegments[joint.index];
        circlesBySegment.set(previousSegment * 2, runCenter.clone());
        circlesBySegment.set(nextSegment * 2, runCenter.clone());
      });
      run = [];
    };
    for (const joint of orderedJoints) {
      if (!joint) {
        saveRun();
        continue;
      }
      const reference = run[0];
      const matchesRun = !reference
        || (
          Math.abs(joint.radius - reference.radius) <= reference.radius * 0.04
          && joint.center.distanceTo(reference.center) <= reference.radius * 0.04
        );
      if (!matchesRun) saveRun();
      run.push(joint);
    }
    saveRun();
  }
  return circlesBySegment;
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

function bulgeArc(start: Point2, end: Point2, bulge: number): { circle: DxfCircle; points: Point2[] } | null {
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-8) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  if (!chord) return null;
  const radius = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge));
  const offset = chord * (1 - bulge * bulge) / (4 * bulge);
  const center = {
    x: (start.x + end.x) / 2 - (dy / chord) * offset,
    y: (start.y + end.y) / 2 + (dx / chord) * offset,
  };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const circle = bulge > 0
    ? { center, radius, startAngle, endAngle }
    : { center, radius, startAngle: endAngle, endAngle: startAngle };
  const points = bulge > 0
    ? arcPoints(center, radius, startAngle, endAngle)
    : arcPoints(center, radius, endAngle, startAngle).reverse();
  return { circle, points };
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
    const vertices = entity.vertices || [];
    const points = vertices.map(point).filter(Boolean) as Point2[];
    if (points.length < 2) return [];
    const expanded: Point2[] = [points[0]];
    const segmentCount = (entity.closed || entity.shape) ? points.length : points.length - 1;
    for (let index = 0; index < segmentCount; index++) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const arc = bulgeArc(start, end, Number(vertices[index]?.bulge || 0));
      if (arc) expanded.push(...arc.points.slice(1));
      else expanded.push(end);
    }
    return [expanded];
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

function entityCircles(entity: any): DxfCircle[] {
  const type = String(entity?.type || "").toUpperCase();
  if (type === "CIRCLE" || type === "ARC") {
    const x = Number(entity.center?.x ?? entity.center?.[0]);
    const y = Number(entity.center?.y ?? entity.center?.[1]);
    const radius = Number(entity.radius);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(radius) && radius > 0
      ? [{
      center: { x, y },
      radius,
      startAngle: type === "ARC" ? Number(entity.startAngle || 0) : null,
      endAngle: type === "ARC" ? Number(entity.endAngle || 0) : null,
      }]
      : [];
  }
  if (type === "LWPOLYLINE" || type === "POLYLINE") {
    const vertices = entity.vertices || [];
    const point = (value: any): Point2 | null => {
      const x = Number(value?.x ?? value?.[0]);
      const y = Number(value?.y ?? value?.[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    };
    const points = vertices.map(point);
    const segmentCount = (entity.closed || entity.shape) ? points.length : points.length - 1;
    const circles: DxfCircle[] = [];
    for (let index = 0; index < segmentCount; index++) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      if (!start || !end) continue;
      const arc = bulgeArc(start, end, Number(vertices[index]?.bulge || 0));
      if (arc) circles.push(arc.circle);
    }
    return circles;
  }
  return [];
}

function angleFallsOnDxfArc(angle: number, circle: DxfCircle): boolean {
  if (circle.startAngle === null || circle.endAngle === null) return true;
  const fullTurn = Math.PI * 2;
  const normalize = (value: number) => ((value % fullTurn) + fullTurn) % fullTurn;
  const start = normalize(circle.startAngle);
  let end = normalize(circle.endAngle);
  const target = normalize(angle);
  if (end <= start) end += fullTurn;
  const adjustedTarget = target < start ? target + fullTurn : target;
  return adjustedTarget >= start && adjustedTarget <= end;
}

function nearestPointOnSegment(point: Point2, start: Point2, end: Point2): Point2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return start;
  const amount = Math.max(0, Math.min(1, (
    (point.x - start.x) * dx + (point.y - start.y) * dy
  ) / lengthSquared));
  return { x: start.x + dx * amount, y: start.y + dy * amount };
}

function DxfPreview({ url }: { url: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [lines, setLines] = useState<Point2[][]>([]);
  const [circles, setCircles] = useState<DxfCircle[]>([]);
  const [error, setError] = useState("");
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [selectedPoints, setSelectedPoints] = useState<Point2[]>([]);
  const [lastSnap, setLastSnap] = useState("");
  useEffect(() => {
    fetch(url).then(async (response) => {
      if (!response.ok) throw new Error("Could not load DXF file.");
      const parsed = new DxfParser().parseSync(await response.text());
      const entities = parsed?.entities || [];
      setLines(entities.flatMap(entityPolylines));
      setCircles(entities.flatMap(entityCircles));
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

  const clearMeasurement = () => {
    setSelectedPoints([]);
    setLastSnap("");
  };
  const selectMeasurementPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!measureEnabled) return;
    const svg = svgRef.current;
    const screenMatrix = svg?.getScreenCTM();
    if (!svg || !screenMatrix) return;
    const inverse = screenMatrix.inverse();
    const modelPoint = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    const nearbyPoint = new DOMPoint(event.clientX + 12, event.clientY).matrixTransform(inverse);
    const pointer = { x: modelPoint.x, y: -modelPoint.y };
    const snapDistance = Math.hypot(nearbyPoint.x - modelPoint.x, nearbyPoint.y - modelPoint.y);

    let snapped: Point2 | null = null;
    let nearestDistance = snapDistance;
    let snapLabel = "";
    for (const circle of circles) {
      const distanceFromCenter = Math.hypot(pointer.x - circle.center.x, pointer.y - circle.center.y);
      const distanceFromEdge = Math.abs(distanceFromCenter - circle.radius);
      const angle = Math.atan2(pointer.y - circle.center.y, pointer.x - circle.center.x);
      if (distanceFromEdge <= nearestDistance && angleFallsOnDxfArc(angle, circle)) {
        nearestDistance = distanceFromEdge;
        snapped = circle.center;
        snapLabel = circle.startAngle === null ? "Circle center" : "Radius center";
      }
    }
    if (!snapped) {
      for (const line of lines) {
        for (let index = 1; index < line.length; index++) {
          const candidate = nearestPointOnSegment(pointer, line[index - 1], line[index]);
          const distance = Math.hypot(pointer.x - candidate.x, pointer.y - candidate.y);
          if (distance <= nearestDistance) {
            nearestDistance = distance;
            snapped = candidate;
            snapLabel = "Edge";
          }
        }
      }
    }
    if (!snapped) {
      setLastSnap("Select closer to drawing geometry");
      return;
    }
    const next = selectedPoints.length === 2 ? [snapped] : [...selectedPoints, snapped];
    setSelectedPoints(next);
    setLastSnap(snapLabel);
  };
  const measurement = selectedPoints.length === 2 ? {
    x: Math.abs(selectedPoints[1].x - selectedPoints[0].x),
    y: Math.abs(selectedPoints[1].y - selectedPoints[0].y),
    distance: Math.hypot(
      selectedPoints[1].x - selectedPoints[0].x,
      selectedPoints[1].y - selectedPoints[0].y,
    ),
  } : null;
  const formatValue = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0$/, "");
  };
  const markerRadius = Math.max(bounds.width, bounds.height) * 0.004;
  return (
    <div className="dxf-measure-preview">
      <svg
        ref={svgRef}
        className="dxf-preview"
        viewBox={`${bounds.minX} ${-(bounds.minY + bounds.height)} ${bounds.width} ${bounds.height}`}
        aria-label="DXF drawing preview"
        onPointerUp={selectMeasurementPoint}
      >
        {lines.map((line, index) => <polyline key={index} points={line.map((point) => `${point.x},${-point.y}`).join(" ")} />)}
        {selectedPoints.length === 2 && (
          <>
            <line
              className="dxf-measurement-line"
              x1={selectedPoints[0].x}
              y1={-selectedPoints[0].y}
              x2={selectedPoints[1].x}
              y2={-selectedPoints[1].y}
            />
            <line
              className="dxf-delta-line axis-x"
              x1={selectedPoints[0].x}
              y1={-selectedPoints[0].y}
              x2={selectedPoints[1].x}
              y2={-selectedPoints[0].y}
            />
            <line
              className="dxf-delta-line axis-y"
              x1={selectedPoints[1].x}
              y1={-selectedPoints[0].y}
              x2={selectedPoints[1].x}
              y2={-selectedPoints[1].y}
            />
          </>
        )}
        {selectedPoints.map((point, index) => (
          <circle className="dxf-measurement-point" key={index} cx={point.x} cy={-point.y} r={markerRadius} />
        ))}
      </svg>
      <div className="step-preview-toolbar dxf-measure-toolbar">
        <button
          type="button"
          className={measureEnabled ? "active" : ""}
          aria-pressed={measureEnabled}
          onClick={() => setMeasureEnabled((enabled) => !enabled)}
        >
          {measureEnabled ? "Stop measuring" : "Measure"}
        </button>
        {selectedPoints.length > 0 && <button type="button" onClick={clearMeasurement}>Clear</button>}
        {measurement ? (
          <span className="step-measurement-result">
            <strong>Axis offsets</strong>
            <span className="step-axis-measurements">
              <b className="axis-x">X&nbsp; {formatValue(measurement.x)}</b>
              <b className="axis-y">Y&nbsp; {formatValue(measurement.y)}</b>
            </span>
            <small>2D diagonal: {formatValue(measurement.distance)} drawing units</small>
          </span>
        ) : (
          <span>
            {measureEnabled
              ? selectedPoints.length === 1
                ? `${lastSnap} selected · select the second point`
                : lastSnap || "Select two edges or circles"
              : "Measurement values use the DXF drawing units"}
          </span>
        )}
      </div>
    </div>
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
  const measureEnabledRef = useRef(false);
  const clearMeasurementRef = useRef<() => void>(() => {});
  const [error, setError] = useState("");
  const [dimensions, setDimensions] = useState<THREE.Vector3 | null>(null);
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [measurementPoints, setMeasurementPoints] = useState(0);
  const [measurement, setMeasurement] = useState<MeasurementResult | null>(null);
  const [lastSnap, setLastSnap] = useState("");

  useEffect(() => {
    measureEnabledRef.current = measureEnabled;
  }, [measureEnabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setError("");
    setDimensions(null);
    setMeasurementPoints(0);
    setMeasurement(null);
    setLastSnap("");
    let disposed = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: TrackballControls | null = null;
    let scene: THREE.Scene | null = null;
    let removeMeasurementListeners = () => {};
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
      controls = new TrackballControls(camera, renderer.domElement);
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
      controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
      controls.rotateSpeed = 1.6;
      controls.zoomSpeed = 0.35;
      controls.panSpeed = 0.45;
      controls.staticMoving = false;
      controls.dynamicDampingFactor = 0.15;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8795a1, 1.4));
      const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(100, 140, 100); scene.add(light);
      const group = new THREE.Group();
      const edgeObjects: THREE.LineSegments[] = [];
      for (const mesh of result.meshes || []) {
        const position = (mesh.attributes?.position?.array || []).flat(Infinity);
        if (!position.length) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
        const normals = (mesh.attributes?.normal?.array || []).flat(Infinity);
        if (normals.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3)); else geometry.computeVertexNormals();
        const indices = (mesh.index?.array || []).flat(Infinity);
        if (indices.length) geometry.setIndex(indices);
        const renderedMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
          color: 0xaabac5,
          roughness: 0.65,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        }));
        const edgeGeometry = new THREE.EdgesGeometry(geometry, 18);
        const renderedEdges = new THREE.LineSegments(
          edgeGeometry,
          new THREE.LineBasicMaterial({ color: 0x142a35 }),
        );
        renderedEdges.userData.circleCenters = circularEdgeCenters(edgeGeometry);
        renderedMesh.add(renderedEdges);
        edgeObjects.push(renderedEdges);
        group.add(renderedMesh);
      }
      if (!group.children.length) throw new Error("STEP file has no renderable geometry.");
      scene.add(group);
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const modelDimensions = box.getSize(new THREE.Vector3());
      setDimensions(modelDimensions);
      const size = Math.max(...modelDimensions.toArray(), 1);
      camera.position.set(center.x + size * 1.8, center.y + size * 1.3, center.z + size * 1.8);
      camera.near = Math.max(size / 1000, 0.1); camera.far = size * 30; camera.updateProjectionMatrix();
      controls.target.copy(center); controls.update();

      const measurementLayer = new THREE.Group();
      scene.add(measurementLayer);
      const selectedPoints: THREE.Vector3[] = [];
      const markerMaterial = new THREE.PointsMaterial({
        color: 0xe87500,
        size: 6,
        sizeAttenuation: false,
        depthTest: false,
      });
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xe87500,
        depthTest: false,
      });
      const deltaLineMaterials = [
        new THREE.LineBasicMaterial({ color: 0xa52f2f, depthTest: false }),
        new THREE.LineBasicMaterial({ color: 0x367638, depthTest: false }),
        new THREE.LineBasicMaterial({ color: 0x315f9b, depthTest: false }),
      ];
      const clearMeasurement = () => {
        selectedPoints.length = 0;
        measurementLayer.children.forEach((object) => {
          if (object instanceof THREE.Line || object instanceof THREE.Points) object.geometry.dispose();
        });
        measurementLayer.clear();
        setMeasurementPoints(0);
        setMeasurement(null);
        setLastSnap("");
      };
      clearMeasurementRef.current = clearMeasurement;
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let pointerDown: { x: number; y: number } | null = null;
      const setPointerRay = (event: PointerEvent) => {
        if (!renderer) return;
        const bounds = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
      };
      const onPointerDown = (event: PointerEvent) => {
        pointerDown = { x: event.clientX, y: event.clientY };
      };
      const onPointerUp = (event: PointerEvent) => {
        if (!measureEnabledRef.current || event.button !== 0 || !pointerDown || !renderer) return;
        const movement = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
        pointerDown = null;
        if (movement > 5) return;
        setPointerRay(event);
        const surfaceHit = raycaster.intersectObjects(group.children, true)
          .find((intersection) => intersection.object instanceof THREE.Mesh);
        if (!surfaceHit) return;
        const worldUnitsPerPixel = (
          2 * surfaceHit.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
        ) / Math.max(renderer.domElement.clientHeight, 1);
        raycaster.params.Line.threshold = worldUnitsPerPixel * 11;
        const edgeHit = raycaster.intersectObjects(edgeObjects, false)
          .find((intersection) => intersection.distance <= surfaceHit.distance + raycaster.params.Line.threshold * 2);
        let point = surfaceHit.point.clone();
        let snapLabel = "Surface point";
        if (edgeHit) {
          point = edgeHit.point.clone();
          snapLabel = "Edge";
          const circleCenters = edgeHit.object.userData.circleCenters as Map<number, THREE.Vector3> | undefined;
          const localCenter = circleCenters?.get(edgeHit.index ?? -1);
          if (localCenter) {
            point = edgeHit.object.localToWorld(localCenter.clone());
            snapLabel = "Circle / radius center";
          }
        }
        if (selectedPoints.length === 2) clearMeasurement();
        selectedPoints.push(point);
        const markerGeometry = new THREE.BufferGeometry().setFromPoints([point]);
        const marker = new THREE.Points(markerGeometry, markerMaterial);
        marker.renderOrder = 10;
        measurementLayer.add(marker);
        setLastSnap(snapLabel);
        setMeasurementPoints(selectedPoints.length);
        if (selectedPoints.length === 2) {
          const lineGeometry = new THREE.BufferGeometry().setFromPoints(selectedPoints);
          const line = new THREE.Line(lineGeometry, lineMaterial);
          line.renderOrder = 10;
          measurementLayer.add(line);
          const deltaCorners = [
            selectedPoints[0],
            new THREE.Vector3(selectedPoints[1].x, selectedPoints[0].y, selectedPoints[0].z),
            new THREE.Vector3(selectedPoints[1].x, selectedPoints[1].y, selectedPoints[0].z),
            selectedPoints[1],
          ];
          for (let index = 0; index < 3; index++) {
            const deltaGeometry = new THREE.BufferGeometry().setFromPoints([
              deltaCorners[index],
              deltaCorners[index + 1],
            ]);
            const deltaLine = new THREE.Line(deltaGeometry, deltaLineMaterials[index]);
            deltaLine.renderOrder = 11;
            measurementLayer.add(deltaLine);
          }
          setMeasurement({
            distance: selectedPoints[0].distanceTo(selectedPoints[1]),
            delta: new THREE.Vector3(
              Math.abs(selectedPoints[1].x - selectedPoints[0].x),
              Math.abs(selectedPoints[1].y - selectedPoints[0].y),
              Math.abs(selectedPoints[1].z - selectedPoints[0].z),
            ),
          });
        }
      };
      const preventContextMenu = (event: MouseEvent) => event.preventDefault();
      renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("contextmenu", preventContextMenu);
      removeMeasurementListeners = () => {
        renderer?.domElement.removeEventListener("pointerdown", onPointerDown, true);
        renderer?.domElement.removeEventListener("pointerup", onPointerUp);
        renderer?.domElement.removeEventListener("contextmenu", preventContextMenu);
        markerMaterial.dispose();
        lineMaterial.dispose();
        deltaLineMaterials.forEach((material) => material.dispose());
      };

      const resize = () => {
        if (!renderer) return;
        const width = container.clientWidth || 700; const height = container.clientHeight || 480;
        renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
        controls?.handleResize();
      };
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize();
      const animate = () => { frame = requestAnimationFrame(animate); controls?.update(); if (renderer && scene) renderer.render(scene, camera); };
      animate();
    }).catch((loadError: unknown) => !disposed && setError(loadError instanceof Error ? loadError.message : "Could not preview STEP file."));
    return () => {
      disposed = true; cancelAnimationFrame(frame); resizeObserver?.disconnect(); removeMeasurementListeners(); controls?.dispose(); renderer?.dispose();
      scene?.traverse((object: any) => { object.geometry?.dispose?.(); object.material?.dispose?.(); });
      clearMeasurementRef.current = () => {};
    };
  }, [url]);
  const formatDimension = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0$/, "");
  };
  return (
    <div className="step-preview">
      <div className="step-preview-canvas" ref={containerRef} />
      {error
        ? <p className="file-preview-error step-preview-message">{error}</p>
        : !dimensions && <p className="file-preview-loading step-preview-message">Loading 3D model…</p>}
      {dimensions && (
        <div className="step-preview-toolbar">
          <button
            type="button"
            className={measureEnabled ? "active" : ""}
            aria-pressed={measureEnabled}
            onClick={() => setMeasureEnabled((enabled) => !enabled)}
          >
            {measureEnabled ? "Stop measuring" : "Measure"}
          </button>
          {(measurementPoints > 0 || measurement !== null) && (
            <button type="button" onClick={() => clearMeasurementRef.current()}>Clear</button>
          )}
          {measurement ? (
            <span className="step-measurement-result">
              <strong>Axis offsets — use the axis running along the tube</strong>
              <span className="step-axis-measurements">
                <b className="axis-x">X&nbsp; {formatDimension(measurement.delta.x)} mm</b>
                <b className="axis-y">Y&nbsp; {formatDimension(measurement.delta.y)} mm</b>
                <b className="axis-z">Z&nbsp; {formatDimension(measurement.delta.z)} mm</b>
              </span>
              <small>3D diagonal: {formatDimension(measurement.distance)} mm — not an axial drilling dimension</small>
            </span>
          ) : (
            <span>
              {measureEnabled
                ? measurementPoints === 1
                  ? `${lastSnap} selected · select the second point`
                  : "Select two points · nearby visible edges snap automatically"
                : "Left-drag pan · right-drag rotate · scroll zoom"}
            </span>
          )}
        </div>
      )}
      {dimensions && (
        <div className="step-preview-dimensions" aria-label="Overall model dimensions">
          <strong>Overall size</strong>
          <span>X {formatDimension(dimensions.x)} × Y {formatDimension(dimensions.y)} × Z {formatDimension(dimensions.z)} mm</span>
        </div>
      )}
    </div>
  );
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
