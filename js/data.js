import { airports } from "../assets/data/airports.js";
import { routes } from "../assets/data/routes.js";
import { schedules } from "../assets/data/schedules.js";
import { aircraft } from "../assets/data/aircraft.js";
export { airports, routes, schedules, aircraft };
export const airportByCode = Object.fromEntries(
  airports.map((a) => [a.code, a]),
);
export function distance(a, b) {
  a = airportByCode[a];
  b = airportByCode[b];
  const rad = (x) => (x * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
for (const r of routes) {
  r.distanceKm = distance(r.baseAirport, r.overseasAirport);
  r.region = airportByCode[r.overseasAirport].region;
  r.flightPairs = schedules
    .filter((s) => s.routeKey === r.routeKey && s.direction === "outbound")
    .map((s) => s.flightNo);
}
export function validateData() {
  const assert = (ok, msg) => {
    if (!ok) throw new Error("資料驗證失敗：" + msg);
  };
  assert(
    airports.length === 32 && new Set(airports.map((a) => a.code)).size === 32,
    "機場",
  );
  for (const a of airports) {
    assert(/^[A-Z]{3}$/.test(a.code) && a.nameZh, "機場識別資料");
    assert(
      Number.isFinite(a.lat) &&
        Math.abs(a.lat) <= 90 &&
        Number.isFinite(a.lon) &&
        Math.abs(a.lon) <= 180,
      a.code + " 座標",
    );
    let supportedZone = typeof a.timeZone === "string" && a.timeZone.length > 0;
    try {
      new Intl.DateTimeFormat("en", { timeZone: a.timeZone }).format(0);
    } catch {
      supportedZone = false;
    }
    assert(supportedZone, a.code + " IANA 時區");
  }
  assert(
    routes.length === 38 && new Set(routes.map((r) => r.routeKey)).size === 38,
    "航線",
  );
  const routeByKey = new Map(routes.map((r) => [r.routeKey, r]));
  for (const r of routes) {
    assert(
      ["TPE", "KHH"].includes(r.baseAirport) &&
        airportByCode[r.overseasAirport] &&
        !["TPE", "KHH"].includes(r.overseasAirport) &&
        r.routeKey === `${r.baseAirport}-${r.overseasAirport}`,
      r.routeKey + " 航線起訖",
    );
    assert(
      Number.isFinite(r.demandFactor) &&
        r.demandFactor >= 0.9 &&
        r.demandFactor <= 1.2,
      r.routeKey + " 航線需求",
    );
    assert(
      r.distanceKm === distance(r.baseAirport, r.overseasAirport) &&
        r.distanceKm === distance(r.overseasAirport, r.baseAirport),
      r.routeKey + " 航線距離",
    );
  }
  assert(
    routes.filter((r) => r.baseAirport === "TPE").length === 30,
    "桃園航線覆蓋",
  );
  assert(
    routes
      .filter((r) => r.baseAirport === "KHH")
      .map((r) => r.overseasAirport)
      .sort()
      .join() ===
      ["NRT", "KIX", "FUK", "CTS", "ICN", "PUS", "HKG", "SIN"].sort().join(),
    "高雄航線覆蓋",
  );
  assert(
    schedules.length === 118 &&
      new Set(schedules.map((s) => s.flightNo)).size === 118,
    "班號",
  );
  const expected = {
    A320neo: [0, 8, 0, 150],
    A321neo: [0, 12, 0, 180],
    "A330-900neo": [0, 28, 28, 216],
    "B787-9": [8, 28, 28, 189],
    "B787-10": [8, 36, 35, 225],
    "A350-900": [8, 36, 32, 252],
    "A350-1000": [8, 44, 40, 288],
    "B777-300ER": [8, 40, 40, 300],
  };
  assert(
    Object.keys(aircraft).length === Object.keys(expected).length &&
      Object.keys(expected).every((type) => aircraft[type]),
    "八種機型",
  );
  for (const [type, a] of Object.entries(aircraft)) {
    assert(
      new Set(a.seats.map((s) => s.id)).size === a.seats.length,
      type + " 座位重複",
    );
    ["F", "C", "W", "Y"].forEach((c, i) =>
      assert(
        (a.capacityByCabin[c] || 0) === expected[type][i],
        type + " " + c + " 容量",
      ),
    );
  }
  const scheduleByNo = new Map(schedules.map((s) => [s.flightNo, s]));
  for (const s of schedules) {
    assert(
      airportByCode[s.origin] &&
        airportByCode[s.destination] &&
        s.origin !== s.destination,
      "起訖",
    );
    assert(aircraft[s.aircraftType], "機型");
    assert(
      s.daysOfWeek.length &&
        new Set(s.daysOfWeek).size === s.daysOfWeek.length &&
        s.daysOfWeek.every((d) => Number.isInteger(d) && d >= 1 && d <= 7),
      "營運日",
    );
    assert(
      /^([01]\d|2[0-3]):[0-5]\d$/.test(s.departureLocalHHmm),
      s.flightNo + " 起飛時間",
    );
    assert(
      Number.isInteger(s.durationMinutes) && s.durationMinutes > 0,
      s.flightNo + " 飛行分鐘",
    );
    const route = routeByKey.get(s.routeKey);
    assert(route, "航線鍵");
    assert(
      s.routeDemandFactor === route.demandFactor,
      s.flightNo + " 航線需求一致性",
    );
    const outbound = s.direction === "outbound";
    assert(
      ["outbound", "inbound"].includes(s.direction) &&
        s.origin === (outbound ? route.baseAirport : route.overseasAirport) &&
        s.destination ===
          (outbound ? route.overseasAirport : route.baseAirport),
      s.flightNo + " 航線方向",
    );
    assert(/^ST\d{3}$/.test(s.flightNo), "班號格式");
    const number = Number(s.flightNo.slice(2));
    assert(number % 2 === (outbound ? 1 : 0), s.flightNo + " 班號方向");
    const paired = scheduleByNo.get("ST" + (number + (outbound ? 1 : -1)));
    assert(
      paired &&
        paired.origin === s.destination &&
        paired.destination === s.origin &&
        paired.routeKey === s.routeKey &&
        paired.aircraftType === s.aircraftType &&
        paired.daysOfWeek.join() === s.daysOfWeek.join(),
      s.flightNo + " 去回班表配對",
    );
  }
  for (const r of routes)
    assert(
      schedules.some((s) => s.routeKey === r.routeKey),
      r.routeKey + " 缺少班表",
    );
  return { airports: 32, routes: 38, schedules: 118, aircraft: 8 };
}
validateData();
