const DEFAULT_PLANT_TIMEZONE = "America/Chicago";

export function getPlantTimeZone(): string {
  return process.env.PLANT_TIMEZONE?.trim() || DEFAULT_PLANT_TIMEZONE;
}

/** SQL Server DATETIME2 string in plant-local civil time (no offset suffix). */
export function plantLocalTimestampForSql(date: Date = new Date()): string {
  const timeZone = getPlantTimeZone();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  const hour = get("hour") === "24" ? "00" : get("hour");

  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

/** Date at 00:00:00 plant-local (matches tblitemhistory.HistDate pattern). */
export function plantLocalDateMidnightForSql(date: Date = new Date()): string {
  const timeZone = getPlantTimeZone();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")} 00:00:00`;
}
