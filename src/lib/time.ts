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

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Plant-local calendar date as YYYY-MM-DD. */
export function plantLocalCalendarDate(date: Date = new Date()): string {
  const timeZone = getPlantTimeZone();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function plantLocalWeekdayIndex(date: Date = new Date()): number {
  const timeZone = getPlantTimeZone();
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

/** Shift a plant-local calendar date by a number of days. */
export function addPlantCalendarDays(ymd: string, deltaDays: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0);
  return plantLocalCalendarDate(new Date(utcNoon + deltaDays * 86_400_000));
}

/** Monday–Sunday week containing the given date in plant-local time. */
export function plantLocalWeekRange(date: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const today = plantLocalCalendarDate(date);
  const weekday = plantLocalWeekdayIndex(date);
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const startDate = addPlantCalendarDays(today, -daysFromMonday);
  const endDate = addPlantCalendarDays(startDate, 6);
  return { startDate, endDate };
}

export function isCalendarDateString(value: string): boolean {
  return CALENDAR_DATE_RE.test(value);
}

/** Inclusive calendar dates → SQL range using plant-local midnight boundaries. */
export function plantLocalDateRangeToSql(
  startDate: string,
  endDate: string,
): { start: string; endExclusive: string } {
  if (!isCalendarDateString(startDate) || !isCalendarDateString(endDate)) {
    throw new Error("Invalid date range.");
  }
  if (startDate > endDate) {
    throw new Error("Start date must be on or before end date.");
  }

  return {
    start: `${startDate} 00:00:00`,
    endExclusive: `${addPlantCalendarDays(endDate, 1)} 00:00:00`,
  };
}
