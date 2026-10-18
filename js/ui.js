import { state as s, service } from "./state.js";
import { airports, airportByCode, aircraft } from "./data.js";
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
  seatPrice,
  miles,
  conversionAdjustment,
  foreignMoney,
} from "./pricing.js";
import { inventory } from "./inventory.js";
import { families, cabinNames, categoryNames } from "../assets/data/fares.js";
import { mealOptions, serviceCount, mealName } from "./meals.js";
import { cards } from "./payment.js";
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
export const seatContext = { journey: 0, leg: 0, traveler: 0 };
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
  return `<div class="page-head"><span class="eyebrow">預訂機票 · ${s.passengerCount} 位成人</span><h1>${stepNames[s.activeStep - 1]}</h1><p class="small">虛構訂票體驗 · 尚未進行任何真實訂位或付款</p><ol class="steps" aria-label="訂票進度">${stepNames.map((name, i) => `<li><button data-step="${i + 1}" ${i + 1 > s.maxStep || s.paymentState === "processing" ? "disabled" : ""} class="${s.activeStep === i + 1 ? "current" : ""}" ${s.activeStep === i + 1 ? 'aria-current="step"' : ""}><span class="step-number">${i + 1}</span>${name}</button></li>`).join("")}</ol></div><div class="booking-layout"><div id="step-content">${content}<div id="flow-error" class="error" role="alert"></div>${s.activeStep < 7 ? `<div class="flow-actions"><button id="back">${s.activeStep === 1 ? "修改搜尋" : "上一步"}</button><button class="primary" id="next">${s.activeStep === 6 ? "前往模擬付款" : "下一步"} →</button></div>` : ""}</div>${summary()}</div>`;
}
export function summary() {
  const b = calculateOrder(s),
    adjust = conversionAdjustment(b, s.selectedCurrency);
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
    ["選位服務", "seats"],
    ["額外行李", "bags"],
  ]
    .map(
      ([n, k]) =>
        `<div class="summary-line"><span>${n}</span><strong>${fmt(b[k])}</strong></div>`,
    )
    .join(
      "",
    )}${adjust ? `<div class="summary-line"><span>匯率換算尾差</span><span>${foreignMoney(adjust, s.selectedCurrency)}</span></div>` : ""}<div class="summary-total"><small>${s.passengerCount} 位成人總額</small><strong data-price>${fmt(b.totalTWD)}</strong><small>TWD 基準：${money(b.totalTWD)}</small></div><p class="small" style="margin:18px 0 0">使用固定模擬匯率。餐飲已包含；加購僅計入已選服務。</p></div></details><button class="primary mobile-next" data-mobile-next ${s.paymentState === "processing" ? "disabled" : ""}>${s.activeStep === 7 ? "確認模擬付款" : s.activeStep === 6 ? "前往模擬付款" : "下一步 →"}</button></aside>`;
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
export function benefits(j) {
  const a = allowance(j),
    f = families[j.family];
  return `免費託運 ${a.pieces} 件 × ${a.kg} kg；手提 ${a.hand} 件，每件 7 kg。<br>模擬累積里程 ${miles(j).toLocaleString()} 英里。改票手續費 ${fmt(f.change)}／每人每方向，另可能有票差；${f.refund === null ? "不可退票" : "退票手續費 " + fmt(f.refund) + "／每人每方向"}。<br>選位權益：${j.cabins.map((c) => cabinNames[c] + " " + ("FC".includes(c) ? "全部免費" : c === "Y" ? ["選位付費", "一般座位免費", "一般及優選免費"][Object.keys(families).indexOf(j.family)] : ["一般免費", "一般及優選免費", "一般、優選、加大腿部空間免費"][Object.keys(families).indexOf(j.family)])).join("；")}。僅展示條款，不提供售後交易。`;
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
                  last = o.legs.at(-1),
                  temp = {
                    ...j,
                    option: o,
                    cabins: st.cabins,
                    family: st.family,
                  };
                return `<article class="flight-card ${sel ? "selected" : ""}"><div class="flight-main"><div class="time">${timeLabel(first)}<small>${first.origin} · ${first.departureLocalISODate.slice(5)}</small></div><div class="flight-route"><span>${Math.floor(o.totalTravelMinutes / 60)} 小時 ${o.totalTravelMinutes % 60} 分鐘</span><span class="route-line"></span><span>${o.connectionAirport ? "於 " + o.connectionAirport + " 轉機一次" : "直飛"}</span></div><div class="time">${timeLabel(last, true, first.departureLocalISODate)}<small>${last.destination} · ${localDate(last.arrivalUTC, airportByCode[last.destination].timeZone).slice(5)}</small></div><div class="flight-price"><span>${fmt(o.advertisedTotalTWD)}<small>${s.passengerCount} 人含模擬稅費</small></span><button class="${sel ? "outline" : "primary"}" data-select-flight="${ji}|${o.key}" style="margin-top:8px">${sel ? "✓ 已選擇" : "選擇航班"}</button></div></div><details class="flight-details" data-flight-detail="${ji}|${o.key}" ${sel ? "open" : ""}><summary>${o.legs.map((f) => f.flightNo + " · " + f.aircraftType).join(" ／ ")} · 航班詳情與票種${st.cabins.some((c) => c !== j.searchCabin) ? " · 含替代艙等" : ""}</summary>${o.legs.map((f, i) => legDetail(f, st.cabins[i]) + (i === 0 && o.layoverMinutes ? `<div class="notice">${o.connectionAirport} 同機場轉機，等候 ${Math.floor(o.layoverMinutes / 60)} 小時 ${o.layoverMinutes % 60} 分鐘</div>` : "")).join("")}<div class="flight-options">${o.legs.map((f, i) => `<label class="form-label">${f.flightNo} 艙等<select data-flight-cabin="${ji}|${o.key}|${i}">${cabinOptions(o.selectableCabinsByLeg[i], st.cabins[i])}</select></label>`).join("")}<label class="form-label">此方向全部航段共用票種<select data-flight-family="${ji}|${o.key}">${options(
                  Object.entries(families).map(([v, x]) => [
                    v,
                    x.name + " " + v,
                  ]),
                  st.family,
                )}</select></label></div><div class="fare-benefits">${benefits(temp)}</div></details></article>`;
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
  return `<p class="notice">聯程免費額度取各航段較嚴格條件；額外行李每位旅客每方向只收一次，最多三件。</p>${s.journeys
    .map((j, ji) => {
      const a = allowance(j);
      return `<section class="panel"><h2>航程 ${ji + 1} · ${j.origin} → ${j.destination}</h2><p class="small">免費託運 ${a.pieces} 件 × ${a.kg} kg · 手提 ${a.hand} 件 × 7 kg</p>${s.travelers
        .map((t, ti) => {
          const b = service(t.id, j.id).bags;
          return `<div class="service-row"><div><strong>${esc(t.surname)} / ${esc(t.givenName)}</strong><div class="bag-list">${b.map((kg, n) => `<span class="chip">${kg} kg · ${fmt(bagPrice(j, kg))}<button data-remove-bag="${ji}|${ti}|${n}" aria-label="移除此件行李">×</button></span>`).join("") || "<small>尚未加購額外行李</small>"}</div></div><div class="bag-controls"><select id="bag-${ji}-${ti}" aria-label="額外行李重量"><option value="23">23 kg · ${fmt(bagPrice(j, 23))}</option><option value="32">32 kg · ${fmt(bagPrice(j, 32))}</option></select><button data-add-bag="${ji}|${ti}" ${b.length >= 3 ? "disabled" : ""}>＋ 加購</button></div></div>`;
        })
        .join("")}</section>`;
    })
    .join("")}`;
}
export function seatsView() {
  const ctx = seatContext;
  ctx.journey = Math.min(ctx.journey, s.journeys.length - 1);
  const j = s.journeys[ctx.journey];
  ctx.leg = Math.min(ctx.leg, j.option.legs.length - 1);
  ctx.traveler = Math.min(ctx.traveler, s.travelers.length - 1);
  const f = j.option.legs[ctx.leg],
    c = j.cabins[ctx.leg],
    t = s.travelers[ctx.traveler],
    inv = inventory(f, c),
    a = aircraft[f.aircraftType],
    chosen = service(t.id, j.id).seats[f.instanceKey];
  return `<section class="panel"><div class="between row wrap"><h2 style="margin:0">選擇您的座位</h2><button id="auto-seats" class="outline">自動分配可用座位</button></div><p class="small">按座位查看並選取；系統自動分配若需付費，會先顯示總額徵詢確認。</p><div class="seat-controls"><label class="form-label">實際飛行航段<select id="seat-flight">${s.journeys.flatMap((j, ji) => j.option.legs.map((f, li) => `<option value="${ji}|${li}" ${ji === ctx.journey && li === ctx.leg ? "selected" : ""}>航程 ${ji + 1} · ${f.flightNo} ${f.origin} → ${f.destination} · ${f.aircraftType}</option>`)).join("")}</select></label><label class="form-label">旅客<select id="seat-traveler">${s.travelers.map((t, i) => `<option value="${i}" ${i === ctx.traveler ? "selected" : ""}>成人 ${i + 1} · ${esc(t.surname)}</option>`).join("")}</select></label></div><p class="notice" style="margin-top:16px">${cabinNames[c]} · ${families[j.family].name} · ${f.aircraftType}<br>目前選位：${chosen || "尚未選擇"}${
    chosen
      ? " · " +
        fmt(
          seatPrice(
            c,
            j.family,
            inv.seats.find((x) => x.id === chosen),
          ),
        )
      : ""
  }</p><div class="seat-legend"><span>可選</span><span style="--box:#d8dce0">已占／其他艙等</span><span style="--box:#132847">本人已選</span><span style="--box:#bca47b">其他旅客已選</span><span style="--box:#d4e5dc">加大腿部空間</span><span style="--box:#e7e1d3">優選</span></div><div class="seat-shell"><div class="seat-map">${Object.entries(
    a.cabins,
  )
    .map(
      ([cc, [first, last, blocks]]) =>
        `<div class="seat-cabin-title">${cabinNames[cc]} · ${a.capacityByCabin[cc]} 席</div>${Array.from(
          { length: last - first + 1 },
          (_, n) => {
            const row = first + n;
            return `<div class="seat-row"><span class="row-number">${row}</span>${blocks
              .split("|")
              .map(
                (letters, bi) =>
                  `${bi ? '<span class="aisle" aria-hidden="true"></span>' : ""}<div class="seat-block">${[
                    ...letters,
                  ]
                    .map((letter) => {
                      const seat = a.seats.find((x) => x.id === row + letter);
                      if (!seat)
                        return '<span class="seat-gap" aria-hidden="true"></span>';
                      const other = s.travelers.some(
                          (x) =>
                            x.id !== t.id &&
                            service(x.id, j.id).seats[f.instanceKey] ===
                              seat.id,
                        ),
                        taken =
                          cc !== c || inventory(f, cc).occupied.has(seat.id),
                        selected = chosen === seat.id;
                      return `<button class="seat ${seat.category} ${selected ? "selected" : ""} ${other ? "other" : ""}" data-seat="${seat.id}" ${taken || other ? "disabled" : ""} aria-label="${seat.id} ${cabinNames[cc]} ${categoryNames[seat.category]} ${taken ? "不可選" : other ? "其他旅客已選" : fmt(seatPrice(cc, j.family, seat))}" aria-pressed="${selected}">${seat.id}</button>`;
                    })
                    .join("")}</div>`,
              )
              .join("")}</div>`;
          },
        ).join("")}`,
    )
    .join(
      "",
    )}</div></div><h3>選位進度</h3>${s.journeys.map((j) => j.option.legs.map((f) => `<p class="small">${f.flightNo}：${s.travelers.map((t) => esc(t.surname) + " " + (service(t.id, j.id).seats[f.instanceKey] || "尚未選位")).join(" ／ ")}</p>`).join("")).join("")}</section>`;
}
export function ensureMeals() {
  for (const j of s.journeys)
    for (let i = 0; i < j.option.legs.length; i++) {
      const f = j.option.legs[i];
      for (const t of s.travelers) {
        const sv = service(t.id, j.id);
        sv.meals[f.instanceKey] ??= Array.from(
          { length: serviceCount(f) },
          (_, n) => mealOptions(f, j.cabins[i], n)[0][0],
        );
      }
    }
}
export function mealsView() {
  ensureMeals();
  return `<div class="notice" style="margin-bottom:20px">所有餐點均已包含。食品及特殊餐為虛構示範，不保證真實過敏原或宗教飲食認證。</div>${s.journeys.map((j, ji) => j.option.legs.map((f, li) => `<section class="panel"><h2>${f.flightNo} · ${f.origin} → ${f.destination}</h2><p class="small">${cabinNames[j.cabins[li]]} · ${serviceCount(f)} 次完整餐飲服務 · ${fmt(0)}</p>${s.travelers.map((t, ti) => `<div class="review-section"><h3>${esc(t.surname)} / ${esc(t.givenName)}</h3><div class="meal-services">${Array.from({ length: serviceCount(f) }, (_, n) => `<label class="form-label">第 ${n + 1} 次餐飲<select data-meal="${ji}|${li}|${ti}|${n}">${options(mealOptions(f, j.cabins[li], n), service(t.id, j.id).meals[f.instanceKey][n])}</select></label>`).join("")}</div></div>`).join("")}</section>`).join("")).join("")}`;
}
export function reviewView(completed = false) {
  const order = completed ? s.confirmation.frozenBookingSnapshot || s : s;
  const b =
    completed && order.priceBreakdown
      ? order.priceBreakdown
      : calculateOrder(order);
  const adjust = conversionAdjustment(b, s.selectedCurrency, [
    ...b.segmentFaresTWD.map((p) => p.amount),
    ...b.segmentTaxesTWD.map((p) => p.amount),
    b.seats,
    b.bags,
  ]);
  const getService = (tid, jid) =>
    order.services[tid]?.[jid] || { seats: {}, meals: {}, bags: [] };
  return `<section class="panel"><div class="review-title"><h2>航程與服務</h2>${completed ? "" : '<button class="text-button" data-step="1">修改航班</button>'}</div>${order.journeys
    .map(
      (j, ji) =>
        `<section class="review-section"><h3>航程 ${ji + 1} · ${j.origin} → ${j.destination} · ${families[j.family].name}</h3>${j.option.legs.map((f, li) => `${legDetail(f, j.cabins[li])}${li === 0 && j.option.layoverMinutes ? `<p>於 ${j.option.connectionAirport} 轉機，等候 ${j.option.layoverMinutes} 分鐘</p>` : ""}${order.travelers.map((t) => `<p>${esc(t.surname)} / ${esc(t.givenName)} · 座位 ${getService(t.id, j.id).seats[f.instanceKey]}<br>餐飲：${(getService(t.id, j.id).meals[f.instanceKey] || []).map(mealName).join(" ／ ")}</p>`).join("")}`).join("")}${order.travelers
          .map(
            (t) =>
              `<p>${esc(t.surname)} 免費託運 ${allowance(j).pieces} 件 × ${allowance(j).kg} kg，手提 ${allowance(j).hand} 件 × 7 kg<br>額外加購：${
                getService(t.id, j.id)
                  .bags.map((kg) => kg + " kg")
                  .join("、") || "無"
              }</p>`,
          )
          .join("")}<div class="fare-benefits">${benefits(j)}</div></section>`,
    )
    .join(
      "",
    )}</section><section class="panel"><div class="review-title"><h2>旅客及聯絡人</h2>${completed ? "" : '<button class="text-button" data-step="2">修改旅客</button>'}</div>${order.travelers.map((t) => `<p>${esc(t.title)} ${esc(t.surname)} / ${esc(t.givenName)} · ${esc(t.birthDate)} · ${esc(t.nationality)}${completed ? `<br>虛構電子票號：<strong>${s.confirmation.ticketsByTravelerId[t.id]}</strong>` : ""}</p>`).join("")}<p class="small">${esc(order.contact.name)} · ${esc(order.contact.email)} · ${esc(order.contact.phone)}</p>${completed ? "" : `<div class="row wrap"><button class="text-button" data-step="3">修改行李</button><button class="text-button" data-step="4">修改座位</button><button class="text-button" data-step="5">修改餐點</button></div>`}</section><section class="panel"><h2>費用明細</h2>${b.segmentFaresTWD.map((p, i) => `<div class="summary-line"><span>${p.flight} · ${cabinNames[p.cabin]} 機票<br><small>${fmt(p.unit)} × ${p.count}</small></span><strong>${fmt(p.amount)}</strong></div><div class="summary-line"><span>${p.flight} 模擬稅費</span><span>${fmt(b.segmentTaxesTWD[i].amount)}</span></div>`).join("")}<div class="summary-line"><span>選位服務</span><strong>${fmt(b.seats)}</strong></div><div class="summary-line"><span>額外行李</span><strong>${fmt(b.bags)}</strong></div>${adjust ? `<div class="summary-line"><span>匯率換算尾差</span><span>${foreignMoney(adjust, s.selectedCurrency)}</span></div>` : ""}<div class="summary-total">${order.passengerCount} 位成人總額<strong>${fmt(b.totalTWD)}</strong><small>TWD 基準總額 ${money(b.totalTWD)}</small></div></section>${completed ? "" : `<label class="row notice"><input id="review-check" type="checkbox" ${s.reviewed ? "checked" : ""} style="width:20px;flex-shrink:0;margin:0">我已確認航程、旅客、服務及模擬退改條款，理解本網站不提供真實航空服務。</label>`}`;
}
export function paymentView() {
  const processing = s.paymentState === "processing";
  return `<section class="panel"><h2>選擇虛構測試卡片</h2><p class="notice">此為模擬付款，不會扣款。請勿提供真實信用卡資料。</p><div class="payment-cards">${cards.map(([id, name, expiry]) => `<button class="pay-card ${(s.card || "DEMO-GOLD") === id ? "active" : ""}" data-card="${id}" aria-pressed="${(s.card || "DEMO-GOLD") === id}" ${processing ? "disabled" : ""}><strong>${name}</strong><span>${id}</span><small>TEST USER<br>${expiry}　 •••</small></button>`).join("")}</div><div class="summary-total"><span>模擬付款總額</span><strong>${fmt(calculateOrder(s).totalTWD)}</strong><small>實際扣款 ${fmt(0)}</small></div>${processing ? '<div class="processing" role="status"><div class="spinner"></div>正在處理模擬付款，請稍候…<br><small>處理期間無法修改訂單</small></div>' : `<div class="flow-actions"><button data-step="6">返回確認</button><button id="pay" class="primary">確認模擬付款</button></div>`}${s.paymentError ? `<p class="error" role="alert">${esc(s.paymentError)}，訂單已保留，請重新嘗試。</p>` : ""}<p class="small">模擬處理需 3–5 秒，成功率 98%。測試卡種類不影響結果。</p></section>`;
}
export function confirmationView() {
  const order = s.confirmation.frozenBookingSnapshot || s;
  return `<div class="confirmation"><section class="confirmation-top"><div class="checkmark">✓</div><span class="eyebrow">模擬訂位完成</span><h1>您的行程已確認</h1><p class="small">六碼虛構訂位代號</p><div class="pnr">${s.confirmation.pnr}</div><p class="small">出票時間 ${localDateTime(Date.parse(s.confirmation.completedAtUTC), "Asia/Taipei")}（Asia/Taipei）</p><div class="notice">此為模擬訂位，無旅行效力，不能用於搭機或支付。<br>離開本頁或重新整理後，無法查回或再次下載此筆訂單。</div><div class="download-actions"><button class="primary" id="download-pdf">下載 A4 電子行程單 PDF</button><button id="new-booking">返回首頁</button></div></section>${order.travelers.map((t) => `<div class="ticket"><div class="between row wrap"><span>${esc(t.surname)} / ${esc(t.givenName)}</span><strong>${s.confirmation.ticketsByTravelerId[t.id]}</strong></div><small>虛構電子票號 · 無旅行效力</small></div>`).join("")}<div style="margin-top:24px">${reviewView(true)}</div></div>`;
}
export function render() {
  const main = document.querySelector("#main");
  const oldScroll = window.scrollY;
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
  const openFlights = [
    ...main.querySelectorAll("[data-flight-detail][open]"),
  ].map((el) => el.dataset.flightDetail);
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
  for (const key of openFlights)
    main
      .querySelector(`[data-flight-detail="${CSS.escape(key)}"]`)
      ?.setAttribute("open", "");
  const summaryDetails = main.querySelector(".summary details");
  if (summaryDetails && summaryOpen !== undefined)
    summaryDetails.open = summaryOpen;
  const seatShell = main.querySelector(".seat-shell");
  if (seatShell && seatScroll !== undefined) seatShell.scrollLeft = seatScroll;
  if (focusSelector)
    main.querySelector(focusSelector)?.focus({ preventScroll: true });
  window.scrollTo(0, oldScroll);
}
