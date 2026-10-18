const formatters = new Map();
export function localParts(instant, timeZone) {
  if (!formatters.has(timeZone))
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    );
  return Object.fromEntries(
    formatters
      .get(timeZone)
      .formatToParts(new Date(instant))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
}
export function localDate(instant = Date.now(), zone = "Asia/Taipei") {
  const p = localParts(instant, zone);
  return `${p.year}-${p.month}-${p.day}`;
}
export function localDateTime(instant, zone) {
  const p = localParts(instant, zone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
export function zonedUTC(date, time, zone) {
  const [y, m, d] = date.split("-").map(Number),
    [hh, mm] = time.split(":").map(Number),
    target = Date.UTC(y, m - 1, d, hh, mm);
  let candidate = target;
  for (let i = 0; i < 6; i++) {
    const p = localParts(candidate, zone),
      asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute),
      delta = target - asUTC;
    candidate += delta;
    if (!delta) return candidate;
  }
  throw new Error("無法解算機場當地時間");
}
export const addDays = (date, n) =>
  new Date(Date.parse(date + "T12:00:00Z") + n * 864e5)
    .toISOString()
    .slice(0, 10);
export const dayDiff = (a, b) =>
  Math.round(
    (Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 864e5,
  );
export const weekday = (date) => new Date(date + "T12:00:00Z").getUTCDay() || 7;
export const dateValid = (d) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !Number.isNaN(Date.parse(d + "T12:00:00Z")) &&
  new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d;
export function bookableDate(d, zone, now = Date.now()) {
  return (
    dateValid(d) &&
    dayDiff(d, localDate(now, zone)) >= 0 &&
    dayDiff(d, localDate(now, zone)) <= 364
  );
}
