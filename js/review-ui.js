import { state } from "./state.js";
import { airportByCode } from "./data.js";
import { localDateTime, dayDiff } from "./timezone.js";
import {
  allowance,
  calculateOrder,
  conversionAdjustment,
  foreignMoney,
  miles,
  money,
} from "./pricing.js";
import { families, cabinNames, familyIndex } from "../assets/data/fares.js";
import { mealDescription } from "./meals.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

// Small original line drawings; every icon also has a visible text label beside it.
const iconPaths = {
  plane:
    '<path d="m12 3 2.2 6.8 6.3 4v2l-6.3-1.9v4.7l2 1.5v1L12 20l-4.2 1.1v-1l2-1.5v-4.7l-6.3 1.9v-2l6.3-4L12 3Z"/>',
  traveler:
    '<circle cx="12" cy="7.5" r="3.2"/><path d="M5 21v-3.2c0-3 2.4-5.2 7-5.2s7 2.2 7 5.2V21M8 21v-3m8 3v-3"/>',
  seat: '<path d="M7 3h5l2 9h5v5H8L5 8V4M8 17v4m9-4v4M4 12l2 6h4"/>',
  meal: '<path d="M5 3v6m3-6v6M3 6v3c0 2 7 2 7 0V6M6.5 11v10M17 3c-3 3-3 8 0 9h2V3h-2Zm2 9v9"/>',
  baggage:
    '<rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V3h6v4M9 11v5m6-5v5M8 20v2m8-2v2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5v6l4 2"/>',
  shield:
    '<path d="m12 3 8 3v6c0 4-4.4 7.6-8 9-3.6-1.4-8-5-8-9V6l8-3Z"/><path d="m8 12 2.8 3 5.2-6"/>',
  receipt: '<path d="M5 3h14v19l-3-2-4 2-4-2-3 2V3ZM9 7h6m-6 4h6m-6 4h3"/>',
  contact: '<path d="M4 5h16v15H4zM8 3v4m8-4v4M8 10h8M8 14h2m4 0h2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  phone:
    '<path d="m6 3 4 5-3 3c1.4 3 3 4.6 6 6l3-3 5 4c-1.4 4.8-5.2 3.3-9 1C7.5 16.3 4.3 12.5 3.5 8.5 3 6.1 3.7 4.2 6 3Z"/>',
  edit: '<path d="m14 4 6 6M4 20l5-1 12-12-5-5L4 14v6ZM4 20l5-1-5-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="m7.5 12 3 3 6-6"/>',
};
const icon = (name, extraClass = "") =>
  `<svg class="review-icon ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name] || iconPaths.check}</svg>`;
const fullName = (traveler) =>
  `${traveler.surname || ""} / ${traveler.givenName || ""}`;
const duration = (minutes) =>
  `${Math.floor(minutes / 60)} 小時${minutes % 60 ? ` ${minutes % 60} 分鐘` : ""}`;
const getService = (order, tid, jid) => order.services?.[tid]?.[jid] || {};
const editButton = (step, label, completed) =>
  completed
    ? ""
    : `<button type="button" class="review-edit" data-step="${step}">${icon("edit")}${label}</button>`;

function cardTitle(name, title, subtitle = "", action = "") {
  return `<div class="review-card-heading"><div class="review-heading-label"><span class="review-heading-icon">${icon(name)}</span><div>${subtitle ? `<span class="review-eyebrow">${esc(subtitle)}</span>` : ""}<h2>${esc(title)}</h2></div></div>${action}</div>`;
}

