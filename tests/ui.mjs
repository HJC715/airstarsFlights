import assert from "node:assert/strict";
import { chromium } from "/workspace/air-stars-tools/node_modules/playwright/index.mjs";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [];
const baseURL = process.env.AIR_STARS_URL || "http://127.0.0.1:8000/";

async function open(width) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(new URL("?qaPayment=success", baseURL).href);
  await page.locator("#search-form").waitFor();
  return page;
}

async function futureDates(page) {
  return page.evaluate(async () => {
    const { addDays, localDate } = await import("./js/timezone.js");
    const base = addDays(localDate(Date.now(), "Asia/Taipei"), 14);
    return Array.from({ length: 4 }, (_, i) => addDays(base, i * 3));
  });
}

async function snapshot(page) {
  return page.evaluate(async () =>
    structuredClone((await import("./js/state.js")).state),
  );
}

async function assertWidth(page, width) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    width,
    `page must remain within the ${width}px viewport`,
  );
}

async function selectFlights(page, count) {
  await page.locator("[data-select-flight]").first().waitFor();
  for (let i = 0; i < count; i++)
    await page.locator(`[data-select-flight^="${i}|"]`).first().click();
}

async function mobileKeyboardAndRoundTrip() {
  const page = await open(320);
  try {
    await assertWidth(page, 320);
    const dates = await futureDates(page);
    const origin = page.locator('[data-home="0.origin"]');
    await origin.focus();
    await origin.selectOption("KHH");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.home),
      "0.origin",
      "changing an airport must retain keyboard focus",
    );
    await origin.selectOption("TPE");
    await page.locator('[data-home="0.date"]').fill(dates[0]);
    await page.locator('[data-home="1.date"]').fill(dates[3]);
    await page.locator('button[type="submit"]').click();
    await page.locator("[data-select-flight]").first().waitFor();
    const flight = page.locator('[data-select-flight^="0|"]').first();
    const flightKey = await flight.getAttribute("data-select-flight");
    await flight.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.selectFlight),
      flightKey,
      "selecting a flight must retain keyboard focus",
    );
    await page.locator('[data-select-flight^="1|"]').first().click();
    await page.locator("#next").click();
    await page.locator("#demo-data").click();
    await page.locator("#next").click();
    await page.locator("#next").click();
    await assertWidth(page, 320);

    const shell = page.locator(".seat-shell");
    assert(
      await shell.evaluate((el) => el.scrollWidth > el.clientWidth),
      "the mobile seat map must scroll horizontally",
    );
    assert(
      (await page.locator(".seat").first().boundingBox()).width >= 44,
      "seat touch targets must be at least 44px wide",
    );
    await page.locator(".summary summary").click();
    await shell.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    const visibleSeat = await shell.evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      return [...el.querySelectorAll("[data-seat]:not(:disabled)")].find(
        (button) => {
          const box = button.getBoundingClientRect();
          return box.left >= bounds.left && box.right <= bounds.right;
        },
      )?.dataset.seat;
    });
    assert(visibleSeat, "a seat must be reachable after horizontal scrolling");
    const beforeScroll = await shell.evaluate((el) => el.scrollLeft);
    await page
      .locator(`[data-seat="${visibleSeat}"]`)
      .evaluate((el) => el.focus({ preventScroll: true }));
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.seat),
      visibleSeat,
      "selecting a seat must retain keyboard focus",
    );
    assert.equal(await shell.evaluate((el) => el.scrollLeft), beforeScroll);
    assert.equal(
      await page.locator(".summary details").getAttribute("open"),
      "",
    );
    await page.locator(".summary summary").click();
    await page.locator("#auto-seats").click();
    await page.locator("[data-mobile-next]").click();
    await page.locator("[data-mobile-next]").click();
    await page.locator("#review-check").check();
    await page.locator("[data-mobile-next]").click();
    await page.locator("[data-mobile-next]").click();
    await page.locator(".pnr").waitFor({ timeout: 10000 });
    assert.match(await page.locator(".pnr").textContent(), /^[A-Z0-9]{6}$/);
    assert.equal((await snapshot(page)).journeys.length, 2);
    await assertWidth(page, 320);
    console.log(
      "PASS 320px round trip, keyboard focus, seat scrolling, mobile payment",
    );
  } finally {
    await page.close();
  }
}

