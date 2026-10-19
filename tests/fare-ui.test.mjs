import test from "node:test";
import assert from "node:assert/strict";
import { fareComparison } from "../js/fare-ui.js";
import { state, initialState } from "../js/state.js";
import { search } from "../js/flights.js";
import { allowance, itineraryPrice, miles, money } from "../js/pricing.js";

const quoteNow = Date.parse("2026-10-19T00:00:00Z");

function fixture({ connection = false, currency = "TWD" } = {}) {
  Object.assign(state, initialState(), {
    passengerCount: 2,
    selectedCurrency: currency,
    quoteNow,
  });
  const option = search({
    origin: connection ? "NRT" : "TPE",
    destination: connection ? "LHR" : "NRT",
    date: "2026-11-02",
    count: state.passengerCount,
    now: quoteNow,
  })[0];
  assert.ok(option, "fixture must use an actual sellable scheduled itinerary");
  const journey = { id: "j0", option, family: "Saver", cabins: option.cabins };
  const setting = {
    cabins: connection ? ["Y", "C"] : [...option.cabins],
    family: "Basic",
  };
  return { option, journey, setting };
}

function card(html, family) {
  return html.match(
    new RegExp(`<article[^>]*data-fare-family="${family}">([\\s\\S]*?)</article>`),
  )?.[1];
}

test("fare comparison prices all three families for the selected cabins and adult count", () => {
  const { option, journey, setting } = fixture();
  const html = fareComparison(journey, option, setting, 2);
  assert.equal((html.match(/<article\b/g) || []).length, 3);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.ok(html.includes(`data-fare-comparison="2|${option.key}"`));
  for (const family of ["Saver", "Basic", "Flex"]) {
    const content = card(html, family);
    assert.ok(content);
    const amount = itineraryPrice(option, setting.cabins, family, 2, quoteNow);
    assert.ok(content.includes(`<strong>${money(amount)}</strong>`));
    assert.ok(content.includes("2 位成人 · 含模擬稅費"));
    assert.ok(content.includes(`data-select-family="2|${option.key}|${family}"`));
    assert.ok(content.includes(`aria-pressed="${family === "Basic"}"`));
  }
  assert.match(card(html, "Saver"), /不可退票/);
  assert.match(card(html, "Basic"), /TWD 2,500／每人每方向/);
  assert.match(card(html, "Flex"), /免改票手續費/);
  assert.match(card(html, "Flex"), /免退票手續費/);
});

test("mixed cabins use the strict through baggage allowance and per-segment seat rights", () => {
  const { option, journey, setting } = fixture({ connection: true });
  const before = structuredClone({ journey, option, setting });
  const html = fareComparison(journey, option, setting, 0);
  for (const family of ["Saver", "Basic", "Flex"]) {
    const candidate = { ...journey, option, cabins: setting.cabins, family };
    const content = card(html, family);
    const baggage = allowance(candidate);
    assert.ok(content.includes(`${baggage.pieces} 件 × ${baggage.kg} kg`));
    assert.ok(content.includes(`${baggage.hand} 件 × 7 kg`));
    assert.ok(content.includes(`${miles(candidate).toLocaleString("en-US")} 英里／每人`));
    assert.match(content, /聯程取較嚴額度/);
    assert.match(content, /經濟艙/);
    assert.match(content, /商務艙/);
    assert.match(content, /全部座位免費/);
  }
  assert.match(card(html, "Saver"), /一般、優選及加大腿部空間座位付費/);
  assert.match(card(html, "Flex"), /一般及優選座位免費；加大腿部空間座位付費/);
  assert.deepEqual({ journey, option, setting }, before, "rendering comparisons must preserve existing selections and services");
});

test("foreign prices retain TWD context and selection attributes escape option keys", () => {
  const { option, journey, setting } = fixture({ currency: "USD" });
  option.key += '"><script>alert(1)</script>';
  const html = fareComparison(journey, option, setting, 0);
  assert.match(html, /<strong>USD /);
  assert.equal((html.match(/TWD 基準 TWD /g) || []).length, 3);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
  assert.match(html, /tabindex="0" role="region"/);
});
