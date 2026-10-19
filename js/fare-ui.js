import { state } from "./state.js";
import { allowance, itineraryPrice, miles, money } from "./pricing.js";
import {
  cabinNames,
  families,
  familyIndex,
  mileage,
} from "../assets/data/fares.js";

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

function seatBenefit(cabin, family) {
  if (cabin === "C" || cabin === "F") return "全部座位免費";
  const index = familyIndex(family);
  return cabin === "Y"
    ? [
        "一般、優選及加大腿部空間座位付費",
        "一般座位免費；優選及加大腿部空間座位付費",
        "一般及優選座位免費；加大腿部空間座位付費",
      ][index]
    : [
        "一般座位免費；優選及加大腿部空間座位付費",
        "一般及優選座位免費；加大腿部空間座位付費",
        "一般、優選及加大腿部空間座位免費",
      ][index];
}

function perLegBenefits(option, cabins, describe) {
  return option.legs
    .map(
      (flight, index) =>
        `<span class="fare-leg-benefit"><span class="fare-leg-label">${escapeHTML(flight.flightNo)} · ${escapeHTML(cabinNames[cabins[index]])}</span>${escapeHTML(describe(cabins[index]))}</span>`,
    )
    .join("");
}

export function fareComparison(journey, option, setting, journeyIndex) {
  const cabins = setting.cabins;
  const currency = state.selectedCurrency;
  const format = (amount) => money(amount, currency);
  const cards = Object.entries(families)
    .map(([family, terms]) => {
      const candidate = { ...journey, option, cabins, family };
      const baggage = allowance(candidate);
      const total = itineraryPrice(
        option,
        cabins,
        family,
        state.passengerCount,
        state.quoteNow,
      );
      const selected = setting.family === family;
      const fee = (amount, action) =>
        amount === 0 ? `免${action}手續費` : `${format(amount)}／每人每方向`;
      return `<article class="fare-option${selected ? " is-selected" : ""}" data-fare-family="${family}">
        <div class="fare-option-heading"><div><h4>${escapeHTML(terms.name)}</h4><span class="fare-family-code">${family}</span></div><span class="fare-selection-status">${selected ? "已選擇" : "可選票種"}</span></div>
        <div class="fare-option-price"><strong>${format(total)}</strong><span>${state.passengerCount} 位成人 · 含模擬稅費</span>${currency !== "TWD" ? `<small>TWD 基準 ${money(total)}</small>` : ""}</div>
        <dl class="fare-option-benefits">
          <div class="fare-benefit-row"><dt>免費託運行李</dt><dd>${baggage.pieces} 件 × ${baggage.kg} kg<span class="fare-benefit-note">每人每方向${option.legs.length > 1 ? "，聯程取較嚴額度" : ""}</span></dd></div>
          <div class="fare-benefit-row"><dt>免費手提行李</dt><dd>${baggage.hand} 件 × 7 kg<span class="fare-benefit-note">每人每方向</span></dd></div>
          <div class="fare-benefit-row fare-benefit-seats"><dt>提前選位權益</dt><dd>${perLegBenefits(option, cabins, (cabin) => seatBenefit(cabin, family))}</dd></div>
          <div class="fare-benefit-row fare-benefit-miles"><dt>模擬累積里程</dt><dd>${miles(candidate).toLocaleString("en-US")} 英里／每人${perLegBenefits(option, cabins, (cabin) => `${Math.round(mileage[cabin][familyIndex(family)] * 100)}% 里程累積`)}</dd></div>
          <div class="fare-benefit-row"><dt>改票手續費</dt><dd>${fee(terms.change, "改票")}<span class="fare-benefit-note">另可能有票價差額</span></dd></div>
          <div class="fare-benefit-row"><dt>退票手續費</dt><dd>${terms.refund === null ? "不可退票" : fee(terms.refund, "退票")}</dd></div>
        </dl>
        <button type="button" class="fare-select${selected ? " is-selected" : ""}" data-select-family="${escapeHTML(`${journeyIndex}|${option.key}|${family}`)}" aria-label="${escapeHTML(`${selected ? "已選擇" : "選擇"}${terms.name}票種 ${family}`)}" aria-pressed="${selected}">${selected ? "已選擇" : "選擇"}</button>
      </article>`;
    })
    .join("");

  return `<section class="fare-comparison" aria-label="三種票種比較"><div class="fare-comparison-heading"><h3>比較並選擇票種</h3><p>此方向所有航段共用一種票種，以下為目前艙等的成人票價總額。</p></div><div class="fare-comparison-cards" data-fare-comparison="${escapeHTML(`${journeyIndex}|${option.key}`)}" tabindex="0" role="region" aria-label="票種價格與權益比較，可橫向捲動">${cards}</div><p class="fare-comparison-note">行李與里程權益以每位成人計算。座位及額外行李依所選服務另計，訂單摘要會即時更新。以上退改條款僅供虛構展示。</p></section>`;
}
