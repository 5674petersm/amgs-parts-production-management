export const CUSTOM_PART_PROCESSES = ["cut", "weld", "mesh", "cnc", "bend"] as const;

export type CustomPartProcess = (typeof CUSTOM_PART_PROCESSES)[number];

export const CUSTOM_PART_PROCESS_LABELS: Record<CustomPartProcess, string> = {
  cut: "Cut",
  weld: "Weld",
  mesh: "Mesh",
  cnc: "CNC",
  bend: "Bend",
};

export function normalizeCustomPartProcesses(values: Iterable<unknown>): CustomPartProcess[] {
  const selected = new Set([...values].map((value) => String(value).trim().toLowerCase()));
  return CUSTOM_PART_PROCESSES.filter((process) => selected.has(process));
}

export function parseCustomPartProcesses(value: string | null | undefined): CustomPartProcess[] {
  return normalizeCustomPartProcesses(String(value || "").split(","));
}

export function serializeCustomPartProcesses(values: Iterable<unknown>): string {
  return normalizeCustomPartProcesses(values).join(",");
}
