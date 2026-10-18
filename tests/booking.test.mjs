import test from "node:test";
import assert from "node:assert/strict";
import { state, reset, initialState } from "../js/state.js";
import { pay } from "../js/payment.js";
import { search } from "../js/flights.js";
import {
  validateFlights,
  validateTravelers,
  validateSeats,
  validateMeals,
  clearJourneyServices,
} from "../js/booking.js";

const now = Date.parse("2026-10-18T00:00:00Z");
function order() {
  const s = initialState();
  s.tripType = "one-way";
  s.quoteNow = now;
  s.travelers = [
    {
      id: "t0",
      title: "MX",
      surname: "TEST",
      givenName: "DEMO",
      birthDate: "1990-01-15",
      nationality: "TW",
      passportNumber: "TEST0000",
      passportIssueCountry: "TW",
      passportExpiry: "2030-01-01",
    },
  ];
  s.contact = {
    name: "虛構測試旅客",
    email: "demo@example.com",
    phone: "+886 000000000",
  };
  const option = search({
    origin: "TPE",
    destination: "NRT",
    date: "2026-11-02",
    now,
  })[0];
  s.journeys = [
    {
      id: "j0",
      origin: "TPE",
      destination: "NRT",
      date: "2026-11-02",
      option,
      cabins: [...option.cabins],
      family: "Saver",
    },
  ];
  s.services = { t0: { j0: { seats: {}, meals: {}, bags: [23] } } };
  return s;
}

test("leaving a completed booking clears every order field and keeps display currency", () => {
  Object.assign(state, order(), {
    selectedCurrency: "USD",
    reviewed: true,
    card: "DEMO-VIRTUAL",
    paymentError: "舊錯誤",
    paymentState: "completed",
    confirmation: { pnr: "ABC123" },
    priceBreakdown: { totalTWD: 9999 },
    unrecognizedOrderField: "舊訂單",
  });
  reset();
  assert.equal(state.selectedCurrency, "USD");
  assert.equal(state.reviewed, false);
  assert.equal(state.card, "DEMO-GOLD");
  assert.equal(state.paymentError, "");
  assert.equal(state.confirmation, null);
  assert.equal(state.priceBreakdown, null);
  assert.equal("unrecognizedOrderField" in state, false);
  assert.deepEqual(state.travelers, []);
  assert.deepEqual(state.services, {});
});

test("incomplete orders return validation errors instead of passing or throwing", () => {
  const s = order();
  assert.equal(validateFlights(s, now), "");
  assert.deepEqual(validateTravelers(s), {});
  s.journeys.push({ id: "j1", option: null });
  assert.match(validateFlights(s, now), /每個航程/);
  assert.match(validateTravelers(s).order, /每個航程/);
  assert.match(validateSeats(s), /每個航程/);
  assert.match(validateMeals(s), /每個航程/);
  s.journeys = [];
  assert.match(validateFlights(s, now), /搜尋/);
  assert.ok(validateTravelers(s).order);
});

test("passenger validation enforces count, adult age, and optional passport expiry", () => {
  const s = order();
  s.passengerCount = 2;
  assert.ok(validateTravelers(s).order);
  s.passengerCount = 1;
  s.travelers[0].birthDate = "2008-11-02";
  assert.deepEqual(validateTravelers(s), {});
  s.travelers[0].birthDate = "2008-11-03";
  assert.ok(validateTravelers(s)["t0.birthDate"]);
  s.travelers[0].birthDate = "1990-01-15";
  s.travelers[0].passportExpiry = "2026-11-02";
  assert.ok(validateTravelers(s)["t0.passportExpiry"]);
  s.travelers[0].passportNumber = "";
  assert.deepEqual(validateTravelers(s), {});
});

