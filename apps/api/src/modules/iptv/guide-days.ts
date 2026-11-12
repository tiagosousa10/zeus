/** Day keys are civil dates in the requested IANA zone, never UTC start dates. */
export function validGuideZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}
function dayFormatter(timezone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
export function guideDayKey(time: number, timezone: string): string {
  return formatDay(dayFormatter(timezone), time);
}
function formatDay(formatter: Intl.DateTimeFormat, time: number): string {
  const parts = formatter.formatToParts(time);
  const value = (part: string) => parts.find((p) => p.type === part)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
/** Bounded to the availability window; stop is exclusive at local midnight. */
export function overlappingGuideDays(
  programmes: Iterable<{ start: number; stop: number }>,
  timezone: string,
  from: number,
  to: number,
): string[] {
  const days = new Set<string>();
  const formatter = dayFormatter(timezone);
  for (const programme of programmes) {
    const start = Math.max(from, programme.start),
      stop = Math.min(to, programme.stop);
    if (stop <= start) continue;
    const first = formatDay(formatter, start),
      last = formatDay(formatter, stop - 1);
    for (
      let date = Date.parse(first + "T12:00:00Z");
      date <= Date.parse(last + "T12:00:00Z");
      date += 86400000
    )
      days.add(new Date(date).toISOString().slice(0, 10));
  }
  return [...days].sort();
}
