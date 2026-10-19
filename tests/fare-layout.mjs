import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "/workspace/air-stars-tools/node_modules/playwright/index.mjs";
import { fareComparison } from "../js/fare-ui.js";
import { state, initialState } from "../js/state.js";
import { search } from "../js/flights.js";

Object.assign(state, initialState(), {
  passengerCount: 2,
  quoteNow: Date.parse("2026-10-19T00:00:00Z"),
});
const option = search({
  origin: "NRT", destination: "LHR", date: "2026-11-02",
  count: 2, now: state.quoteNow,
})[0];
const html = fareComparison(
  { id: "j0", family: "Saver", option },
  option,
  { cabins: ["Y", "C"], family: "Basic" },
  0,
);
const css = (await readFile(new URL("../css/main.css", import.meta.url), "utf8")) +
  (await readFile(new URL("../css/fare-update.css", import.meta.url), "utf8"));
const output = "/tmp/air-stars-results";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    try {
      await page.setContent(`<style>${css}</style><main style="max-width:1000px;margin:auto;padding:16px;min-width:0">${html}</main>`);
      const layout = await page.evaluate(() => {
        const container = document.querySelector(".fare-comparison-cards");
        const cards = [...document.querySelectorAll(".fare-option")].map((card) => {
          const { x, y, width, height } = card.getBoundingClientRect();
          const benefitRows = [...card.querySelectorAll(".fare-benefit-row")].map((row) => row.getBoundingClientRect().y);
          return { x, y, width, height, benefitRows };
        });
        return {
          viewport: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          containerWidth: container.clientWidth,
          scrollWidth: container.scrollWidth,
          cards,
        };
      });
      assert.equal(layout.pageWidth, width, "comparison must not widen the page");
      assert.equal(layout.cards.length, 3);
      assert.ok(layout.cards.every((card) => card.width >= 230));
      assert.ok(layout.cards.every((card) => card.y === layout.cards[0].y));
      for (const card of layout.cards)
        assert.deepEqual(card.benefitRows, layout.cards[0].benefitRows, "all benefit rows must align across the three families");
      if (width > 700) {
        assert.equal(layout.scrollWidth, layout.containerWidth, "desktop must show all three columns");
      } else {
        assert.ok(layout.scrollWidth > layout.containerWidth, "mobile must scroll horizontally");
        await page.locator(".fare-comparison-cards").evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        await page.locator('[data-fare-family="Flex"] button').focus();
        assert.equal(await page.evaluate(() => document.activeElement.dataset.selectFamily), `0|${option.key}|Flex`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      }
      await page.screenshot({ path: `${output}/fare-comparison-${width}.png`, fullPage: true });
      console.log("PASS fare comparison layout", JSON.stringify(layout));
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
