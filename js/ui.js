import { state as s, service } from "./state.js";
import { airports, airportByCode } from "./data.js";
import {
  localDate,
  addDays,
  localDateTime,
  dayDiff,
  bookableDate,
} from "./timezone.js";
import { search, sorter } from "./flights.js";
import {
  money,
  calculateOrder,
  itineraryPrice,
  allowance,
  bagPrice,
  conversionAdjustment,
  foreignMoney,
} from "./pricing.js";
import { families, cabinNames } from "../assets/data/fares.js";
import { cards } from "./payment.js";
import { seatsView, seatContext } from "./seat-ui.js";
import { mealsView, ensureMeals } from "./meal-ui.js";
import { reviewView } from "./review-ui.js";
import { fareComparison } from "./fare-ui.js";
export { seatsView, seatContext, mealsView, ensureMeals, reviewView };
export const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const fmt = (x) => money(x, s.selectedCurrency);
export const airportOptions = (value) =>
  airports
    .map(
      (a) =>
        `<option value="${a.code}" ${a.code === value ? "selected" : ""}>${a.code} · ${a.nameZh}</option>`,
    )
    .join("");
const options = (data, value) =>
  data
    .map(
      ([v, n]) =>
        `<option value="${esc(v)}" ${value === v ? "selected" : ""}>${esc(n)}</option>`,
    )
    .join("");
const cabinOptions = (cs, value) =>
  options(
    cs.map((c) => [c, cabinNames[c]]),
    value,
  );
