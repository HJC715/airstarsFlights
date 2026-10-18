import { distance, airportByCode } from "./data.js";
import { inventory } from "./inventory.js";
import { localDate, dayDiff } from "./timezone.js";
import {
  cabinMultiplier,
  families,
  baggage,
  seatFees,
  familyIndex,
  mileage,
  distanceBands,
} from "../assets/data/fares.js";
import { currencies } from "../assets/data/currencies.js";
import { calendar } from "../assets/data/calendar.js";
export function foreignMoney(amount, c = "TWD") {
  const digits = currencies[c][1];
  return (
    c +
    " " +
    amount.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}
export function money(twd, c = "TWD") {
  return foreignMoney(twd / currencies[c][0], c);
}
export function season(date) {
  const md = date.slice(5),
    hits = calendar.filter(([s, e]) =>
      s <= e ? md >= s && md <= e : md >= s || md <= e,
    );
  return hits.length ? Math.max(...hits.map((x) => x[2])) : 1;
}
export function segmentPrice(f, c, family, now = Date.now()) {
  const km = distance(f.origin, f.destination),
    [, base, tax] = distanceBands.find((x) => km <= x[0]);
  const days = dayDiff(
    f.departureLocalISODate,
    localDate(now, airportByCode[f.origin].timeZone),
  );
  const advance = days <= 7 ? 1.35 : days <= 30 ? 1.2 : days <= 90 ? 1 : 0.9;
  const inv = inventory(f, c),
    ratio = inv.total ? inv.remaining / inv.total : 0;
  const remaining = ratio > 0.5 ? 1 : ratio >= 0.2 ? 1.1 : 1.25;
  return {
    fare: Math.round(
      base *
        f.routeDemandFactor *
        cabinMultiplier[c] *
        families[family].multiplier *
        season(f.departureLocalISODate) *
        advance *
        remaining,
    ),
    tax,
    km,
    advance,
    season: season(f.departureLocalISODate),
    remaining,
  };
}
export function seatPrice(c, family, seat) {
  if (!seat) return 0;
  if ("FC".includes(c)) return 0;
  const level = { standard: 0, preferred: 1, extraLegroom: 2 }[seat.category];
  const free = { Y: [-1, 0, 1], W: [0, 1, 2] }[c][familyIndex(family)];
  return level <= free ? 0 : seatFees[seat.category];
}
export function allowance(j) {
  const entries = j.option.legs.map((f, i) => baggage[j.cabins[i]]);
  return {
    pieces: Math.min(...entries.map((b) => b[familyIndex(j.family)])),
    kg: Math.min(...entries.map((b) => b[3])),
    hand: Math.min(...j.cabins.map((c) => ("FC".includes(c) ? 2 : 1))),
  };
}
export const intercontinental = (j) =>
  j.option.legs.some((f) =>
    [f.origin, f.destination].some((c) =>
      ["EU", "NA", "OC"].includes(airportByCode[c].region),
    ),
  );
export const bagPrice = (j, kg) =>
  (intercontinental(j) ? { 23: 4000, 32: 6000 } : { 23: 1800, 32: 2800 })[kg];
export function itineraryPrice(
  option,
  cabins,
  family,
  count,
  now = Date.now(),
) {
  return option.legs.reduce((sum, f, i) => {
    const p = segmentPrice(f, cabins[i], family, now);
    return sum + (p.fare + p.tax) * count;
  }, 0);
}
export function calculateOrder(state) {
  const b = {
    segmentFaresTWD: [],
    segmentTaxesTWD: [],
    seatFeesTWD: [],
    extraBagFeesTWD: [],
    fare: 0,
    tax: 0,
    seats: 0,
    bags: 0,
    totalTWD: 0,
  };
  for (const j of state.journeys.filter((j) => j.option)) {
    j.option.legs.forEach((f, i) => {
      const p = segmentPrice(f, j.cabins[i], j.family, state.quoteNow);
      b.segmentFaresTWD.push({
        journeyId: j.id,
        flight: f.flightNo,
        cabin: j.cabins[i],
        unit: p.fare,
        count: state.passengerCount,
        amount: p.fare * state.passengerCount,
      });
      b.segmentTaxesTWD.push({
        flight: f.flightNo,
        unit: p.tax,
        count: state.passengerCount,
        amount: p.tax * state.passengerCount,
      });
      state.travelers.forEach((t) => {
        const id = state.services[t.id]?.[j.id]?.seats?.[f.instanceKey];
        const seat = inventory(f, j.cabins[i]).seats.find((s) => s.id === id);
        const amount = seatPrice(j.cabins[i], j.family, seat);
        b.seatFeesTWD.push({
          travelerId: t.id,
          flight: f.flightNo,
          seat: id,
          amount,
        });
      });
    });
    state.travelers.forEach((t) =>
      (state.services[t.id]?.[j.id]?.bags || []).forEach((kg) =>
        b.extraBagFeesTWD.push({
          travelerId: t.id,
          journeyId: j.id,
          kg,
          amount: bagPrice(j, kg),
        }),
      ),
    );
  }
  for (const [key, arr] of [
    ["fare", "segmentFaresTWD"],
    ["tax", "segmentTaxesTWD"],
    ["seats", "seatFeesTWD"],
    ["bags", "extraBagFeesTWD"],
  ])
    b[key] = b[arr].reduce((s, x) => s + x.amount, 0);
  b.totalTWD = b.fare + b.tax + b.seats + b.bags;
  return b;
}
export function conversionAdjustment(
  b,
  c,
  amounts = [b.fare, b.tax, b.seats, b.bags],
) {
  const [rate, digits] = currencies[c],
    scale = 10 ** digits;
  return (
    (Math.round((b.totalTWD / rate) * scale) -
      amounts.reduce(
        (s, amount) => s + Math.round((amount / rate) * scale),
        0,
      )) /
    scale
  );
}
export function miles(j) {
  return j.option.legs.reduce(
    (s, f, i) =>
      s +
      Math.round(
        (distance(f.origin, f.destination) / 1.609344) *
          mileage[j.cabins[i]][familyIndex(j.family)],
      ),
    0,
  );
}
