/**
 * Weeks are identified by their Monday, as an ISO date string ("2026-10-12").
 * All math here is done on calendar dates in UTC so it never drifts with the
 * host's timezone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Not an ISO date: ${iso}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (toIsoDate(date) !== iso) throw new Error(`Not a real date: ${iso}`);
  return date;
}

export function isIsoDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

export function isMonday(iso: string): boolean {
  return isIsoDate(iso) && parseIsoDate(iso).getUTCDay() === 1;
}

/** The Monday of the week containing `today` (UTC calendar date). */
export function mondayOf(today: Date = new Date()): string {
  const utc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const offset = (utc.getUTCDay() + 6) % 7; // Monday → 0, Sunday → 6
  return toIsoDate(new Date(utc.getTime() - offset * DAY_MS));
}

export function addWeeks(monday: string, weeks: number): string {
  return toIsoDate(new Date(parseIsoDate(monday).getTime() + weeks * 7 * DAY_MS));
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(iso).getTime() + days * DAY_MS));
}

/** Plans may be written for last week, this week or next week. */
export function plannableWeeks(today: Date = new Date()): string[] {
  const current = mondayOf(today);
  return [addWeeks(current, -1), current, addWeeks(current, 1)];
}

export function canPlanWeek(monday: string, today: Date = new Date()): boolean {
  return plannableWeeks(today).includes(monday);
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function weekLabel(monday: string, today: Date = new Date()): string {
  const current = mondayOf(today);
  if (monday === current) return "This week";
  if (monday === addWeeks(current, -1)) return "Last week";
  if (monday === addWeeks(current, 1)) return "Next week";
  return `Week of ${SHORT.format(parseIsoDate(monday))}`;
}

/** "Oct 12 – Oct 16": Monday to Friday. */
export function weekRange(monday: string): string {
  return `${SHORT.format(parseIsoDate(monday))} – ${SHORT.format(parseIsoDate(addDays(monday, 4)))}`;
}

/**
 * The parts of `instant` as seen on a wall clock in `timeZone`.
 * Used by the reminder job to decide whether it's Monday 09:00 for a user.
 */
export function zonedParts(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date,
    weekday: weekdays.indexOf(parts.weekday ?? ""),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    monday: mondayOf(parseIsoDate(date)),
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