export let homeDraft = {
  type: "round-trip",
  count: 1,
  cabin: "Y",
  legs: [
    { origin: "TPE", destination: "NRT", date: addDays(localDate(), 14) },
    { origin: "NRT", destination: "TPE", date: addDays(localDate(), 21) },
  ],
};
export let searchCache = new Map();
export function invalidateSearch() {
  searchCache.clear();
}
export const flightSettings = new Map();
let errors = {};
export function setErrors(e) {
  errors = e;
}
function field(
  label,
  key,
  value = "",
  {
    type = "text",
    required = false,
    list = null,
    wide = false,
    pattern = "",
    max = "",
  } = {},
) {
  const err = errors[key];
  const errorId = "error-" + key.replaceAll(".", "-");
  const invalid = err
    ? `aria-invalid="true" aria-describedby="${errorId}" class="invalid"`
    : "";
  return `<label class="field ${wide ? "wide" : ""}">${label}${required ? ' <span aria-hidden="true">*</span>' : ""}${list ? `<select data-field="${key}" ${required ? "required" : ""} ${invalid}>${options(list, value)}</select>` : `<input data-field="${key}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${pattern ? `pattern="${esc(pattern)}"` : ""} ${max ? `max="${max}"` : ""} ${invalid} autocomplete="off">`}${err ? `<span class="error" id="${errorId}">${esc(err)}</span>` : ""}</label>`;
}
export function home() {
  const d = homeDraft;
  return `<section class="hero"><div class="hero-index">AIR STARS ／ 預訂機票</div><h1>預訂您的航程</h1><p>桃園與高雄出發，探索 30 個海外目的地。<br>選擇航班，安排您的下一段旅程。</p><span class="eyebrow">虛構航空・訂票體驗</span></section><div class="home-content"><section class="search-panel" id="search" aria-label="航班搜尋"><div class="tabs" role="tablist" aria-label="行程類型">${[
    ["one-way", "單程"],
    ["round-trip", "來回"],
    ["multi-city", "多城市"],
  ]
    .map(
      ([t, n]) =>
        `<button role="tab" aria-selected="${d.type === t}" class="${d.type === t ? "active" : ""}" data-trip="${t}">${n}</button>`,
    )
    .join(
      "",
    )}</div><form id="search-form">${d.type === "multi-city" ? d.legs.map((l, i) => `<div class="search-grid multi"><label class="form-label">航程 ${i + 1} · 出發<select data-home="${i}.origin">${airportOptions(l.origin)}</select></label><label class="form-label">目的地<select data-home="${i}.destination">${airportOptions(l.destination)}</select></label><label class="form-label">出發日期<input type="date" data-home="${i}.date" value="${l.date}" min="${localDate(Date.now(), airportByCode[l.origin].timeZone)}" max="${addDays(localDate(Date.now(), airportByCode[l.origin].timeZone), 364)}" required></label><button type="button" data-remove-leg="${i}" ${d.legs.length === 2 ? "disabled" : ""}>刪除</button></div>`).join("") + `<button type="button" class="text-button" id="add-leg" ${d.legs.length === 4 ? "disabled" : ""}>＋ 新增航程（最多 4 段）</button>` : `<div class="search-grid"><label class="form-label">出發機場<select data-home="0.origin">${airportOptions(d.legs[0].origin)}</select></label><button type="button" class="swap" id="swap" aria-label="交換出發與目的地">⇄</button><label class="form-label">抵達機場<select data-home="0.destination">${airportOptions(d.legs[0].destination)}</select></label><label class="form-label">出發日期<input type="date" data-home="0.date" value="${d.legs[0].date}" min="${localDate(Date.now(), airportByCode[d.legs[0].origin].timeZone)}" max="${addDays(localDate(Date.now(), airportByCode[d.legs[0].origin].timeZone), 364)}" required></label>${d.type === "round-trip" ? `<label class="form-label">回程日期<input type="date" data-home="1.date" value="${d.legs[1].date}" min="${d.legs[0].date}" max="${addDays(localDate(Date.now(), airportByCode[d.legs[0].destination].timeZone), 364)}" required></label>` : ""}</div>`}<div class="search-bottom"><label class="form-label">旅客人數<select id="passenger-count">${Array.from({ length: 9 }, (_, i) => `<option value="${i + 1}" ${d.count === i + 1 ? "selected" : ""}>${i + 1} 位成人</option>`).join("")}</select></label><label class="form-label">需求艙等<select id="search-cabin">${cabinOptions(["Y", "W", "C", "F"], d.cabin)}</select></label><button class="primary" type="submit">搜尋航班 <span aria-hidden="true">→</span></button></div><div id="search-error" class="error" role="alert"></div></form></section><p class="home-notice">僅限年滿 18 歲成人。可查詢今日起 365 天內航班，至少提前 2 小時預訂。所有資料與付款均為虛構模擬。</p><div class="home-features"><div class="feature"><span>01</span><h3>您的航程，由您安排</h3><p>單程、來回或多城市，直飛或一次轉機。</p></div><div class="feature"><span>02</span><h3>依喜好選擇艙等</h3><p>從經濟艙到頭等艙，查看各機型實際可用配置。</p></div><div class="feature"><span>03</span><h3>完整掌握每項費用</h3><p>票價、模擬稅費與加購分列，隨時查看總額。</p></div></div></div>`;
}
export const stepNames = [
  "航班與票種",
  "旅客資料",
  "行李",
  "選位",
  "餐點",
  "訂單確認",
  "模擬付款",
];
export function bookingShell(content) {
  return `<div class="page-head"><span class="eyebrow">預訂機票 · ${s.passengerCount} 位成人</span><h1>${stepNames[s.activeStep - 1]}</h1><p class="small">虛構訂票體驗 · 尚未進行任何真實訂位或付款</p><ol class="steps" aria-label="訂票進度">${stepNames.map((name, i) => `<li><button data-step="${i + 1}" ${i + 1 > s.maxStep || ["processing", "completed"].includes(s.paymentState) ? "disabled" : ""} class="${s.activeStep === i + 1 ? "current" : ""}" ${s.activeStep === i + 1 ? 'aria-current="step"' : ""}><span class="step-number">${i + 1}</span>${name}</button></li>`).join("")}</ol></div><div class="booking-layout"><div id="step-content">${content}<div id="flow-error" class="error" role="alert"></div>${s.activeStep < 7 ? `<div class="flow-actions"><button id="back">${s.activeStep === 1 ? "修改搜尋" : "上一步"}</button><button class="primary" id="next">${s.activeStep === 6 ? "前往模擬付款" : "下一步"} →</button></div>` : ""}</div>${summary()}</div>`;
}
export function summary() {
  const b = calculateOrder(s),
    adjust = conversionAdjustment(b, s.selectedCurrency, [
      b.fare,
      b.tax,
      b.seats + b.bags,
    ]);
  s.priceBreakdown = b;
  return `<aside class="summary" aria-label="即時訂單摘要"><details ${innerWidth >= 768 ? "open" : ""}><summary><h3>訂單摘要 <span class="mobile-total" data-price>${fmt(b.totalTWD)}</span></h3></summary><div class="summary-body">${s.journeys
    .filter((j) => j.option)
    .map(
      (j) =>
        `<div class="summary-journey">${j.origin} → ${j.destination} · ${j.date}<br>${j.option.legs.map((f) => f.flightNo).join(" / ")} · ${families[j.family].name}</div>`,
    )
    .join("")}${[
    ["機票", "fare"],
    ["模擬稅費", "tax"],
    ["附加服務", "extras"],
  ]
    .filter(([, k]) => k !== "extras" || b.seats + b.bags > 0)
    .map(
      ([n, k]) =>
        `<div class="summary-line"><span>${n}</span><strong>${fmt(k === "extras" ? b.seats + b.bags : b[k])}</strong></div>`,
    )
    .join(
      "",
    )}${adjust ? `<div class="summary-line"><span>匯率換算尾差</span><span>${foreignMoney(adjust, s.selectedCurrency)}</span></div>` : ""}<div class="summary-total"><small>${s.passengerCount} 位成人總額</small><strong data-price>${fmt(b.totalTWD)}</strong><small>TWD 基準：${money(b.totalTWD)}</small></div><p class="small" style="margin:18px 0 0">使用固定模擬匯率。餐飲已包含；加購僅計入已選服務。</p></div></details><button class="primary mobile-next" data-mobile-next ${s.paymentState === "processing" ? "disabled" : ""}>${s.paymentState === "completed" ? "完成" : s.activeStep === 7 ? "確認模擬付款" : s.activeStep === 6 ? "前往模擬付款" : "下一步 →"}</button></aside>`;
}
export function getResults(j, date = j.date) {
  const key = [j.id, date, s.passengerCount, j.searchCabin, s.quoteNow].join(
    "|",
  );
  if (!searchCache.has(key))
    searchCache.set(
      key,
      search({
        origin: j.origin,
        destination: j.destination,
        date,
        count: s.passengerCount,
        cabin: j.searchCabin,
        now: s.quoteNow,
      }),
    );
  return searchCache.get(key);
}
export function preferredCabins(j, o) {
  return o.selectableCabinsByLeg.map((available, i) => {
    const desired = j.cabins[i] || j.searchCabin;
    return available.includes(desired) ? desired : o.cabins[i];
  });
}
export function optionSetting(j, o) {
  const key = j.id + "|" + o.key;
  if (j.option?.key === o.key) return { cabins: j.cabins, family: j.family };
  if (!flightSettings.has(key))
    flightSettings.set(key, {
      cabins: preferredCabins(j, o),
      family: j.family,
    });
  return flightSettings.get(key);
}
export function timeLabel(
  f,
  arrival = false,
  referenceDate = f.departureLocalISODate,
) {
  const zone = airportByCode[arrival ? f.destination : f.origin].timeZone,
    instant = arrival ? f.arrivalUTC : f.departureUTC,
    dt = localDateTime(instant, zone),
    diff = dayDiff(dt.slice(0, 10), referenceDate);
  return `${dt.slice(11)}${arrival && diff ? ` <sup class="small">${diff > 0 ? "+" : ""}${diff}日</sup>` : ""}`;
}
export function legDetail(f, c) {
  const arrival = localDateTime(
    f.arrivalUTC,
    airportByCode[f.destination].timeZone,
  );
  const offset = dayDiff(arrival.slice(0, 10), f.departureLocalISODate);
  return `<div class="flight-leg"><strong>${f.flightNo} · ${f.aircraftType}${c ? " · " + cabinNames[c] : ""}</strong><br>${airportByCode[f.origin].nameZh} ${f.origin} → ${airportByCode[f.destination].nameZh} ${f.destination}<br>${localDateTime(f.departureUTC, airportByCode[f.origin].timeZone)} (${airportByCode[f.origin].timeZone})<br>→ ${arrival}${offset ? `（${offset > 0 ? "+" : ""}${offset}日）` : ""} (${airportByCode[f.destination].timeZone})<br>飛行 ${Math.floor(f.durationMinutes / 60)} 小時 ${f.durationMinutes % 60} 分鐘</div>`;
}
export function flightsView() {
  return s.journeys
    .map((j, ji) => {
      const results = [...getResults(j)];
      for (const o of results) {
        const st = optionSetting(j, o);
        o.advertisedTotalTWD = itineraryPrice(
          o,
          st.cabins,
          st.family,
          s.passengerCount,
          s.quoteNow,
        );
      }
      results.sort(sorter(j.sort || "price"));
      return `<section class="panel"><div class="journey-header"><div><span class="eyebrow">航程 ${ji + 1} / ${s.journeys.length}</span><h2>${airportByCode[j.origin].nameZh} → ${airportByCode[j.destination].nameZh}</h2><span class="small">${j.date} · ${s.passengerCount} 位成人 · ${cabinNames[j.searchCabin]}需求</span></div></div><div class="dates" aria-label="前後三日最低可售票價">${Array.from(
        { length: 7 },
        (_, n) => {
          const d = addDays(j.date, n - 3),
            os = getResults(j, d),
            best = os.length
              ? Math.min(
                  ...os.map((o) =>
                    itineraryPrice(
                      o,
                      preferredCabins(j, o),
                      j.family,
                      s.passengerCount,
                      s.quoteNow,
                    ),
                  ),
                )
              : null;
          return `<button class="date-tile ${d === j.date ? "active" : ""}" data-date="${ji}|${d}" ${!bookableDate(d, airportByCode[j.origin].timeZone, s.quoteNow) ? "disabled" : ""}>${d.slice(5).replace("-", "/")}<strong>${best === null ? "無航班" : fmt(best)}</strong></button>`;
        },
      ).join(
        "",
      )}</div><div class="between" style="margin:15px 0"><span class="small">${results.length} 個可售航班組合 · 日期帶為${families[j.family].name}票種最低總價</span><label class="form-label">排序<select data-sort="${ji}">${options(
        [
          ["price", "最低總價"],
          ["departure", "最早起飛"],
          ["arrival", "最早抵達"],
          ["duration", "最短總旅程"],
        ],
        j.sort || "price",
      )}</select></label></div>${
        results.length
          ? results
              .map((o) => {
                const st = optionSetting(j, o),
                  sel = j.option?.key === o.key,
                  first = o.legs[0],
                  last = o.legs.at(-1);
                return `<article class="flight-card ${sel ? "selected" : ""}"><div class="flight-main"><div class="time">${timeLabel(first)}<small>${first.origin} · ${first.departureLocalISODate.slice(5)}</small></div><div class="flight-route"><span>${Math.floor(o.totalTravelMinutes / 60)} 小時 ${o.totalTravelMinutes % 60} 分鐘</span><span class="route-line"></span><span>${o.connectionAirport ? "於 " + o.connectionAirport + " 轉機一次" : "直飛"}</span></div><div class="time">${timeLabel(last, true, first.departureLocalISODate)}<small>${last.destination} · ${localDate(last.arrivalUTC, airportByCode[last.destination].timeZone).slice(5)}</small></div><div class="flight-price"><span>${fmt(o.advertisedTotalTWD)}<small>${s.passengerCount} 人含模擬稅費</small></span><button class="${sel ? "outline" : "primary"}" data-select-flight="${ji}|${o.key}" style="margin-top:8px">${sel ? "✓ 已選擇" : "選擇航班"}</button></div></div><details class="flight-details" data-flight-detail="${ji}|${o.key}" ${sel ? "open" : ""}><summary>${o.legs.map((f) => f.flightNo + " · " + f.aircraftType).join(" ／ ")} · 航班詳情與票種${st.cabins.some((c) => c !== j.searchCabin) ? " · 含替代艙等" : ""}</summary>${o.legs.map((f, i) => legDetail(f, st.cabins[i]) + (i === 0 && o.layoverMinutes ? `<div class="notice">${o.connectionAirport} 同機場轉機，等候 ${Math.floor(o.layoverMinutes / 60)} 小時 ${o.layoverMinutes % 60} 分鐘</div>` : "")).join("")}<div class="flight-options">${o.legs.map((f, i) => `<label class="form-label">${f.flightNo} 艙等<select data-flight-cabin="${ji}|${o.key}|${i}">${cabinOptions(o.selectableCabinsByLeg[i], st.cabins[i])}</select></label>`).join("")}</div>${fareComparison(j, o, st, ji)}</details></article>`;
              })
              .join("")
          : `<div class="empty">無可售航班<br><small>此航線、日期或艙等可能無足夠座位。請查看鄰近日期，或修改搜尋。</small></div>`
      }</section>`;
    })
    .join("");
}
const countries = [
  ["", "請選擇"],
  ["TW", "台灣"],
  ["JP", "日本"],
  ["KR", "韓國"],
  ["HK", "香港"],
  ["SG", "新加坡"],
  ["TH", "泰國"],
  ["MY", "馬來西亞"],
  ["PH", "菲律賓"],
  ["VN", "越南"],
  ["GB", "英國"],
  ["FR", "法國"],
  ["DE", "德國"],
  ["NL", "荷蘭"],
  ["US", "美國"],
  ["CA", "加拿大"],
  ["AU", "澳洲"],
  ["NZ", "紐西蘭"],
  ["CN", "中國"],
  ["OTHER", "其他國家／地區"],
];
export function travelersView() {
  return `<div class="notice" style="margin-bottom:20px">請使用虛構資料。可一鍵填入測試資料，無需提供真實個資。</div><div class="row" style="justify-content:flex-end;margin-bottom:16px"><button id="demo-data" class="outline">填入虛構測試資料</button></div>${s.travelers
    .map(
      (t, i) =>
        `<section class="panel"><h2>成人 ${i + 1}</h2><div class="form-grid">${field(
          "稱謂",
          t.id + ".title",
          t.title,
          {
            required: true,
            list: [
              ["", "請選擇"],
              ["MR", "先生"],
              ["MS", "女士"],
              ["MX", "中性稱謂"],
            ],
          },
        )}${field("英文姓", t.id + ".surname", t.surname, { required: true })}${field("英文名", t.id + ".givenName", t.givenName, { required: true })}${field("出生日期", t.id + ".birthDate", t.birthDate, { type: "date", required: true, max: localDate() })}${field("國籍／地區", t.id + ".nationality", t.nationality, { required: true, list: countries })}${field(
          "證件性別（選填）",
          t.id + ".documentSex",
          t.documentSex,
          {
            list: [
              ["", "未指定"],
              ["M", "M"],
              ["F", "F"],
              ["X", "X"],
            ],
          },
        )}${field("模擬護照號碼（選填）", t.id + ".passportNumber", t.passportNumber)}${field("發照國家／地區", t.id + ".passportIssueCountry", t.passportIssueCountry, { list: countries })}${field("護照效期", t.id + ".passportExpiry", t.passportExpiry, { type: "date" })}${field("常客號碼（選填，僅展示）", t.id + ".loyaltyNumber", t.loyaltyNumber)}</div></section>`,
    )
    .join(
      "",
    )}<section class="panel"><h2>訂單聯絡資料</h2><div class="form-grid">${field("聯絡姓名", "contact.name", s.contact.name, { required: true })}${field("測試電子郵件", "contact.email", s.contact.email, { type: "email", required: true })}${field("電話（含 + 國碼）", "contact.phone", s.contact.phone, { type: "tel", required: true })}</div></section>`;
}
export function bagsView() {
  return `<p class="notice">免費託運額度以外，每位旅客每個方向最多加購 3 件。轉機聯程只收一次費用。</p>${s.journeys
    .map((j, ji) => {
      const a = allowance(j);
      return `<section class="panel"><h2>航程 ${ji + 1} · ${j.origin} → ${j.destination}</h2><p class="small">免費託運 ${a.pieces} 件 × ${a.kg} kg · 手提 ${a.hand} 件 × 7 kg</p>${s.travelers
        .map((t, ti) => {
          const bags = service(t.id, j.id).bags;
          return `<section class="baggage-traveler"><h3>${esc(t.surname)} / ${esc(t.givenName)}</h3><div class="baggage-options">${[
            23, 32,
          ]
            .map((kg) => {
              const count = bags.filter((b) => b === kg).length;
              return `<div class="baggage-option"><div><strong>${kg === 23 ? "一般行李" : "大型行李"} <span>${kg} kg</span></strong><small>每件 ${fmt(bagPrice(j, kg))}</small></div><div class="quantity-control" aria-label="${esc(t.surname)} ${kg} kg 行李數量"><button data-bag-change="${ji}|${ti}|${kg}|-1" aria-label="減少 ${kg} kg 行李" ${count === 0 ? "disabled" : ""}>−</button><output aria-live="polite">${count}</output><button data-bag-change="${ji}|${ti}|${kg}|1" aria-label="增加 ${kg} kg 行李" ${bags.length >= 3 ? "disabled" : ""}>＋</button></div></div>`;
            })
            .join(
              "",
            )}</div><p class="small">已加購 ${bags.length} / 3 件${bags.length ? " · " + fmt(bags.reduce((total, kg) => total + bagPrice(j, kg), 0)) : ""}</p></section>`;
        })
        .join("")}</section>`;
    })
    .join("")}`;
}
export function paymentView() {
  const processing = s.paymentState === "processing";
  if (s.paymentState === "completed")
    return `<section class="panel authorization-success" role="status"><div class="authorization-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="3"/><path d="m19 32 9 9 18-19" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><span class="eyebrow">模擬付款授權</span><h2>授權成功</h2><p>測試卡片已完成授權，您的行程已準備就緒。</p><div class="authorization-amount"><span>本次授權金額</span><strong>${fmt(s.confirmation.frozenBookingSnapshot.priceBreakdown.totalTWD)}</strong></div><p class="small">此為模擬付款，不會產生真實扣款。<br>按下「完成」查看行程確認與下載電子行程單。</p><button class="primary" id="finish-payment">完成 →</button></section>`;
  return `<section class="panel"><h2>選擇虛構測試卡片</h2><p class="notice">此為模擬付款，不會扣款。請勿提供真實信用卡資料。</p><div class="payment-cards">${cards.map(([id, name, expiry]) => `<button class="pay-card ${(s.card || "DEMO-GOLD") === id ? "active" : ""}" data-card="${id}" aria-pressed="${(s.card || "DEMO-GOLD") === id}" ${processing ? "disabled" : ""}><strong>${name}</strong><span>${id}</span><small>TEST USER<br>${expiry}　 •••</small></button>`).join("")}</div><div class="summary-total"><span>模擬付款總額</span><strong>${fmt(calculateOrder(s).totalTWD)}</strong></div>${processing ? '<div class="processing" role="status"><div class="spinner"></div>正在處理模擬付款，請稍候…<br><small>處理期間無法修改訂單</small></div>' : `<div class="flow-actions"><button data-step="6">返回確認</button><button id="pay" class="primary">確認模擬付款</button></div>`}${s.paymentError ? `<p class="error" role="alert">${esc(s.paymentError)}，訂單已保留，請重新嘗試。</p>` : ""}</section>`;
}
export function confirmationView() {
  return `<div class="confirmation"><section class="confirmation-top"><div class="checkmark">✓</div><span class="eyebrow">模擬訂位完成</span><h1>您的行程已確認</h1><p class="small">六碼虛構訂位代號</p><div class="pnr">${s.confirmation.pnr}</div><p class="small">出票時間 ${localDateTime(Date.parse(s.confirmation.completedAtUTC), "Asia/Taipei")}（Asia/Taipei）</p><div class="notice">此為模擬訂位，無旅行效力，不能用於搭機或支付。<br>離開本頁或重新整理後，無法查回或再次下載此筆訂單。</div><div class="download-actions"><button class="primary" id="download-pdf">下載 A4 電子行程單 PDF</button><button id="new-booking">返回首頁</button></div></section><div style="margin-top:24px">${reviewView(true)}</div></div>`;
}
export function render() {
  const main = document.querySelector("#main");
  const oldScroll = window.scrollY;
  const viewKey = s.screen + ":" + s.activeStep;
  const changedView = main.dataset.view !== viewKey;
  const comparisonScroll = [
    ...main.querySelectorAll("[data-fare-comparison]"),
  ].map((el) => [el.dataset.fareComparison, el.scrollLeft]);
  const focused = main.contains(document.activeElement)
    ? document.activeElement
    : null;
  const focusAttribute =
    focused &&
    [...focused.attributes].find(
      (a) => a.name === "id" || a.name.startsWith("data-"),
    );
  const focusSelector = focusAttribute
    ? `[${focusAttribute.name}="${CSS.escape(focusAttribute.value)}"]`
    : null;
  const focusedTop = focused?.getBoundingClientRect().top;
  const openFlights = [...main.querySelectorAll("[data-flight-detail]")].map(
    (el) => ({
      key: el.dataset.flightDetail,
      open: el.open,
      selected: el.closest(".flight-card").classList.contains("selected"),
    }),
  );
  const termsOpen = [...main.querySelectorAll(".review-terms")].map(
    (el) => el.open,
  );
  const summaryOpen = main.querySelector(".summary details")?.open;
  const seatScroll = main.querySelector(".seat-shell")?.scrollLeft;
  document.querySelector("#currency").value = s.selectedCurrency;
  document.querySelectorAll("header button, header select").forEach((el) => {
    el.disabled = s.paymentState === "processing";
  });
  main.innerHTML =
    s.screen === "home"
      ? home()
      : s.screen === "confirmation"
        ? confirmationView()
        : bookingShell(
            [
              null,
              flightsView,
              travelersView,
              bagsView,
              seatsView,
              mealsView,
              reviewView,
              paymentView,
            ][s.activeStep](),
          );
  main.dataset.view = viewKey;
  main.classList.toggle("view-enter", changedView);
  for (const [key, position] of comparisonScroll) {
    const el = main.querySelector(
      `[data-fare-comparison="${CSS.escape(key)}"]`,
    );
    if (el) el.scrollLeft = position;
  }
  for (const previous of openFlights) {
    const detail = main.querySelector(
      `[data-flight-detail="${CSS.escape(previous.key)}"]`,
    );
    if (
      detail &&
      detail.closest(".flight-card").classList.contains("selected") ===
        previous.selected
    )
      detail.open = previous.open;
  }
  main.querySelectorAll(".review-terms").forEach((el, i) => {
    if (termsOpen[i] !== undefined) el.open = termsOpen[i];
  });
  const summaryDetails = main.querySelector(".summary details");
  if (summaryDetails && summaryOpen !== undefined)
    summaryDetails.open = summaryOpen;
  const seatShell = main.querySelector(".seat-shell");
  if (seatShell && seatScroll !== undefined) seatShell.scrollLeft = seatScroll;
  const restoredFocus = focusSelector && main.querySelector(focusSelector);
  if (restoredFocus) restoredFocus.focus({ preventScroll: true });
  const anchorShift =
    !changedView && restoredFocus && focusedTop !== undefined
      ? restoredFocus.getBoundingClientRect().top - focusedTop
      : 0;
  window.scrollTo(0, oldScroll + anchorShift);
}
