// Run after starting the HTTP server; uses the same external Playwright as browser.mjs.
import { chromium } from "/workspace/air-stars-tools/node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

const output = "/tmp/air-stars-results";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.AIR_STARS_URL || "http://127.0.0.1:8000/");
  const summary = await page.evaluate(async () => {
    const { initialState } = await import("./js/state.js");
    const { search } = await import("./js/flights.js");
    const { autoSeats } = await import("./js/seatmap.js");
    const { inventory } = await import("./js/inventory.js");
    const { serviceCount } = await import("./js/meals.js");
    const { calculateOrder, money } = await import("./js/pricing.js");
    const { itineraryLines } = await import("./js/pdf.js");
    const s = initialState();
    s.quoteNow = Date.parse("2026-10-18T00:00:00Z");
    s.passengerCount = 9;
    s.selectedCurrency = "USD";
    s.travelers = Array.from({ length: 9 }, (_, i) => ({
      id: "t" + i,
      title: "MR",
      surname: "TEST",
      givenName: "TRAVELER" + String.fromCharCode(65 + i),
    }));
    s.contact = {
      name: "王測試",
      email: "demo@example.com",
      phone: "+886900000000",
    };
    s.journeys = ["2026-11-02", "2026-11-08", "2026-11-15", "2026-11-22"].map(
      (date, i) => {
        const origin = i % 2 ? "LHR" : "NRT";
        const destination = i % 2 ? "NRT" : "LHR";
        const option = search({
          origin,
          destination,
          date,
          count: 9,
          now: s.quoteNow,
        })[0];
        if (!option || option.legs.length !== 2)
          throw new Error("Expected a two-leg connection");
        const cabins = option.legs.map((f, li) =>
          li && inventory(f, "C").remaining >= 9 ? "C" : "Y",
        );
        return {
          id: "j" + i,
          origin,
          destination,
          date,
          option,
          cabins,
          family: "Flex",
        };
      },
    );
    for (const t of s.travelers) {
      s.services[t.id] = {};
      for (const j of s.journeys)
        s.services[t.id][j.id] = {
          seats: {},
          bags: [23, 32],
          meals: Object.fromEntries(
            j.option.legs.map((f, li) => [
              f.instanceKey,
              Array.from({ length: serviceCount(f) }, (_, mealIndex) =>
                ["C", "F"].includes(j.cabins[li])
                  ? ["P02", "B01", "B03"][mealIndex]
                  : "NONE",
              ),
            ]),
          ),
          specialMeals: Object.fromEntries(
            j.option.legs.map((f) => [
              f.instanceKey,
              t.id === "t0" ? "SP-VGAN" : "NONE",
            ]),
          ),
        };
    }
    const assigned = autoSeats(s);
    if (assigned.error) throw new Error(assigned.error);
    for (const a of assigned.assignments)
      s.services[a.tid][a.jid].seats[a.key] = a.id;
    delete s.services.t0.j0.seats[s.journeys[0].option.legs[0].instanceKey];
    delete s.services.t8.j0.specialMeals;
    const b = calculateOrder(s);
    s.confirmation = {
      pnr: "PDF9X4",
      completedAtUTC: "2026-10-18T23:58:00Z",
      ticketsByTravelerId: Object.fromEntries(
        s.travelers.map((t, i) => [t.id, "ST-ETK-TEST000" + i]),
      ),
      frozenBookingSnapshot: {
        ...structuredClone(s),
        priceBreakdown: structuredClone(b),
      },
    };
    // Confirm PDF still reflects the purchased data if live state changes.
    s.travelers[0].givenName = "CHANGED";
    s.services.t0.j0.bags = [];
    s.selectedCurrency = "EUR";
    const lines = itineraryLines(s).map((line) => line.text);
    window.pdfOrder = s;
    window.pdfDraws = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      text,
      x,
      y,
      ...rest
    ) {
      window.pdfDraws.push({
        text,
        x,
        y,
        width: this.measureText(text).width,
        canvasWidth: this.canvas.width,
      });
      return original.call(this, text, x, y, ...rest);
    };
    return {
      lines,
      expectedTotal: money(b.totalTWD, "EUR"),
      expectedTWD: money(b.totalTWD),
      seatCount: assigned.assignments.length,
    };
  });
  assert.equal(summary.seatCount, 72);
  const text = summary.lines.join("\n");
  assert(text.includes("ST-ETK-TEST0008"));
  assert(text.includes("2026-10-19 07:58（Asia/Taipei）"));
  assert(!text.includes("CHANGED"));
  assert(!text.includes("undefined"));
  assert(text.includes("於報到時由系統隨機安排（不收取預選座位費）"));
  assert(text.includes("特殊餐需求：無需求"));
  assert(text.includes("特殊餐需求：全素"));
  assert(text.includes("炭烤牛排"));
  assert(text.includes("起司歐姆蛋佐烤番茄"));
  assert(text.includes("TEST / TRAVELERA"));
  assert(text.includes("最終總額：" + summary.expectedTotal));
  assert(text.includes("TWD 基準總額：" + summary.expectedTWD));
  assert.equal(
    summary.lines.filter((line) => line.startsWith("出發：")).length,
    8,
  );
  assert.equal(
    summary.lines.filter(
      (line) =>
        line.startsWith("TEST /") &&
        (line.includes("　座位 ") || line.includes("　於報到時")),
    ).length,
    72,
  );
  assert.equal(
    summary.lines.filter((line) => line.startsWith("餐飲：")).length,
    72,
  );
  assert.equal(
    summary.lines.filter(
      (line) => line.includes("免費託運") && line.includes("23 kg、32 kg"),
    ).length,
    36,
  );

  // A transient local library failure must remain retryable without refreshing.
  await page.route("**/assets/vendor/jspdf.umd.min.js", (route) =>
    route.abort(),
  );
  const failure = await page.evaluate(async () => {
    try {
      await (await import("./js/pdf.js")).downloadPDF(window.pdfOrder);
      return "";
    } catch (error) {
      return error.message;
    }
  });
  assert.match(failure, /PDF 工具/);
  await page.unroute("**/assets/vendor/jspdf.umd.min.js");
  const downloaded = page.waitForEvent("download", { timeout: 120000 });
  await page.evaluate(async () =>
    (await import("./js/pdf.js")).downloadPDF(window.pdfOrder),
  );
  const dl = await downloaded;
  assert.equal(dl.suggestedFilename(), "AirStars_Itinerary_PDF9X4.pdf");
  const path = output + "/nine-adults-four-connections.pdf";
  await dl.saveAs(path);
  const bytes = await fs.readFile(path);
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert(
    bytes.length < 8000000,
    "maximum-length order PDF must remain practical to download",
  );
  const info = execFileSync("pdfinfo", [path], { encoding: "utf8" });
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1]);
  assert(pages > 3);
  assert.match(info, /Page size:\s+595.28 x 841.89 pts \(A4\)/);
  const draws = await page.evaluate(() => window.pdfDraws);
  assert.equal(
    draws.filter((d) => d.text === "模擬文件，無旅行效力／不可用於搭機或支付")
      .length,
    pages,
  );
  assert.equal(
    draws.filter((d) => d.text === "虛構資料與模擬文件 · 無旅行與支付效力")
      .length,
    pages,
  );
  for (const draw of draws) {
    assert(
      draw.x + draw.width <= draw.canvasWidth - 87,
      "PDF text must stay inside its right margin",
    );
    assert(draw.y <= 1706 && draw.y > 0, "PDF text must stay inside the page");
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS PDF: nine adults, four connecting journeys, frozen booking, currency change, local resource retry",
    JSON.stringify({ pages, bytes: bytes.length, path }),
  );
} finally {
  await browser.close();
}
