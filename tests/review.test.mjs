import test from "node:test";
import assert from "node:assert/strict";
import { initialState, state, freezeBookingSnapshot } from "../js/state.js";
import { search } from "../js/flights.js";
import {
  calculateOrder,
  conversionAdjustment,
  foreignMoney,
  money,
} from "../js/pricing.js";
import { serviceCount } from "../js/meals.js";
import { reviewView } from "../js/review-ui.js";
import { itineraryLines } from "../js/pdf.js";

function booking() {
  Object.assign(state, initialState());
  state.quoteNow = Date.parse("2026-10-18T00:00:00Z");
  state.passengerCount = 2;
  state.selectedCurrency = "USD";
  const option = search({
    origin: "NRT",
    destination: "LHR",
    date: "2026-11-02",
    count: 2,
    now: state.quoteNow,
  })[0];
  state.journeys = [
    {
      id: "j0",
      origin: "NRT",
      destination: "LHR",
      date: "2026-11-02",
      option,
      cabins: ["Y", "C"],
      family: "Saver",
    },
  ];
  state.travelers = [
    {
      id: "t0",
      title: "MS",
      surname: "TEST",
      givenName: "ALPHA",
      birthDate: "1990-01-01",
      nationality: "TW",
    },
    {
      id: "t1",
      title: "MR",
      surname: "TEST",
      givenName: "BETA",
      birthDate: "1991-02-02",
      nationality: "JP",
    },
  ];
  state.contact = {
    name: "測試聯絡人",
    email: "alpha@example.com",
    phone: "+886900000000",
  };
  for (const traveler of state.travelers)
    state.services[traveler.id] = {
      j0: {
        seats: {},
        bags: traveler.id === "t0" ? [23] : [],
        meals: Object.fromEntries(
          option.legs.map((flight, li) => [
            flight.instanceKey,
            Array.from({ length: serviceCount(flight) }, (_, n) =>
              li ? ["P02", "B01", "B03"][n] : "NONE",
            ),
          ]),
        ),
        specialMeals: Object.fromEntries(
          option.legs.map((flight) => [
            flight.instanceKey,
            traveler.id === "t0" ? "SP-VGAN" : "NONE",
          ]),
        ),
      },
    };
  state.confirmation = {
    pnr: "REVIEW",
    completedAtUTC: "2026-10-18T23:58:00Z",
    ticketsByTravelerId: { t0: "ST-ETK-REVIEW01", t1: "ST-ETK-REVIEW02" },
  };
  return state;
}

test("shared review shows all connecting-flight services and editable sections", () => {
  const order = booking();
  const html = reviewView();
  for (const flight of order.journeys[0].option.legs)
    assert(html.includes(flight.flightNo));
  for (const text of [
    "Asia/Tokyo",
    "Asia/Taipei",
    "Europe/London",
    "同機場轉機",
    "經濟艙",
    "商務艙",
    "超值 Saver",
    "TEST / ALPHA",
    "TEST / BETA",
    "免費託運",
    "23 kg",
    "alpha@example.com",
    "炭烤牛排",
    "起司歐姆蛋佐烤番茄",
    "特殊餐需求：全素",
    "特殊餐需求：無需求",
  ])
    assert(html.includes(text), text);
  for (let step = 1; step <= 5; step++)
    assert(html.includes(`data-step="${step}"`));
  assert(html.includes('id="review-check"'));
  assert(!html.includes("undefined"));
  assert(!html.includes("ST-ETK-REVIEW01"));
});

test("unselected seats stay free and have the same clear wording in review and PDF", () => {
  booking();
  const breakdown = calculateOrder(state);
  assert.equal(breakdown.seats, 0);
  const html = reviewView();
  const pdf = itineraryLines(state)
    .map((line) => line.text)
    .join("\n");
  for (const content of [html, pdf]) {
    assert(content.includes("於報到時由系統隨機安排"));
    assert(content.includes("不收取預選座位費"));
    assert(!content.includes("undefined"));
  }
  assert(!pdf.includes("座位 undefined"));
  assert(pdf.includes("主菜預選：第 1 餐 炭烤牛排"));
  assert(pdf.includes("起司歐姆蛋佐烤番茄"));
  assert(pdf.includes("特殊餐需求：全素（全段每次餐飲優先供應）"));
});

test("completed cards preserve the purchased snapshot and follow current display currency", () => {
  booking();
  const breakdown = calculateOrder(state);
  state.confirmation.frozenBookingSnapshot = freezeBookingSnapshot(
    state,
    breakdown,
  );
  state.travelers[0].givenName = "CHANGED";
  state.contact.email = "changed@example.com";
  state.services.t0.j0.bags = [];
  state.services.t0.j0.specialMeals = {};
  state.selectedCurrency = "EUR";
  const html = reviewView(true);
  assert(html.includes("TEST / ALPHA"));
  assert(html.includes("alpha@example.com"));
  assert(html.includes("特殊餐需求：全素"));
  assert(html.includes("ST-ETK-REVIEW01"));
  assert(html.includes("ST-ETK-REVIEW02"));
  assert(html.includes(money(breakdown.totalTWD, "EUR")));
  assert(html.includes(money(breakdown.totalTWD)));
  assert(!html.includes("CHANGED"));
  assert(!html.includes("changed@example.com"));
  assert(!html.includes("data-step="));
  assert(!html.includes("review-check"));
});

test("review currency rounding balances the detailed amounts actually displayed", () => {
  booking();
  const breakdown = calculateOrder(state);
  for (const currency of ["USD", "EUR", "GBP", "JPY", "KRW", "HKD", "CNY"]) {
    state.selectedCurrency = currency;
    const adjustment = conversionAdjustment(breakdown, currency, [
      ...breakdown.segmentFaresTWD.map((item) => item.amount),
      ...breakdown.segmentTaxesTWD.map((item) => item.amount),
      breakdown.seats,
      breakdown.bags,
    ]);
    const html = reviewView();
    assert(html.includes(money(breakdown.totalTWD, currency)));
    assert.equal(html.includes("匯率換算尾差"), Boolean(adjustment));
    if (adjustment) assert(html.includes(foreignMoney(adjustment, currency)));
  }
});
