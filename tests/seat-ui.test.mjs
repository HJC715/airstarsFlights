import test from "node:test";
import assert from "node:assert/strict";
import { initialState, state, reset } from "../js/state.js";
import { inventory } from "../js/inventory.js";
import { aircraft } from "../js/data.js";
import { nextUnseatedTraveler, toggleSeat } from "../js/seatmap.js";
import {
  seatsView,
  seatContext,
  selectSeat,
  moveSeatFlight,
} from "../js/seat-ui.js";

function fixture() {
  const s = initialState();
  s.passengerCount = 3;
  s.travelers = ["DEMO", "ALEX", "JAMIE"].map((name, i) => ({
    id: "t" + i,
    surname: "TEST",
    givenName: name,
  }));
  const flight = (flightNo, aircraftType) => ({
    flightNo,
    aircraftType,
    departureLocalISODate: "2026-11-02",
    instanceKey: flightNo + "|2026-11-02",
    origin: "TPE",
    destination: "NRT",
  });
  s.journeys = [
    {
      id: "j0",
      family: "Saver",
      cabins: ["Y", "C"],
      option: {
        legs: [flight("ST101", "A321neo"), flight("ST103", "A350-900")],
      },
    },
    {
      id: "j1",
      family: "Basic",
      cabins: ["W"],
      option: { legs: [flight("ST105", "B787-9")] },
    },
  ];
  return s;
}

function currentFreeSeats(s, journeyIndex = 0, legIndex = 0) {
  const journey = s.journeys[journeyIndex];
  const flight = journey.option.legs[legIndex];
  const inv = inventory(flight, journey.cabins[legIndex]);
  return inv.seats.filter((seat) => !inv.occupied.has(seat.id));
}

function installFixture() {
  reset();
  Object.assign(state, fixture());
  Object.assign(seatContext, { journey: 0, leg: 0, traveler: 0 });
}

test("seat clicks fill the earliest unassigned traveler and cancellation leaves a reusable gap", () => {
  const s = fixture();
  const journey = s.journeys[0];
  const flight = journey.option.legs[0];
  const free = currentFreeSeats(s);
  for (let i = 0; i < 3; i++) {
    assert.equal(toggleSeat(s, journey, 0, free[i].id), "");
    assert.equal(s.services["t" + i].j0.seats[flight.instanceKey], free[i].id);
  }
  assert.equal(nextUnseatedTraveler(s, journey, flight), -1);
  const completed = structuredClone(s.services);
  assert.match(toggleSeat(s, journey, 0, free[3].id), /已完成選位/);
  assert.deepEqual(s.services, completed);

  assert.equal(toggleSeat(s, journey, 0, free[1].id), "");
  assert.equal(toggleSeat(s, journey, 0, free[0].id), "");
  assert.equal(nextUnseatedTraveler(s, journey, flight), 0);
  assert.equal(toggleSeat(s, journey, 0, free[3].id), "");
  assert.equal(s.services.t0.j0.seats[flight.instanceKey], free[3].id);
  assert.equal(nextUnseatedTraveler(s, journey, flight), 1);
  assert.equal(toggleSeat(s, journey, 0, free[4].id), "");
  assert.equal(s.services.t1.j0.seats[flight.instanceKey], free[4].id);
  assert.equal(s.services.t2.j0.seats[flight.instanceKey], free[2].id);
  assert.equal(
    new Set(
      s.travelers.map((t) => s.services[t.id].j0.seats[flight.instanceKey]),
    ).size,
    3,
  );
  assert.equal(s.reviewed, false);
});

test("occupied and other-cabin seats cannot be assigned, while an order's own seat remains cancellable", () => {
  const s = fixture();
  const journey = s.journeys[0];
  const flight = journey.option.legs[0];
  const occupied = [...inventory(flight, "Y").occupied][0];
  assert.match(toggleSeat(s, journey, 0, occupied), /占用/);
  assert.match(toggleSeat(s, journey, 0, "1A"), /已購艙等/);
  assert.match(toggleSeat(s, journey, 0, undefined), /有效座位/);
  assert.deepEqual(s.services, {});
  s.services.t0 = {
    j0: { seats: { [flight.instanceKey]: occupied }, meals: {}, bags: [] },
  };
  assert.equal(toggleSeat(s, journey, 0, occupied), "");
  assert.equal(s.services.t0.j0.seats[flight.instanceKey], undefined);
  s.paymentState = "processing";
  assert.match(toggleSeat(s, journey, 0, currentFreeSeats(s)[0].id), /處理中/);
});

test("flight navigation visits all physical legs across journeys and stops at either boundary", () => {
  installFixture();
  assert.equal(moveSeatFlight(-1), false);
  assert.deepEqual(seatContext, { journey: 0, leg: 0, traveler: 0 });
  assert.equal(moveSeatFlight(1), true);
  assert.deepEqual(seatContext, { journey: 0, leg: 1, traveler: 0 });
  assert.equal(moveSeatFlight(1), true);
  assert.deepEqual(seatContext, { journey: 1, leg: 0, traveler: 0 });
  assert.equal(moveSeatFlight(1), false);
  assert.equal(moveSeatFlight(-1), true);
  assert.deepEqual(seatContext, { journey: 0, leg: 1, traveler: 0 });
});

test("the view renders only the purchased cabin, optional seats, and every assigned seat as cancellable", () => {
  installFixture();
  let html = seatsView();
  assert.equal(
    (html.match(/data-seat="/g) || []).length,
    aircraft.A321neo.capacityByCabin.Y,
  );
  assert.match(html, /於報到時由系統隨機安排/);
  assert.match(html, /正在為 成人 1/);
  assert.match(html, /data-seat-direction="-1" disabled/);
  assert.doesNotMatch(html, /seat-cabin-title">商務艙/);
  const free = currentFreeSeats(state);
  for (let i = 0; i < 3; i++) assert.equal(selectSeat(free[i].id), "");
  assert.equal(seatContext.traveler, 3);
  html = seatsView();
  assert.match(html, /本航段所有旅客已完成選位/);
  const assignedButton = html.match(
    new RegExp(`<button[^>]+data-seat="${free[1].id}"[^>]*>`),
  )[0];
  assert.doesNotMatch(assignedButton, /disabled/);
  assert.match(assignedButton, /再按一次取消/);
  assert.equal(selectSeat(free[1].id), "");
  assert.equal(seatContext.traveler, 1);
  assert.match(seatsView(), /正在為 成人 2/);
  assert.equal(moveSeatFlight(1), true);
  html = seatsView();
  assert.equal(
    (html.match(/data-seat="/g) || []).length,
    aircraft["A350-900"].capacityByCabin.C,
  );
  assert.doesNotMatch(html, /seat-cabin-title">經濟艙/);
  assert.equal(moveSeatFlight(1), true);
  assert.match(seatsView(), /data-seat-direction="1" disabled/);
});
