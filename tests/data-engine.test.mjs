import test from "node:test";
import assert from "node:assert/strict";
import { schedules, validateData } from "../js/data.js";
import { search, availableCabins } from "../js/flights.js";
import { conversionAdjustment } from "../js/pricing.js";
import { currencies } from "../assets/data/currencies.js";

const query = {
  origin: "TPE",
  destination: "NRT",
  date: "2026-11-02",
  now: Date.parse("2026-10-18T00:00:00Z"),
};

test("invalid search inputs cannot produce free, fractional or unsupported bookings", () => {
  for (const extra of [
    { count: 0 },
    { count: 10 },
    { count: 1.5 },
    { count: "2" },
    { cabin: "INVALID" },
    { cabin: "toString" },
    { family: "INVALID" },
    { family: "toString" },
    { now: NaN },
    { date: "2026-02-30" },
  ]) {
    assert.deepEqual(search({ ...query, ...extra }), [], JSON.stringify(extra));
  }
  for (const count of [1, 9]) {
    const options = search({ ...query, count });
    assert(options.length);
    assert(
      options.every((option) => Number.isInteger(option.advertisedTotalTWD)),
    );
  }
  const flight = search(query)[0].legs[0];
  assert.deepEqual(availableCabins(flight, 0), []);
});

test("load validation rejects inconsistent schedule factors, times and paired routes", () => {
  const first = schedules[0];
  for (const [key, invalid] of [
    ["routeDemandFactor", 1.01],
    ["departureLocalHHmm", "24:00"],
    ["durationMinutes", -185],
    ["daysOfWeek", [1, 1]],
    ["destination", "KHH"],
    ["direction", "inbound"],
  ]) {
    const previous = first[key];
    try {
      first[key] = invalid;
      assert.throws(() => validateData(), /資料驗證失敗/);
    } finally {
      first[key] = previous;
    }
  }
  assert.equal(validateData().schedules, 118);
});

test("currency adjustments balance the actual displayed categories or segment rows", () => {
  const breakdown = {
    segmentFaresTWD: [{ amount: 10000 }, { amount: 10000 }],
    segmentTaxesTWD: [{ amount: 600 }, { amount: 600 }],
    fare: 20000,
    tax: 1200,
    seats: 350,
    bags: 1800,
    totalTWD: 23350,
  };
  const categories = [
    breakdown.fare,
    breakdown.tax,
    breakdown.seats,
    breakdown.bags,
  ];
  const segments = [
    ...breakdown.segmentFaresTWD.map((row) => row.amount),
    ...breakdown.segmentTaxesTWD.map((row) => row.amount),
    breakdown.seats,
    breakdown.bags,
  ];
  assert.notEqual(
    conversionAdjustment(breakdown, "USD"),
    conversionAdjustment(breakdown, "USD", segments),
  );
  for (const [currency, [rate, digits]] of Object.entries(currencies)) {
    const scale = 10 ** digits;
    for (const amounts of [categories, segments]) {
      const displayedRows = amounts.reduce(
        (sum, amount) => sum + Math.round((amount / rate) * scale),
        0,
      );
      const adjustment = conversionAdjustment(breakdown, currency, amounts);
      assert.equal(
        displayedRows + Math.round(adjustment * scale),
        Math.round((breakdown.totalTWD / rate) * scale),
        currency,
      );
    }
    assert.equal(
      conversionAdjustment(breakdown, currency),
      conversionAdjustment(breakdown, currency, categories),
    );
  }
  assert.equal(breakdown.totalTWD, 23350);
});
