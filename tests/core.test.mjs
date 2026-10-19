import test from "node:test";
import assert from "node:assert/strict";
import {
  validateData,
  aircraft,
  schedules,
  routes,
  distance,
} from "../js/data.js";
import {
  zonedUTC,
  localDateTime,
  localDate,
  addDays,
  bookableDate,
} from "../js/timezone.js";
import { search, instances, sorter } from "../js/flights.js";
import { hash, inventory } from "../js/inventory.js";
import {
  segmentPrice,
  season,
  seatPrice,
  allowance,
  calculateOrder,
  itineraryPrice,
  conversionAdjustment,
  money,
} from "../js/pricing.js";
import { initialState } from "../js/state.js";
import {
  clearJourneyServices,
  validateSeats,
  validateTravelers,
  validateFlights,
} from "../js/booking.js";
import { autoSeats } from "../js/seatmap.js";
import { serviceCount, mealOptions } from "../js/meals.js";
const now = Date.parse("2026-10-18T00:00:00Z");
const query = {
  origin: "TPE",
  destination: "NRT",
  date: "2026-11-02",
  count: 2,
  now,
};
function order() {
  const option = search(query)[0],
    s = initialState();
  s.quoteNow = now;
  s.passengerCount = 2;
  s.travelers = [{ id: "t0" }, { id: "t1" }];
  s.journeys = [
    {
      id: "j0",
      origin: "TPE",
      destination: "NRT",
      date: query.date,
      option,
      cabins: option.cabins,
      family: "Saver",
    },
  ];
  s.services = {
    t0: { j0: { seats: {}, meals: {}, bags: [] } },
    t1: { j0: { seats: {}, meals: {}, bags: [] } },
  };
  return s;
}
test("complete static schedule and exact unique seat capacities", () => {
  assert.deepEqual(validateData(), {
    airports: 32,
    routes: 38,
    schedules: 118,
    aircraft: 8,
  });
  assert.equal(
    aircraft["A330-900neo"].seats.filter((s) => s.cabin === "W" && s.row === 14)
      .length,
    4,
  );
  assert.equal(routes.filter((r) => r.baseAirport === "KHH").length, 8);
  assert(!schedules.some((s) => s.origin === "TPE" && s.destination === "KHH"));
  assert.equal(distance("TPE", "NRT"), distance("NRT", "TPE"));
});
test("IANA UTC conversion handles DST and negative arrival date", () => {
  assert.equal(
    new Date(
      zonedUTC("2026-07-15", "09:00", "America/Los_Angeles"),
    ).toISOString(),
    "2026-07-15T16:00:00.000Z",
  );
  assert.equal(
    new Date(
      zonedUTC("2026-12-15", "09:00", "America/Los_Angeles"),
    ).toISOString(),
    "2026-12-15T17:00:00.000Z",
  );
  for (const zone of [
    "Europe/London",
    "Europe/Paris",
    "Pacific/Auckland",
    "America/Chicago",
  ])
    assert.equal(
      localDateTime(zonedUTC("2027-03-29", "09:25", zone), zone),
      "2027-03-29 09:25",
    );
  assert(bookableDate("2027-10-16", "Asia/Taipei", now));
  assert(!bookableDate("2027-10-18", "Asia/Taipei", now));
});
test("direct and at most one real hub connection, including overnight", () => {
  const direct = search(query);
  assert(direct.length);
  assert(direct.every((o) => o.legs.length === 1));
  const options = search({ ...query, origin: "NRT", destination: "LHR" });
  assert(options.length);
  for (const o of options) {
    assert.equal(o.legs.length, 2);
    assert(["TPE", "KHH"].includes(o.connectionAirport));
    assert(o.layoverMinutes >= 90 && o.layoverMinutes <= 1080);
    assert(o.legs[1].departureUTC > o.legs[0].arrivalUTC);
    assert.equal(o.legs[0].destination, o.legs[1].origin);
  }
  assert.equal(
    search({ ...query, origin: "TPE", destination: "KHH" }).length,
    0,
  );
  assert.equal(
    search({ ...query, origin: "NRT", destination: "NRT" }).length,
    0,
  );
  assert.equal(instances("TPE", "ORD", "2026-11-01", now).length, 0);
});
test("FNV-1a occupancy is stable, sold inventory is never searchable", () => {
  assert.equal(hash("hello"), 0x4f9f2cab);
  const f = search(query)[0].legs[0],
    inv = inventory(f, "Y");
  assert.deepEqual([...inventory({ ...f }, "Y").occupied], [...inv.occupied]);
  assert.equal(inv.remaining + inv.occupied.size, inv.total);
  for (let n = 0; n < 365; n++) {
    const date = addDays("2026-10-18", n);
    for (const x of instances("TPE", "NRT", date, now)) {
      const v = inventory(x, "F");
      if (!v.remaining)
        assert(
          !search({ ...query, date, cabin: "F" })
            .find((o) => o.legs[0].instanceKey === x.instanceKey)
            ?.cabins.includes("F"),
        );
    }
  }
});
test("fare uses required multiplicative factors, taxes stay unchanged", () => {
  const f = search(query)[0].legs[0],
    p = segmentPrice(f, "Y", "Saver", now),
    c = segmentPrice(f, "C", "Flex", now);
  assert.equal(p.fare, Math.round(7000 * 1.1 * 0.85 * 0.9 * 1.2 * p.remaining));
  assert.equal(p.tax, 900);
  assert.equal(c.tax, 900);
  assert.equal(season("2027-01-01"), 1.25);
  assert.equal(season("2027-03-01"), 0.9);
  assert.equal(season("2027-10-15"), 1);
  assert.equal(seatPrice("C", "Saver", { category: "extraLegroom" }), 0);
  assert.equal(seatPrice("Y", "Basic", { category: "standard" }), 0);
  assert.equal(seatPrice("Y", "Saver", { category: "standard" }), 350);
});
test("multi-person seat assignment prevents duplicates and sums selected extras", () => {
  const s = order(),
    base = calculateOrder(s);
  assert.equal(
    base.totalTWD,
    itineraryPrice(s.journeys[0].option, s.journeys[0].cabins, "Saver", 2, now),
  );
  const auto = autoSeats(s);
  assert.equal(auto.assignments.length, 2);
  assert.notEqual(auto.assignments[0].id, auto.assignments[1].id);
  for (const a of auto.assignments)
    s.services[a.tid][a.jid].seats[a.key] = a.id;
  assert.equal(validateSeats(s), "");
  s.services.t0.j0.bags = [23, 32];
  const b = calculateOrder(s);
  assert.equal(b.bags, 4600);
  assert.equal(b.seats, auto.cost);
  assert.equal(b.totalTWD, base.totalTWD + b.seats + 4600);
  s.services.t1.j0.seats[auto.assignments[0].key] = auto.assignments[0].id;
  assert(validateSeats(s));
});
test("mixed cabins through baggage uses minimum allowance and one-direction bag charge", () => {
  const s = order(),
    o = search({ ...query, origin: "NRT", destination: "LHR" })[0],
    j = s.journeys[0];
  j.option = o;
  j.cabins = ["Y", "C"];
  j.family = "Flex";
  assert.deepEqual(allowance(j), { pieces: 2, kg: 23, hand: 1 });
  s.services.t0.j0.bags = [23];
  assert.equal(calculateOrder(s).bags, 4000);
});
test("dependent journey reset preserves unaffected journey and passenger data", () => {
  const s = order();
  s.services.t0.j1 = {
    seats: { flight: "1A" },
    meals: { flight: ["S01"] },
    bags: [32],
  };
  s.travelers[0].surname = "TEST";
  clearJourneyServices(s, "j0");
  assert.equal(s.travelers[0].surname, "TEST");
  assert.deepEqual(s.services.t0.j1.bags, [32]);
  assert.deepEqual(s.services.t0.j0.seats, {});
});
test("meal frequency and special menus match duration and cabin", () => {
  assert.equal(serviceCount({ durationMinutes: 180 }), 1);
  assert.equal(serviceCount({ durationMinutes: 480 }), 1);
  assert.equal(serviceCount({ durationMinutes: 900 }), 2);
  assert.equal(serviceCount({ durationMinutes: 930 }), 3);
  assert(
    mealOptions({ durationMinutes: 160 }, "Y", 0).some((m) => m[0] === "NONE"),
  );
  assert(
    mealOptions({ durationMinutes: 160 }, "C", 0).some((m) => m[0] === "P02"),
  );
  assert(
    mealOptions({ durationMinutes: 930 }, "F", 2).some((m) => m[0] === "B03"),
  );
});
test("currency conversions retain TWD and explicitly balance displayed rounding", () => {
  assert.equal(money(12800), "TWD 12,800");
  assert.equal(money(12800, "USD"), "USD 402.52");
  const b = calculateOrder(order()),
    before = b.totalTWD;
  for (const c of ["TWD", "USD", "EUR", "GBP", "JPY", "KRW", "HKD", "CNY"])
    assert(Number.isFinite(conversionAdjustment(b, c)));
  assert.equal(b.totalTWD, before);
});