function airportPoint(flight, arrival = false) {
  const code = arrival ? flight.destination : flight.origin;
  const airport = airportByCode[code];
  const dateTime = localDateTime(
    arrival ? flight.arrivalUTC : flight.departureUTC,
    airport.timeZone,
  );
  const offset = arrival
    ? dayDiff(dateTime.slice(0, 10), flight.departureLocalISODate)
    : 0;
  return `<div class="review-point"><span class="review-point-label">${arrival ? "抵達" : "出發"}</span><div class="review-time">${dateTime.slice(11)}${offset ? `<span class="review-day-offset">${offset > 0 ? "+" : ""}${offset} 日</span>` : ""}</div><div class="review-airport-name"><strong>${esc(code)}</strong><span>${esc(airport.nameZh)}</span></div><time datetime="${dateTime.replace(" ", "T")}">${dateTime.slice(0, 10)}</time><span class="review-time-zone">${esc(airport.timeZone)}</span></div>`;
}

function flightTimeline(journey) {
  return `<div class="review-flight-timeline">${journey.option.legs
    .map((flight, index) => {
      const transfer = journey.option.legs[index + 1];
      const wait = transfer
        ? Math.round((transfer.departureUTC - flight.arrivalUTC) / 60000)
        : 0;
      return `<article class="review-flight"><div class="review-flight-meta"><strong>${esc(flight.flightNo)}</strong><span>${esc(flight.aircraftType)}</span><span class="review-cabin-badge">${esc(cabinNames[journey.cabins[index]])}</span><span class="review-flight-duration">${icon("clock")}${duration(flight.durationMinutes)}</span></div><div class="review-route-grid">${airportPoint(flight)}<div class="review-route-rail">${icon("plane")}</div>${airportPoint(flight, true)}</div></article>${transfer ? `<div class="review-transfer">${icon("clock")}<div><strong>${esc(airportByCode[flight.destination].nameZh)} ${esc(flight.destination)} 同機場轉機</strong><span>等候 ${duration(wait)}</span></div></div>` : ""}`;
    })
    .join("")}</div>`;
}

function baggageSummary(journey, service) {
  const free = allowance(journey);
  const extras = service.bags || [];
  return `<div class="review-baggage"><div class="review-service-label">${icon("baggage")}<strong>此方向行李</strong></div><dl class="review-bag-facts"><div><dt>免費託運</dt><dd>${free.pieces} 件 × ${free.kg} kg</dd></div><div><dt>免費手提</dt><dd>${free.hand} 件 × 7 kg</dd></div><div><dt>額外加購</dt><dd>${extras.length ? extras.map((kg) => `<span class="review-bag-chip">${kg} kg</span>`).join("") : "無加購"}</dd></div></dl></div>`;
}

function travelerServices(order, journey) {
  return `<div class="review-service-grid">${order.travelers
    .map((traveler, index) => {
      const service = getService(order, traveler.id, journey.id);
      return `<article class="review-passenger-card"><div class="review-passenger-heading">${icon("traveler")}<div><span class="review-eyebrow">成人 ${index + 1}</span><h4>${esc(fullName(traveler))}</h4></div></div>${journey.option.legs
        .map((flight, legIndex) => {
          const seat = service.seats?.[flight.instanceKey];
          const meal = mealDescription(
            flight,
            journey.cabins[legIndex],
            service,
          );
          return `<div class="review-flight-service"><span class="review-service-flight">${esc(flight.flightNo)} · ${esc(flight.origin)} → ${esc(flight.destination)}</span><div class="review-service-line">${icon("seat")}<div><span class="review-service-caption">座位</span><strong class="${seat ? "review-seat-number" : "review-seat-pending"}">${seat ? esc(seat) : "於報到時由系統隨機安排"}</strong>${seat ? "" : "<small>不收取預選座位費</small>"}</div></div><div class="review-service-line">${icon("meal")}<div><span class="review-service-caption">餐飲 · 已包含</span><ul class="review-meal-items">${meal
            .split("；")
            .filter(Boolean)
            .map((part) => `<li>${esc(part)}</li>`)
            .join("")}</ul></div></div></div>`;
        })
        .join("")}${baggageSummary(journey, service)}</article>`;
    })
    .join("")}</div>`;
}

