import test from "node:test";
import assert from "node:assert/strict";
import {
  NO_MEAL,
  mealOptions,
  specialMealOptions,
  mealSelections,
  mealDescription,
  validMealSelections,
  serviceCount,
} from "../js/meals.js";
import { ensureMeals, mealsView } from "../js/meal-ui.js";

const flight = {
  instanceKey: "ST607|2026-11-02",
  flightNo: "ST607",
  origin: "TPE",
  destination: "JFK",
  durationMinutes: 960,
};
function order(cabin) {
  return {
    selectedCurrency: "TWD",
    travelers: [
      { id: "t0", surname: "TEST", givenName: "DEMO" },
      { id: "t1", surname: "SAMPLE", givenName: "TRAVELER" },
    ],
    journeys: [{ id: "j0", cabins: [cabin], option: { legs: [flight] } }],
    services: {
      t0: {
        j0: { seats: { [flight.instanceKey]: "1A" }, bags: [23], meals: {} },
      },
    },
  };
}

test("economy cabins only reserve special meals; premium cabins add three breakfasts", () => {
  for (const cabin of ["Y", "W"])
    for (let index = 0; index < serviceCount(flight); index++)
      assert.deepEqual(mealOptions(flight, cabin, index), [
        [NO_MEAL, "無需求"],
      ]);
  for (const cabin of ["C", "F"]) {
    const choices = mealOptions(flight, cabin, 0).map(([code]) => code);
    assert.deepEqual(choices, [
      "P01",
      "P02",
      "P03",
      "P04",
      "B01",
      "B02",
      "B03",
    ]);
    assert(choices.every((code) => !code.startsWith("SP-")));
  }
  assert.equal(specialMealOptions()[0][0], NO_MEAL);
  assert.equal(specialMealOptions().length, 6);
  assert.equal(serviceCount({ durationMinutes: 180 }), 1);
  assert.equal(serviceCount({ durationMinutes: 480 }), 1);
  assert.equal(serviceCount({ durationMinutes: 900 }), 2);
  assert.equal(serviceCount(flight), 3);
});

test("meal defaults cover every traveler and service without changing seats or bags", () => {
  for (const cabin of ["Y", "W", "C", "F"]) {
    const booking = order(cabin);
    ensureMeals(booking);
    for (const traveler of booking.travelers) {
      const service = booking.services[traveler.id].j0;
      assert.deepEqual(
        service.meals[flight.instanceKey],
        Array(3).fill(["C", "F"].includes(cabin) ? "P01" : NO_MEAL),
      );
      assert.equal(service.specialMeals[flight.instanceKey], NO_MEAL);
      assert(validMealSelections(flight, cabin, service));
    }
    assert.deepEqual(booking.services.t0.j0.seats, {
      [flight.instanceKey]: "1A",
    });
    assert.deepEqual(booking.services.t0.j0.bags, [23]);
  }
});

test("one special request takes precedence on every service and preserves premium main courses", () => {
  const booking = order("C");
  ensureMeals(booking);
  const service = booking.services.t0.j0;
  service.meals[flight.instanceKey] = ["P02", "B01", "P04"];
  service.specialMeals[flight.instanceKey] = "SP-VGAN";
  ensureMeals(booking);
  assert.deepEqual(service.meals[flight.instanceKey], ["P02", "B01", "P04"]);
  assert.deepEqual(
    mealSelections(flight, "C", service).map(
      (selection) => selection.effectiveCode,
    ),
    Array(3).fill("SP-VGAN"),
  );
  const description = mealDescription(flight, "C", service);
  assert.match(description, /炭烤牛排/);
  assert.match(description, /起司歐姆蛋/);
  assert.match(description, /特殊餐需求：全素/);
  assert.match(description, /全段每次餐飲優先供應/);
  service.specialMeals[flight.instanceKey] = NO_MEAL;
  ensureMeals(booking);
  assert.deepEqual(
    mealSelections(flight, "C", service).map(
      (selection) => selection.effectiveCode,
    ),
    ["P02", "B01", "P04"],
  );
  assert.match(mealDescription(flight, "Y"), /特殊餐需求：無需求/);
  assert(!mealDescription(flight, "F").includes("undefined"));
});

test("meal validation rejects wrong cabin dishes, special codes, and incomplete services", () => {
  const booking = order("Y");
  ensureMeals(booking);
  const service = booking.services.t0.j0;
  service.meals[flight.instanceKey][0] = "P01";
  assert(!validMealSelections(flight, "Y", service));
  service.meals[flight.instanceKey][0] = NO_MEAL;
  service.specialMeals[flight.instanceKey] = "SP-UNKNOWN";
  assert(!validMealSelections(flight, "Y", service));
  delete service.specialMeals[flight.instanceKey];
  assert(validMealSelections(flight, "Y", service));
  service.meals[flight.instanceKey].pop();
  assert(!validMealSelections(flight, "Y", service));
  service.meals[flight.instanceKey] = Array(3);
  assert(!validMealSelections(flight, "Y", service));
  service.meals[flight.instanceKey] = Array(3).fill(NO_MEAL);
  assert(!validMealSelections(flight, "INVALID", service));
});

test("meal UI hides standard selection for Y/W and separates premium main and special selectors", () => {
  for (const cabin of ["Y", "W", "C", "F"]) {
    const booking = order(cabin);
    booking.travelers[0].givenName = "<TEST>";
    const html = mealsView(booking);
    assert.equal((html.match(/data-special-meal=/g) || []).length, 2);
    assert.equal(
      (html.match(/data-meal=/g) || []).length,
      ["C", "F"].includes(cabin) ? 6 : 0,
    );
    assert.equal((html.match(/value="NONE" selected/g) || []).length, 2);
    assert(html.includes("&lt;TEST&gt;"));
    if (["C", "F"].includes(cabin)) {
      assert(html.includes("早餐"));
      assert(html.includes("特殊餐需求優先於主菜預選"));
    }
  }
});
