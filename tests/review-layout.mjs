import { chromium } from "/workspace/air-stars-tools/node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const output = "/tmp/air-stars-results";
await fs.mkdir(output, { recursive: true });
try {
  const errors = [];
  for (const width of [320, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.AIR_STARS_URL || "http://127.0.0.1:8000/");
    await page.locator("#search-form").waitFor();
    await page.evaluate(async () => {
      const { state, initialState, freezeBookingSnapshot } =
        await import("./js/state.js");
      const { search } = await import("./js/flights.js");
      const { calculateOrder } = await import("./js/pricing.js");
      const { serviceCount } = await import("./js/meals.js");
      const { render } = await import("./js/ui.js");
      Object.assign(state, initialState(), {
        quoteNow: Date.parse("2026-10-18T00:00:00Z"),
        passengerCount: 2,
        selectedCurrency: "USD",
        screen: "booking",
        activeStep: 6,
        maxStep: 6,
      });
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
          surname: "LONG-SURNAME-TO-CHECK-MOBILE-WRAPPING",
          givenName: "A-LONG-GIVEN-NAME-FOR-LAYOUT",
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
        email: "long-address-for-small-viewport@example.com",
        phone: "+886900000000",
      };
      for (const traveler of state.travelers)
        state.services[traveler.id] = {
          j0: {
            seats: {},
            bags: traveler.id === "t0" ? [23, 32] : [],
            meals: Object.fromEntries(
              option.legs.map((f, i) => [
                f.instanceKey,
                Array.from({ length: serviceCount(f) }, (_, n) =>
                  i ? ["P02", "B01", "B03"][n] : "NONE",
                ),
              ]),
            ),
            specialMeals: Object.fromEntries(
              option.legs.map((f) => [
                f.instanceKey,
                traveler.id === "t0" ? "SP-VGAN" : "NONE",
              ]),
            ),
          },
        };
      state.confirmation = {
        pnr: "REVIEW",
        completedAtUTC: "2026-10-18T23:58:00Z",
        ticketsByTravelerId: { t0: "ST-ETK-REVIEW01", t1: "ST-ETK-REVIEW02" },
        frozenBookingSnapshot: freezeBookingSnapshot(
          state,
          calculateOrder(state),
        ),
      };
      render();
    });
    const checkWidth = async () =>
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
        `review must fit a ${width}px viewport`,
      );
    await checkWidth();
    assert.equal(await page.locator(".review-passenger-card").count(), 2);
    assert.equal(await page.locator(".review-flight").count(), 2);
    assert.equal(await page.locator("#review-check").count(), 1);
    assert(
      (await page.locator(".review-board").innerText()).includes(
        "於報到時由系統隨機安排",
      ),
    );
    assert(
      !(await page.locator(".review-board").innerText()).includes("undefined"),
    );
    for (const button of await page.locator(".review-edit").all())
      assert((await button.boundingBox()).height >= 44);
    await page.locator(".review-terms summary").first().focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator(".review-terms").first().getAttribute("open"),
      "",
    );
    await checkWidth();
    await page.screenshot({
      path: `${output}/review-${width}.png`,
      fullPage: true,
    });
    await page.evaluate(async () => {
      const { state } = await import("./js/state.js");
      state.screen = "confirmation";
      state.selectedCurrency = "EUR";
      state.travelers[0].givenName = "CHANGED";
      (await import("./js/ui.js")).render();
    });
    await checkWidth();
    assert.equal(await page.locator(".review-edit, #review-check").count(), 0);
    assert.equal(await page.locator(".review-electronic-ticket").count(), 2);
    const completed = await page.locator(".review-board").innerText();
    assert(completed.includes("ST-ETK-REVIEW01"));
    assert(completed.includes("EUR"));
    assert(!completed.includes("CHANGED"));
    await page.screenshot({
      path: `${output}/confirmation-review-${width}.png`,
      fullPage: true,
    });
    console.log(
      `PASS ${width}px shared review and confirmation cards: timeline, services, editable controls, frozen booking, currency, no overflow`,
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