function fareTerms(journey, format) {
  const family = families[journey.family];
  const seatBenefits = [...new Set(journey.cabins)].map((cabin) => {
    const index = familyIndex(journey.family);
    const benefit = "FC".includes(cabin)
      ? "全部座位免費預選"
      : cabin === "Y"
        ? ["預選座位另計費", "一般座位免費", "一般及優選座位免費"][index]
        : ["一般座位免費", "一般及優選座位免費", "全部座位免費預選"][index];
    return `${cabinNames[cabin]}：${benefit}`;
  });
  return `<details class="review-terms"><summary><span>${icon("shield")}票種權益與退改規則</span>${icon("chevron", "review-terms-chevron")}</summary><dl class="review-term-grid"><div><dt>選位權益</dt><dd>${seatBenefits.map((text) => `<span>${esc(text)}</span>`).join("")}<small>未預選座位可於報到時隨機安排</small></dd></div><div><dt>模擬累積里程</dt><dd>每人 ${miles(journey).toLocaleString("en-US")} 英里</dd></div><div><dt>改票手續費</dt><dd>${format(family.change)}／每人每方向<small>另可能產生票價差額</small></dd></div><div><dt>退票條款</dt><dd>${family.refund === null ? "不可退票" : `${format(family.refund)}／每人每方向`}</dd></div></dl><p class="review-fine-print">以上為模擬條款展示，不提供實際售後交易。</p></details>`;
}

function journeyCard(order, journey, index, completed, format) {
  const title = `${airportByCode[journey.origin].nameZh} → ${airportByCode[journey.destination].nameZh}`;
  return `<section class="review-card review-journey-card">${cardTitle("plane", title, `航程 ${String(index + 1).padStart(2, "0")} / ${order.journeys.length}`, editButton(1, "修改航班", completed))}<div class="review-journey-overview"><span class="review-fare-badge">${esc(families[journey.family].name)} ${esc(journey.family)}</span><span>${esc(journey.date || journey.option.legs[0].departureLocalISODate)}</span><span>${journey.option.legs.length > 1 ? "轉機一次" : "直飛"}</span></div>${flightTimeline(journey)}<div class="review-services-heading"><h3>旅客服務</h3><div class="review-edit-actions">${editButton(4, "修改座位", completed)}${editButton(5, "修改餐點", completed)}${editButton(3, "修改行李", completed)}</div></div>${travelerServices(order, journey)}${fareTerms(journey, format)}</section>`;
}

function travelerDetails(order, completed) {
  return `<section class="review-card">${cardTitle("traveler", "旅客資料", `${order.passengerCount} 位成人`, editButton(2, "修改旅客", completed))}<ul class="review-traveler-list">${order.travelers.map((traveler, index) => `<li><div class="review-person-number">${String(index + 1).padStart(2, "0")}</div><div class="review-person-details"><h3>${esc(fullName(traveler))}</h3><dl class="review-person-meta"><div><dt>稱謂</dt><dd>${esc(traveler.title) || "—"}</dd></div><div><dt>出生日期</dt><dd>${esc(traveler.birthDate) || "—"}</dd></div><div><dt>國籍／地區</dt><dd>${esc(traveler.nationality) || "—"}</dd></div>${traveler.passportNumber ? `<div><dt>模擬護照號碼</dt><dd>${esc(traveler.passportNumber)}</dd></div>` : ""}</dl>${completed ? `<div class="review-electronic-ticket"><span>虛構電子票號</span><strong>${esc(state.confirmation?.ticketsByTravelerId?.[traveler.id]) || "—"}</strong></div>` : ""}</div></li>`).join("")}</ul></section>`;
}

