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

async function assertNoPanelAnimation(page) {
  assert.equal(await page.locator("#main.view-enter").count(), 0);
  assert(
    await page
      .locator(".panel")
      .evaluateAll((panels) =>
        panels.every(
          (panel) => getComputedStyle(panel).animationName === "none",
        ),
      ),
    "changing a selection must not replay panel entrance animations",
  );
}

async function cardContrast(page) {
  return page.locator('[data-card="DEMO-VIRTUAL"]').evaluate((card) => {
    const components = (color) =>
      color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    const luminance = (rgb) =>
      rgb.reduce((total, value, i) => {
        const channel = value / 255;
        return (
          total +
          (channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4) *
            [0.2126, 0.7152, 0.0722][i]
        );
      }, 0);
    const style = getComputedStyle(card);
    const backgrounds = style.backgroundImage.match(/rgba?\([^)]+\)/g) || [
      style.backgroundColor,
    ];
    const texts = [...card.querySelectorAll("strong, span, small")];
    return Math.min(
      ...texts.flatMap((text) =>
        backgrounds.map((background) => {
          const first = luminance(components(getComputedStyle(text).color));
          const second = luminance(components(background));
          return (
            (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
          );
        }),
      ),
    );
  });
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
    await page.locator("#passenger-count").selectOption("3");
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
    await assertNoPanelAnimation(page);
    await page.locator('[data-select-flight^="1|"]').first().click();
    assert.equal(
      await page
        .locator(".summary-line > span")
        .filter({ hasText: /^附加服務$/ })
        .count(),
      0,
    );
    await page.locator("#next").click();
    await page.locator("#demo-data").click();
    await page.locator("#next").click();
    await page.locator("#next").click();
    await assertWidth(page, 320);

    const expectedSeats = await page.evaluate(async () => {
      const { state } = await import("./js/state.js");
      const { aircraft } = await import("./js/data.js");
      const journey = state.journeys[0];
      return aircraft[journey.option.legs[0].aircraftType].capacityByCabin[
        journey.cabins[0]
      ];
    });
    assert.equal(await page.locator("[data-seat]").count(), expectedSeats);
    assert.equal(await page.locator(".seat-cabin-title").count(), 1);
    for (const direction of [-1, 1]) {
      const button = page.locator(`[data-seat-direction="${direction}"]`);
      assert(
        await button.isVisible(),
        "both mobile segment buttons must remain visible",
      );
      assert.equal(
        await button.evaluate((el) => getComputedStyle(el).color),
        "rgb(19, 40, 71)",
      );
    }
    assert(await page.locator('[data-seat-direction="-1"]').isDisabled());

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
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator(".seat.selected").count(),
      0,
      "pressing an assigned seat cancels it",
    );
    await page.locator(".summary summary").click();
    const chosen = await page
      .locator("[data-seat]:not(:disabled)")
      .evaluateAll((buttons) =>
        buttons.slice(0, 3).map((button) => button.dataset.seat),
      );
    const assignments = async () => {
      const order = await snapshot(page);
      const journey = order.journeys[0];
      const key = journey.option.legs[0].instanceKey;
      return order.travelers.map(
        (traveler) => order.services[traveler.id]?.[journey.id]?.seats[key],
      );
    };
    for (const seat of chosen)
      await page.locator(`[data-seat="${seat}"]`).click();
    assert.deepEqual(
      await assignments(),
      chosen,
      "three clicks assign travelers A, B, and C in order",
    );
    assert.match(
      await page.locator(".seat-current-traveler").textContent(),
      /已完成/,
    );
    await page.locator(`[data-seat="${chosen[1]}"]`).click();
    await page.locator(`[data-seat="${chosen[0]}"]`).click();
    assert.match(
      await page.locator(".seat-current-traveler").textContent(),
      /成人 1/,
    );
    await page.locator(`[data-seat="${chosen[0]}"]`).click();
    assert.match(
      await page.locator(".seat-current-traveler").textContent(),
      /成人 2/,
    );
    await page.locator(`[data-seat="${chosen[1]}"]`).click();
    assert.deepEqual(
      await assignments(),
      chosen,
      "new selections refill the earliest canceled travelers",
    );
    await assertNoPanelAnimation(page);
    await page.locator('[data-seat-direction="1"]').click();
    assert(await page.locator('[data-seat-direction="1"]').isDisabled());
    assert(await page.locator('[data-seat-direction="-1"]').isEnabled());
    assert.match(
      await page.locator(".seat-current-traveler").textContent(),
      /成人 1/,
    );
    assert.match(
      await page.locator(".seat-traveler-list").textContent(),
      /於報到時由系統隨機安排/,
    );
    await page.locator("[data-mobile-next]").click();
    assert.equal(
      (await snapshot(page)).activeStep,
      5,
      "an entirely unselected segment must allow continuing",
    );
    assert.equal(await page.locator("[data-meal]").count(), 0);
    assert.equal(
      await page.locator("[data-special-meal]").first().inputValue(),
      "NONE",
    );
    await page.locator("[data-mobile-next]").click();
    assert.match(
      await page.locator("#step-content").textContent(),
      /於報到時由系統隨機安排/,
    );
    await page.locator("#review-check").check();
    await page.locator("[data-mobile-next]").click();
    assert(
      (await cardContrast(page)) >= 4.5,
      "JCB text must contrast with every gradient endpoint",
    );
    await page.locator('[data-card="DEMO-VIRTUAL"]').click();
    await page.locator('[data-card="DEMO-VIRTUAL"]').hover();
    assert(
      (await cardContrast(page)) >= 4.5,
      "selected and hovered JCB text must remain readable",
    );
    assert.doesNotMatch(
      await page.locator("#step-content").textContent(),
      /成功率|98%|3[–-]5\s*秒|實際扣款/,
    );
    await page.locator("[data-mobile-next]").click();
    await page.locator("#finish-payment").waitFor({ timeout: 10000 });
    assert.equal(await page.locator(".pnr").count(), 0);
    const authorized = await snapshot(page);
    assert.equal(authorized.activeStep, 7);
    assert.equal(authorized.paymentState, "completed");
    await page.locator("[data-mobile-next]").click();
    await page.locator(".pnr").waitFor();
    assert.match(await page.locator(".pnr").textContent(), /^[A-Z0-9]{6}$/);
    assert.equal((await snapshot(page)).journeys.length, 2);
    await assertWidth(page, 320);
    console.log(
      "PASS 320px three-person round trip: focus/scroll, sequential seats/cancellation, optional seats, JCB contrast, authorization then completion",
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
    await page.locator('[data-bag-change="2|0|23|1"]').click();
    await page.locator("#next").click();
    await page.locator("#auto-seats").click();
    await page.locator("#next").click();
    await page
      .locator('[data-special-meal^="2|"]')
      .first()
      .selectOption("SP-VGAN");
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