test("flight validation rejects stale dates, unsupported cabins, and invalid connections", () => {
  const s = order();
  s.journeys[0].date = "2026-11-03";
  assert.match(validateFlights(s, now), /不一致/);
  s.journeys[0].date = "2026-11-02";
  s.journeys[0].cabins = ["INVALID"];
  assert.match(validateFlights(s, now), /艙等/);
  s.passengerCount = 10;
  assert.match(validateFlights(s, now), /1–9/);
  s.passengerCount = 1;
  const option = structuredClone(
    search({ origin: "NRT", destination: "LHR", date: "2026-11-02", now })[0],
  );
  assert.ok(option);
  Object.assign(s.journeys[0], {
    origin: "NRT",
    destination: "LHR",
    option,
    cabins: option.cabins,
  });
  assert.equal(validateFlights(s, now), "");
  const second = option.legs[1];
  second.departureUTC = option.legs[0].arrivalUTC + 721 * 60000;
  second.arrivalUTC = second.departureUTC + second.durationMinutes * 60000;
  assert.equal(validateFlights(s, now), "");
  second.departureUTC = option.legs[0].arrivalUTC + 1080 * 60000;
  second.arrivalUTC = second.departureUTC + second.durationMinutes * 60000;
  assert.equal(validateFlights(s, now), "");
  second.departureUTC = option.legs[0].arrivalUTC + 1081 * 60000;
  second.arrivalUTC = second.departureUTC + second.durationMinutes * 60000;
  assert.match(validateFlights(s, now), /18 小時/);
});

test("journey changes invalidate consent and payment data while preserving other services", () => {
  const s = order();
  s.reviewed = true;
  s.paymentState = "failed";
  s.paymentError = "模擬授權失敗";
  s.services.t0.j1 = {
    seats: { old: "1A" },
    meals: { old: ["S01"] },
    bags: [32],
  };
  const kept = structuredClone(s.services.t0.j1);
  clearJourneyServices(s, "j0");
  assert.equal(s.reviewed, false);
  assert.equal(s.paymentState, "reviewed");
  assert.equal(s.paymentError, "");
  assert.deepEqual(s.services.t0.j1, kept);
  assert.deepEqual(s.services.t0.j0, { seats: {}, meals: {}, bags: [] });
  assert.equal(s.travelers[0].surname, "TEST");
});

test("payment freezes the submitted order and rejects repeat submissions", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(Math, "random", () => 0.5);
  const s = order();
  const pending = pay(s, "success");
  assert.equal(s.paymentState, "processing");
  await assert.rejects(pay(s, "success"), /處理或完成/);
  s.travelers[0].surname = "CHANGED";
  s.services.t0.j0.bags.push(32);
  t.mock.timers.tick(3999);
  assert.equal(s.paymentState, "processing");
  t.mock.timers.tick(1);
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(s.paymentState, "completed");
  assert.match(result.confirmation.pnr, /^[A-Z0-9]{6}$/);
  assert.match(
    result.confirmation.ticketsByTravelerId.t0,
    /^ST-ETK-[A-Z0-9]{8}$/,
  );
  const snapshot = result.confirmation.frozenBookingSnapshot;
  assert.equal(snapshot.travelers[0].surname, "TEST");
  assert.deepEqual(snapshot.services.t0.j0.bags, [23]);
  assert.equal(snapshot.priceBreakdown.bags, 1800);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.travelers[0]));
  assert.throws(() => snapshot.services.t0.j0.bags.push(32), TypeError);
  await assert.rejects(pay(s, "success"), /處理或完成/);
});

test("ordinary payment uses the 98% boundary and failed orders can retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const values = [0, 0.98, 0];
  t.mock.method(Math, "random", () => values.shift() ?? 0);
  const s = order();
  const before = structuredClone(s.services);
  let pending = pay(s);
  t.mock.timers.tick(3000);
  const failed = await pending;
  assert.equal(failed.success, false);
  assert.equal(s.paymentState, "failed");
  assert.equal(s.confirmation, null);
  assert.deepEqual(s.services, before);
  values.push(0, 0.979999);
  pending = pay(s);
  t.mock.timers.tick(3000);
  const success = await pending;
  assert.equal(success.success, true);
  assert.equal(s.paymentState, "completed");
});
