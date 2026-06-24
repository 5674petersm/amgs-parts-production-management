export const CUSTOM_PART_ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".dwg",
  ".dxf",
  ".step",
  ".stp",
  ".iges",
  ".igs",
  ".svg",
]);

export const CUSTOM_PART_MAX_FILES = 20;
export const CUSTOM_PART_MAX_FILE_BYTES = 50 * 1024 * 1024;

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 1) {
    return "";
  }
  return filename.slice(dot).toLowerCase();
}

export function isAllowedDrawingFile(filename: string): boolean {
  return CUSTOM_PART_ALLOWED_EXTENSIONS.has(getFileExtension(filename));
}
