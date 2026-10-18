import { chromium } from "/workspace/air-stars-tools/node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const output = "/tmp/air-stars-results";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const allErrors = [];
async function run(
  name,
  { mobile = false, fail = false, multi = false, connection = false } = {},
) {
  const ctx = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    acceptDownloads: true,
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => allErrors.push(name + ": " + e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(
    "http://127.0.0.1:8000/?qaPayment=" + (fail ? "fail" : "success"),
  );
  await p.locator("#search-form").waitFor();
  if (multi) {
    await p.getByRole("tab", { name: "多城市" }).click();
    await p.locator("#passenger-count").selectOption("2");
  } else await p.getByRole("tab", { name: "單程", exact: true }).click();
  if (connection) {
    await p.locator('[data-home="0.origin"]').selectOption("NRT");
    await p.locator('[data-home="0.destination"]').selectOption("LHR");
  }
  assert.equal(await p.locator('button[data-step="7"]').count(), 0);
  await p.getByRole("button", { name: "搜尋航班" }).click();
  await p.locator("[data-select-flight]").first().waitFor();
  for (let ji = 0; ji < (multi ? 2 : 1); ji++)
    await p.locator(`[data-select-flight^="${ji}|"]`).first().click();
  if (connection) {
    assert.equal(await p.locator(".selected [data-flight-cabin]").count(), 2);
    await p.locator(".selected [data-flight-cabin]").nth(1).selectOption("C");
    await p.locator(".selected [data-flight-family]").selectOption("Flex");
    const mixed = await p.evaluate(async () => {
      const { state } = await import("./js/state.js");
      return state.journeys[0].cabins;
    });
    assert.deepEqual(mixed, ["Y", "C"]);
  }
  assert(await p.locator('[data-step="7"]').isDisabled());
  await p.locator("#next").click();
  await p.locator("#next").click();
  assert((await p.locator('[aria-invalid="true"]').count()) > 0);
  await p.locator("#demo-data").click();
  await p.locator("#next").click();
  await p.locator("[data-add-bag]").first().click();
  const base = await p.evaluate(async () => {
    const { state } = await import("./js/state.js");
    const { calculateOrder } = await import("./js/pricing.js");
    return calculateOrder(state);
  });
  assert.equal(base.bags, connection ? 4000 : 1800);
  await p.locator("#currency").selectOption("USD");
  const after = await p.evaluate(async () => {
    const { state } = await import("./js/state.js");
    const { calculateOrder } = await import("./js/pricing.js");
    return calculateOrder(state).totalTWD;
  });
  assert.equal(after, base.totalTWD);
  await p.locator("#next").click();
  await p.locator(".seat-map").waitFor();
  const available = p.locator(".seat:not(:disabled)").first();
  await available.click();
  assert.equal(await p.locator(".seat.selected").count(), 1);
  await p.locator("#auto-seats").click();
  await p.waitForTimeout(450);
  await p.screenshot({
    path: output + "/" + name + "-seats.png",
    fullPage: true,
  });
  await p.locator("#next").click();
  await p.locator("[data-meal]").first().selectOption("SP-VGAN");
  if (connection) {
    const before = await p.evaluate(async () => {
      const { state } = await import("./js/state.js");
      return structuredClone(state.services.t0.j0);
    });
    await p.locator('.steps [data-step="1"]').click();
    await p.locator(".selected [data-flight-family]").selectOption("Basic");
    assert.deepEqual(
      await p.evaluate(async () => {
        const { state } = await import("./js/state.js");
        return state.services.t0.j0;
      }),
      before,
      "changing only fare rights preserves all selected services",
    );
    const firstCabin = p.locator(".selected [data-flight-cabin]").first();
    const alternative = await firstCabin.evaluate(
      (el) => [...el.options].find((o) => o.value !== el.value)?.value,
    );
    assert(alternative, "connection fixture needs an alternative cabin");
    await firstCabin.selectOption(alternative);
    const changed = await p.evaluate(async () => {
      const { state } = await import("./js/state.js");
      const [first, second] = state.journeys[0].option.legs;
      const sv = state.services.t0.j0;
      return { first: first.instanceKey, second: second.instanceKey, sv };
    });
    assert.equal(changed.sv.seats[changed.first], undefined);
    assert.equal(changed.sv.meals[changed.first], undefined);
    assert.equal(
      changed.sv.seats[changed.second],
      before.seats[changed.second],
    );
    assert.deepEqual(
      changed.sv.meals[changed.second],
      before.meals[changed.second],
    );
    assert.deepEqual(changed.sv.bags, before.bags);
    await p.locator("#next").click();
    await p.locator("#next").click();
    await p.locator("#next").click();
    await p.locator("#auto-seats").click();
    await p.locator("#next").click();
  }
  if (multi) {
    const kept = await p.evaluate(async () => {
      const { state } = await import("./js/state.js");
      return JSON.stringify(state.services.t0.j1);
    });
    await p.locator('.steps [data-step="1"]').click();
    await p
      .locator('.flight-card:not(.selected) [data-select-flight^="0|"]')
      .first()
      .click();
    const dependency = await p.evaluate(async () => {
      const { state } = await import("./js/state.js");
      return {
        cleared: Object.keys(state.services.t0.j0.seats).length,
        kept: JSON.stringify(state.services.t0.j1),
        surname: state.travelers[0].surname,
      };
    });
    assert.equal(dependency.cleared, 0);
    assert.equal(dependency.kept, kept);
    assert.equal(dependency.surname, "TEST");
    await p.locator("#next").click();
    await p.locator("#next").click();
    await p.locator("#next").click();
    await p.locator("#auto-seats").click();
    await p.locator("#next").click();
  }
  if (mobile) await p.locator("[data-mobile-next]").click();
  else await p.locator("#next").click();
  await p.locator("#review-check").check();
  await p.locator("#next").click();
  await p.locator('[data-card="DEMO-VIRTUAL"]').click();
  const start = Date.now();
  await p.locator("#pay").click();
  assert(
    await p.locator("body").evaluate((el) => el.classList.contains("busy")),
  );
  assert(await p.locator("#currency").isDisabled());
  if (fail) {
    await p.locator("#pay").waitFor({ timeout: 10000 });
    assert(await p.locator("#currency").isEnabled());
    assert(Date.now() - start >= 2900);
    assert(await p.getByText("訂單已保留", { exact: false }).count());
    const retained = await p.evaluate(async () => {
      const { state } = await import("./js/state.js");
      return state.services.t0.j0.bags.length;
    });
    assert.equal(retained, 1);
    await p.evaluate(() =>
      history.replaceState({}, "", location.pathname + "?qaPayment=success"),
    );
    await p.locator("#pay").click();
  }
  await p.locator(".pnr").waitFor({ timeout: 10000 });
  assert(await p.locator("#currency").isEnabled());
  await p.locator("#currency").selectOption("EUR");
  assert.match(await p.locator(".pnr").textContent(), /^[A-Z0-9]{6}$/);
  const state = await p.evaluate(async () => {
    const { state } = await import("./js/state.js");
    const { calculateOrder } = await import("./js/pricing.js");
    return {
      pnr: state.confirmation.pnr,
      price: calculateOrder(state).totalTWD,
      tickets: Object.values(state.confirmation.ticketsByTravelerId),
    };
  });
  assert.equal(state.tickets.length, multi ? 2 : 1);
  assert(state.tickets.every((t) => /^ST-ETK-[A-Z0-9]{8}$/.test(t)));
  const downloaded = p.waitForEvent("download", { timeout: 120000 });
  await p.locator("#download-pdf").click();
  const dl = await downloaded;
  assert.equal(dl.suggestedFilename(), `AirStars_Itinerary_${state.pnr}.pdf`);
  const dest = output + "/" + name + ".pdf";
  await dl.saveAs(dest);
  const bytes = await fs.readFile(dest);
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert(bytes.length > 20000);
  assert(bytes.length < 8000000);
  await p.screenshot({
    path: output + "/" + name + "-confirmation.png",
    fullPage: true,
  });
  const overflow = await p.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  assert.equal(overflow, false, "page must not overflow viewport");
  await p.locator("#download-pdf").waitFor({ state: "visible" });
  await p.locator("#new-booking").click();
  await p.locator("#search-form").waitFor();
  assert.equal(await p.locator(".pnr").count(), 0);
  assert.deepEqual(
    await p.evaluate(async () => {
      const { state } = await import("./js/state.js");
      return [
        state.confirmation,
        state.priceBreakdown,
        state.services,
        state.travelers,
      ];
    }),
    [null, null, {}, []],
  );
  console.log(
    "PASS",
    name,
    JSON.stringify({ ...state, pdfBytes: bytes.length }),
  );
  await ctx.close();
}
try {
  await run("desktop");
  await run("mobile-failure-retry", { mobile: true, fail: true });
  await run("multi-city-two-adults", { multi: true });
  await run("connection-mixed-cabins", { connection: true });
  assert.deepEqual(allErrors, []);
  console.log(
    "PASS browser acceptance: 4 complete workflows; no uncaught JS errors",
  );
} finally {
  await browser.close();
}
