export const CUSTOM_PART_MAX_FILES = 20;
export const CUSTOM_PART_MAX_FILE_BYTES = 50 * 1024 * 1024;

export function isAllowedDrawingFile(filename: string): boolean {
  return filename.trim().length > 0;
}
