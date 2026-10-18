import { schedules, airportByCode, aircraft } from "./data.js";
import {
  zonedUTC,
  localDate,
  localDateTime,
  weekday,
  addDays,
  bookableDate,
} from "./timezone.js";
import { inventory } from "./inventory.js";
import { itineraryPrice } from "./pricing.js";
import { cabinMultiplier, families } from "../assets/data/fares.js";
export function instances(origin, destination, date, now = Date.now()) {
  if (
    !airportByCode[origin] ||
    !airportByCode[destination] ||
    !Number.isFinite(now) ||
    !bookableDate(date, airportByCode[origin].timeZone, now)
  )
    return [];
  return schedules
    .filter(
      (s) =>
        s.origin === origin &&
        s.destination === destination &&
        s.daysOfWeek.includes(weekday(date)),
    )
    .map((s) => {
      const departureUTC = zonedUTC(
          date,
          s.departureLocalHHmm,
          airportByCode[origin].timeZone,
        ),
        arrivalUTC = departureUTC + s.durationMinutes * 60000;
      return {
        ...s,
        departureLocalISODate: date,
        instanceKey: s.flightNo + "|" + date,
        departureUTC,
        arrivalUTC,
        arrivalLocalISO: localDateTime(
          arrivalUTC,
          airportByCode[destination].timeZone,
        ),
        capacityByCabin: aircraft[s.aircraftType].capacityByCabin,
      };
    })
    .filter((f) => f.departureUTC >= now + 7200000);
}
export function availableCabins(f, count) {
  if (!Number.isInteger(count) || count < 1 || count > 9) return [];
  return Object.keys(aircraft[f.aircraftType].cabins).filter(
    (c) => inventory(f, c).remaining >= count,
  );
}
export function search({
  origin,
  destination,
  date,
  count = 1,
  cabin = "Y",
  family = "Saver",
  now = Date.now(),
}) {
  if (
    origin === destination ||
    !airportByCode[origin] ||
    !airportByCode[destination] ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 9 ||
    !Object.hasOwn(cabinMultiplier, cabin) ||
    !Object.hasOwn(families, family) ||
    !Number.isFinite(now)
  )
    return [];
  const options = instances(origin, destination, date, now).map((f) => ({
    legs: [f],
  }));
  for (const hub of ["TPE", "KHH"]) {
    if ([origin, destination].includes(hub)) continue;
    for (const first of instances(origin, hub, date, now)) {
      const arrivalDay = localDate(
        first.arrivalUTC,
        airportByCode[hub].timeZone,
      );
      for (let offset = 0; offset <= 1; offset++)
        for (const last of instances(
          hub,
          destination,
          addDays(arrivalDay, offset),
          now,
        )) {
          const wait = (last.departureUTC - first.arrivalUTC) / 60000;
          if (wait >= 90 && wait <= 1080)
            options.push({
              legs: [first, last],
              connectionAirport: hub,
              layoverMinutes: wait,
            });
        }
    }
  }
  return options
    .map((o) => {
      o.selectableCabinsByLeg = o.legs.map((f) => availableCabins(f, count));
      o.cabins = o.selectableCabinsByLeg.map((cs) =>
        cs.includes(cabin)
          ? cabin
          : ["Y", "W", "C", "F"].find((c) => cs.includes(c)),
      );
      o.totalTravelMinutes =
        (o.legs.at(-1).arrivalUTC - o.legs[0].departureUTC) / 60000;
      o.key = o.legs.map((f) => f.instanceKey).join(">");
      o.advertisedTotalTWD = o.cabins.every(Boolean)
        ? itineraryPrice(o, o.cabins, family, count, now)
        : Infinity;
      return o;
    })
    .filter((o) => o.cabins.every(Boolean))
    .sort(sorter("price"));
}
export function sorter(mode) {
  return (a, b) => {
    const val = (o) =>
      mode === "departure"
        ? o.legs[0].departureUTC
        : mode === "arrival"
          ? o.legs.at(-1).arrivalUTC
          : mode === "duration"
            ? o.totalTravelMinutes
            : o.advertisedTotalTWD;
    return (
      val(a) - val(b) ||
      a.totalTravelMinutes - b.totalTravelMinutes ||
      a.legs[0].departureUTC - b.legs[0].departureUTC ||
      a.key.localeCompare(b.key)
    );
  };
}