async function noFlightRecovery() {
  const page = await open(320);
  try {
    const { absent, available } = await page.evaluate(async () => {
      const { addDays, localDate, weekday } = await import("./js/timezone.js");
      let date = addDays(localDate(Date.now(), "Asia/Taipei"), 14);
      while (weekday(date) !== 2) date = addDays(date, 1);
      return { absent: date, available: addDays(date, 1) };
    });
    await page.locator('[data-trip="one-way"]').click();
    await page.locator('[data-home="0.destination"]').selectOption("ORD");
    await page.locator('[data-home="0.date"]').fill(absent);
    await page.locator('button[type="submit"]').click();
    await page.locator(".empty").waitFor();
    assert.equal(await page.locator(".date-tile").count(), 7);
    assert.match(
      await page.locator(`[data-date="0|${absent}"]`).textContent(),
      /無航班/,
    );
    await page.locator(`[data-date="0|${available}"]`).click();
    assert((await page.locator("[data-select-flight]").count()) > 0);
    await assertWidth(page, 320);
    console.log("PASS no-flight date strip and adjacent-date recovery");
  } finally {
    await page.close();
  }
}

async function removeMiddleJourney() {
  const page = await open(768);
  try {
    const dates = await futureDates(page);
    await page.locator('[data-trip="multi-city"]').click();
    await page.locator("#add-leg").click();
    await page.locator("#add-leg").click();
    assert(await page.locator("#add-leg").isDisabled());
    for (let i = 0; i < 4; i++)
      await page.locator(`[data-home="${i}.date"]`).fill(dates[i]);
    await page.locator("#passenger-count").selectOption("2");
    await page.locator('button[type="submit"]').click();
    await selectFlights(page, 4);
    await page.locator("#next").click();
    await page.locator("#demo-data").click();
    await page.locator("#next").click();
    await page.locator('[data-add-bag="2|0"]').click();
    await page.locator("#next").click();
    await page.locator("#auto-seats").click();
    await page.locator("#next").click();
    await page.locator('[data-meal^="2|"]').first().selectOption("SP-VGAN");
    const before = await snapshot(page);
    await page.locator('.steps [data-step="1"]').click();
    await page.locator("#back").click();
    await page.locator('[data-remove-leg="1"]').click();
    await page.locator('button[type="submit"]').click();
    await page.locator(".flight-card.selected").first().waitFor();
    const after = await snapshot(page);
    assert.equal(after.journeys.length, 3);
    for (const [newIndex, oldIndex] of [
      [0, 0],
      [1, 2],
      [2, 3],
    ]) {
      const oldJourney = before.journeys[oldIndex];
      const newJourney = after.journeys[newIndex];
      assert.equal(newJourney.id, oldJourney.id);
      assert.equal(newJourney.option.key, oldJourney.option.key);
      for (const traveler of before.travelers)
        assert.deepEqual(
          after.services[traveler.id][newJourney.id],
          before.services[traveler.id][oldJourney.id],
          "removing a middle journey must retain later journeys' services",
        );
    }
    assert.deepEqual(after.travelers, before.travelers);
    await assertWidth(page, 768);
    console.log(
      "PASS 768px four-city/two-adult booking; removing a middle journey preserves IDs, flights, and services",
    );
  } finally {
    await page.close();
  }
}

try {
  await mobileKeyboardAndRoundTrip();
  await noFlightRecovery();
  await removeMiddleJourney();
  assert.deepEqual(errors, []);
  console.log("PASS UI regression checks; no uncaught JavaScript errors");
} finally {
  await browser.close();
}