function contactDetails(order, completed) {
  const contact = order.contact || {};
  return `<section class="review-card">${cardTitle("contact", "聯絡資訊", "訂單聯絡人", editButton(2, "修改聯絡資訊", completed))}<dl class="review-contact-list"><div><dt>${icon("traveler")}聯絡姓名</dt><dd>${esc(contact.name) || "—"}</dd></div><div><dt>${icon("mail")}電子郵件</dt><dd>${esc(contact.email) || "—"}</dd></div><div><dt>${icon("phone")}聯絡電話</dt><dd>${esc(contact.phone) || "—"}</dd></div></dl><p class="review-fine-print">聯絡資料僅用於此次模擬，不會寄送確認信或簡訊。</p></section>`;
}

function costDetails(order, breakdown, format, currency) {
  const adjust = conversionAdjustment(breakdown, currency, [
    ...breakdown.segmentFaresTWD.map((item) => item.amount),
    ...breakdown.segmentTaxesTWD.map((item) => item.amount),
    breakdown.seats,
    breakdown.bags,
  ]);
  return `<section class="review-card review-cost-card">${cardTitle("receipt", "費用明細", "固定模擬匯率", `<span class="review-currency-badge">${esc(currency)}</span>`)}<dl class="review-cost-lines">${breakdown.segmentFaresTWD
    .map((item, index) => {
      const journeyIndex = order.journeys.findIndex(
        (journey) => journey.id === item.journeyId,
      );
      const tax = breakdown.segmentTaxesTWD[index];
      return `<div class="review-cost-row"><dt><strong>${esc(item.flight)} · ${esc(cabinNames[item.cabin])}</strong><span>航程 ${journeyIndex + 1} 機票 · ${format(item.unit)} × ${item.count} 位成人</span></dt><dd>${format(item.amount)}</dd></div><div class="review-cost-row review-cost-tax"><dt>${esc(item.flight)} 模擬稅費</dt><dd>${format(tax?.amount || 0)}</dd></div>`;
    })
    .join(
      "",
    )}<div class="review-cost-row review-cost-extra"><dt><span>${icon("seat")}選位服務</span></dt><dd>${format(breakdown.seats)}</dd></div><div class="review-cost-row"><dt><span>${icon("baggage")}額外行李</span></dt><dd>${format(breakdown.bags)}</dd></div>${adjust ? `<div class="review-cost-row review-cost-adjustment"><dt>匯率換算尾差</dt><dd>${foreignMoney(adjust, currency)}</dd></div>` : ""}</dl><div class="review-total"><div><span>${order.passengerCount} 位成人總額</span><small>餐飲已包含，無真實扣款</small></div><strong>${format(breakdown.totalTWD)}</strong><span class="review-twd-total">TWD 基準總額 ${money(breakdown.totalTWD)}</span></div></section>`;
}

/** Shared read-only order cards; completed orders always read the purchased snapshot. */
export function reviewView(completed = false) {
  const order = completed
    ? state.confirmation?.frozenBookingSnapshot || state
    : state;
  const breakdown =
    completed && order.priceBreakdown
      ? order.priceBreakdown
      : calculateOrder(order);
  const currency = state.selectedCurrency;
  const format = (value) => money(value, currency);
  return `<div class="review-board${completed ? " review-board-completed" : ""}"><div class="review-intro">${icon(completed ? "check" : "shield")}<p>${completed ? "以下為本次已完成的模擬訂單，可下載 PDF 自行保管。" : "請核對航程與每位旅客的服務，確認後即可前往模擬付款。"}</p></div>${order.journeys
    .filter((journey) => journey.option)
    .map((journey, index) =>
      journeyCard(order, journey, index, completed, format),
    )
    .join(
      "",
    )}<div class="review-details-grid">${travelerDetails(order, completed)}${contactDetails(order, completed)}</div>${costDetails(order, breakdown, format, currency)}${completed ? "" : `<label class="review-agreement"><input id="review-check" type="checkbox" ${state.reviewed ? "checked" : ""}><span><strong>我已確認航程、旅客及服務內容</strong><span>同意上述模擬退改條款，並理解本網站不提供真實航空服務。</span></span></label>`}</div>`;
}
