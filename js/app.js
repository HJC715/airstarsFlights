import { state as s, reset, service } from "./state.js";
import {
  render,
  homeDraft as draft,
  getResults,
  optionSetting,
  invalidateSearch,
  flightSettings,
  seatContext,
  setErrors,
  fmt,
} from "./ui.js";
import { airportByCode, validateData } from "./data.js";
import { bookableDate, addDays, localDate } from "./timezone.js";
import {
  validateFlights,
  validateTravelers,
  validateSeats,
  validateMeals,
  clearJourneyServices,
} from "./booking.js";
import { calculateOrder } from "./pricing.js";
import { autoSeats } from "./seatmap.js";
import { selectSeat, moveSeatFlight } from "./seat-ui.js";
import { inventory } from "./inventory.js";
import { pay } from "./payment.js";
import { downloadPDF } from "./pdf.js";
import { animateMoney } from "./animation.js";
let toastTimer;
function toast(msg) {
  const el = document.querySelector("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}
function flowError(msg) {
  const el = document.querySelector("#flow-error");
  if (el) {
    el.textContent = msg;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } else toast(msg);
}
function rerender({ top = false } = {}) {
  const old = s.priceBreakdown?.totalTWD || 0;
  const visibleAmount = Number(
    document.querySelector("[data-price]")?.dataset.numericAmount,
  );
  render();
  const next = calculateOrder(s).totalTWD;
  if (old !== next)
    document
      .querySelectorAll("[data-price]")
      .forEach((el) =>
        animateMoney(
          el,
          Number.isFinite(visibleAmount) ? visibleAmount : old,
          next,
          fmt,
        ),
      );
  if (top) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector("#main").focus({ preventScroll: true });
    document
      .querySelector(".steps .current")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }
}
function goHome() {
  if (s.paymentState === "processing") return;
  if (
    s.journeys.length &&
    s.screen !== "confirmation" &&
    s.paymentState !== "completed" &&
    !confirm("尚有未付款草稿，確定捨棄並返回首頁？")
  )
    return;
  if (
    (s.screen === "confirmation" || s.paymentState === "completed") &&
    !confirm("離開後將無法查回此訂單或下載 PDF，確定返回首頁？")
  )
    return;
  reset();
  invalidateSearch();
  flightSettings.clear();
  rerender({ top: true });
}
function changeStep(step) {
  if (
    ["processing", "completed"].includes(s.paymentState) ||
    step > s.maxStep ||
    s.screen !== "booking"
  )
    return;
  if (step > 1) {
    const error = validateFlights(s);
    if (error) {
      flowError(error);
      return;
    }
  }
  if (step > 2) {
    const errors = validateTravelers(s);
    if (Object.keys(errors).length) {
      setErrors(errors);
      s.activeStep = 2;
      rerender({ top: true });
      toast("請先完成有效旅客資料");
      return;
    }
  }
  if (step > 4) {
    const error = validateSeats(s);
    if (error) {
      s.activeStep = 4;
      rerender({ top: true });
      flowError(error);
      return;
    }
  }
  if (step > 5) {
    const error = validateMeals(s);
    if (error) {
      s.activeStep = 5;
      rerender({ top: true });
      flowError(error);
      return;
    }
  }
  if (step > 6 && !s.reviewed) {
    s.activeStep = 6;
    rerender({ top: true });
    flowError("請重新確認訂單與模擬條款");
    return;
  }
  s.activeStep = step;
  rerender({ top: true });
}
function next() {
  let error = "";
  if (s.activeStep === 1) error = validateFlights(s);
  if (s.activeStep === 2) {
    const errs = validateTravelers(s);
    setErrors(errs);
    if (Object.keys(errs).length) {
      rerender();
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    for (const t of s.travelers) {
      t.surname = t.surname.trim().toUpperCase();
      t.givenName = t.givenName.trim().toUpperCase();
    }
  }
  if (s.activeStep === 4) error = validateSeats(s);
  if (s.activeStep === 5) error = validateMeals(s);
  if (s.activeStep === 6) {
    error = validateFlights(s) || validateSeats(s) || validateMeals(s);
    if (Object.keys(validateTravelers(s)).length)
      error = "請返回旅客資料修正欄位";
    if (!s.reviewed) error = "請勾選確認訂單與模擬條款";
  }
  if (error) {
    flowError(error);
    return;
  }
  s.activeStep++;
  s.maxStep = Math.max(s.maxStep, s.activeStep);
  rerender({ top: true });
}
function affected(j) {
  return Object.values(s.services).some((x) => {
    const sv = x[j.id];
    return (
      sv &&
      (Object.keys(sv.seats).length ||
        Object.keys(sv.meals).length ||
        sv.bags.length)
    );
  });
}
function confirmChange(j) {
  return (
    !affected(j) ||
    confirm(
      "修改此航程將清除此航程的座位、餐點及額外行李；其他航程和旅客資料會保留。確定修改？",
    )
  );
}
function invalidateJourney(j) {
  clearJourneyServices(s, j.id);
  s.reviewed = false;
}
function startSearch() {
  const legs =
    draft.type === "multi-city"
      ? draft.legs.map((l) => ({ ...l }))
      : draft.type === "round-trip"
        ? [
            { ...draft.legs[0] },
            {
              origin: draft.legs[0].destination,
              destination: draft.legs[0].origin,
              date: draft.legs[1].date,
            },
          ]
        : [{ ...draft.legs[0] }];
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (l.origin === l.destination) return "出發與抵達機場不能相同";
    if (!bookableDate(l.date, airportByCode[l.origin].timeZone))
      return "日期須在起飛機場今日起 365 天內";
  }
  if (s.screen === "home" && s.journeys.length) {
    const changes = legs.some((l, i) => {
      const old = s.journeys[i];
      return (
        !old ||
        old.origin !== l.origin ||
        old.destination !== l.destination ||
        old.date !== l.date
      );
    });
    if (
      changes &&
      s.journeys.some(affected) &&
      !confirm("變更搜尋會清除受影響航程的服務，確定繼續？")
    )
      return "已取消修改";
  }
  s.quoteNow = Date.now();
  s.tripType = draft.type;
  s.passengerCount = draft.count;
  const oldTravelers = s.travelers;
  s.travelers = Array.from(
    { length: draft.count },
    (_, i) => oldTravelers[i] || { id: "t" + i },
  );
  for (const tid of Object.keys(s.services))
    if (!s.travelers.some((t) => t.id === tid)) delete s.services[tid];
  const oldJourneys = s.journeys;
  const unmatched = new Set(oldJourneys);
  const usedIds = new Set([
    ...oldJourneys.map((j) => j.id),
    ...Object.values(s.services).flatMap((data) => Object.keys(data)),
  ]);
  const newJourneyId = () => {
    let n = 0;
    while (usedIds.has("j" + n)) n++;
    const id = "j" + n;
    usedIds.add(id);
    return id;
  };
  s.journeys = legs.map((l, i) => {
    const same = (old) =>
      unmatched.has(old) &&
      old.origin === l.origin &&
      old.destination === l.destination &&
      old.date === l.date;
    const old =
      oldJourneys[i] && same(oldJourneys[i])
        ? oldJourneys[i]
        : oldJourneys.find(same);
    if (old) unmatched.delete(old);
    return old
      ? { ...old, searchCabin: draft.cabin }
      : {
          ...l,
          id: newJourneyId(),
          searchCabin: draft.cabin,
          family: "Saver",
          cabins: [],
          option: null,
        };
  });
  for (const old of oldJourneys)
    if (!s.journeys.some((j) => j.id === old.id && j.option === old.option))
      invalidateJourney(old);
  for (const j of s.journeys)
    if (
      j.option &&
      j.option.legs.some(
        (f, i) => inventory(f, j.cabins[i]).remaining < draft.count,
      )
    ) {
      invalidateJourney(j);
      j.option = null;
    }
  s.screen = "booking";
  s.activeStep = 1;
  s.maxStep = 1;
  s.reviewed = false;
  invalidateSearch();
  flightSettings.clear();
  setErrors({});
  return "";
}
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "search-form") return;
  e.preventDefault();
  const error = startSearch();
  if (error) {
    document.querySelector("#search-error").textContent = error;
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "searching";
  overlay.innerHTML =
    '<div><div class="plane">✈</div><div class="loading-line"></div><p>正在查詢固定班表與可售票價</p></div>';
  document.body.append(overlay);
  await new Promise((r) => setTimeout(r, 450));
  rerender({ top: true });
  overlay.remove();
});
document.addEventListener("input", (e) => {
  const key = e.target.dataset.field;
  if (!key || ["processing", "completed"].includes(s.paymentState)) return;
  const [id, k] = key.split(".");
  if (id === "contact") s.contact[k] = e.target.value;
  else s.travelers.find((t) => t.id === id)[k] = e.target.value;
  s.reviewed = false;
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (s.paymentState === "processing") return;
  if (el.id === "currency") {
    s.selectedCurrency = el.value;
    rerender();
    return;
  }
  if (s.paymentState === "completed") return;
  if (el.dataset.home) {
    const [i, k] = el.dataset.home.split(".");
    draft.legs[+i][k] = el.value;
    rerender();
    return;
  }
  if (el.id === "passenger-count") {
    draft.count = +el.value;
    return;
  }
  if (el.id === "search-cabin") {
    draft.cabin = el.value;
    return;
  }
  if (el.id === "review-check") {
    s.reviewed = el.checked;
    return;
  }
  if (el.dataset.sort) {
    s.journeys[+el.dataset.sort].sort = el.value;
    rerender();
    return;
  }
  if (el.dataset.flightCabin || el.dataset.flightFamily) {
    const raw = el.dataset.flightCabin || el.dataset.flightFamily,
      first = raw.indexOf("|"),
      idx = +raw.slice(0, first),
      j = s.journeys[idx];
    let okey = raw.slice(first + 1),
      legIndex;
    if (el.dataset.flightCabin) {
      const pos = okey.lastIndexOf("|");
      legIndex = +okey.slice(pos + 1);
      okey = okey.slice(0, pos);
    }
    const o = getResults(j).find((x) => x.key === okey),
      st = optionSetting(j, o);
    const selected = j.option?.key === okey;
    const flight = o.legs[legIndex];
    if (
      selected &&
      el.dataset.flightCabin &&
      s.travelers.some((t) => {
        const sv = service(t.id, j.id);
        return sv.seats[flight.instanceKey] || sv.meals[flight.instanceKey];
      }) &&
      !confirm(
        "修改此航段艙等將清除該航段的座位與餐點；其他航段及已加購行李會保留。確定修改？",
      )
    ) {
      rerender();
      return;
    }
    if (el.dataset.flightCabin) st.cabins[legIndex] = el.value;
    else st.family = el.value;
    if (selected) {
      if (el.dataset.flightCabin)
        for (const t of s.travelers) {
          const sv = service(t.id, j.id);
          delete sv.seats[flight.instanceKey];
          delete sv.meals[flight.instanceKey];
          delete sv.specialMeals[flight.instanceKey];
        }
      s.reviewed = false;
      j.cabins = [...st.cabins];
      j.family = st.family;
    }
    rerender();
    return;
  }
  if (el.id === "seat-flight") {
    const [ji, li] = el.value.split("|").map(Number);
    seatContext.journey = ji;
    seatContext.leg = li;
    rerender();
    return;
  }
  if (el.id === "seat-traveler") {
    seatContext.traveler = +el.value;
    rerender();
    return;
  }
  if (el.dataset.meal) {
    const [ji, li, ti, n] = el.dataset.meal.split("|").map(Number),
      j = s.journeys[ji],
      f = j.option.legs[li];
    service(s.travelers[ti].id, j.id).meals[f.instanceKey][n] = el.value;
    s.reviewed = false;
    return;
  }
  if (el.dataset.specialMeal) {
    const [ji, li, ti] = el.dataset.specialMeal.split("|").map(Number),
      j = s.journeys[ji],
      f = j.option.legs[li];
    service(s.travelers[ti].id, j.id).specialMeals[f.instanceKey] = el.value;
    s.reviewed = false;
    rerender();
  }
});
document.addEventListener("click", async (e) => {
  const el = e.target.closest("button,a");
  if (!el || s.paymentState === "processing") return;
  if (el.dataset.nav || el.id === "brand") {
    e.preventDefault();
    const focus = el.dataset.nav === "search";
    goHome();
    if (focus && s.screen === "home")
      document.querySelector("#search").scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (el.id === "finish-payment") {
    if (s.paymentState === "completed" && s.confirmation) {
      s.screen = "confirmation";
      rerender({ top: true });
    }
    return;
  }
  if (s.paymentState === "completed" && s.screen === "booking") {
    if (el.hasAttribute("data-mobile-next"))
      document.querySelector("#finish-payment")?.click();
    return;
  }
  if (el.dataset.trip) {
    draft.type = el.dataset.trip;
    if (draft.type !== "multi-city") draft.legs = draft.legs.slice(0, 2);
    if (draft.legs.length < 2)
      draft.legs.push({
        origin: draft.legs[0].destination,
        destination: draft.legs[0].origin,
        date: addDays(draft.legs[0].date, 7),
      });
    rerender();
    return;
  }
  if (el.id === "swap") {
    [draft.legs[0].origin, draft.legs[0].destination] = [
      draft.legs[0].destination,
      draft.legs[0].origin,
    ];
    rerender();
    return;
  }
  if (el.id === "add-leg") {
    if (draft.legs.length < 4) {
      const last = draft.legs.at(-1);
      draft.legs.push({
        origin: last.destination,
        destination: last.destination === "TPE" ? "NRT" : "TPE",
        date: addDays(last.date, 3),
      });
      rerender();
    }
    return;
  }
  if (el.dataset.removeLeg !== undefined) {
    if (draft.legs.length > 2) {
      draft.legs.splice(+el.dataset.removeLeg, 1);
      rerender();
    }
    return;
  }
  if (el.hasAttribute("data-mobile-next")) {
    if (s.activeStep < 7) next();
    else document.querySelector("#pay")?.click();
    return;
  }
  if (el.dataset.step) {
    changeStep(+el.dataset.step);
    return;
  }
  if (el.id === "next") {
    next();
    return;
  }
  if (el.id === "back") {
    if (s.activeStep > 1) changeStep(s.activeStep - 1);
    else {
      s.screen = "home";
      rerender({ top: true });
    }
    return;
  }
  if (el.dataset.selectFlight) {
    const raw = el.dataset.selectFlight,
      pos = raw.indexOf("|"),
      ji = +raw.slice(0, pos),
      key = raw.slice(pos + 1),
      j = s.journeys[ji],
      o = getResults(j).find((o) => o.key === key);
    if (j.option?.key === key) return;
    if (!confirmChange(j)) return;
    const setting = optionSetting(j, o);
    invalidateJourney(j);
    j.option = o;
    j.cabins = [...setting.cabins];
    j.family = setting.family;
    rerender();
    toast("已選擇 " + o.legs.map((f) => f.flightNo).join(" / "));
    return;
  }
  if (el.dataset.selectFamily) {
    const raw = el.dataset.selectFamily,
      first = raw.indexOf("|"),
      last = raw.lastIndexOf("|"),
      ji = +raw.slice(0, first),
      key = raw.slice(first + 1, last),
      family = raw.slice(last + 1),
      j = s.journeys[ji],
      option = getResults(j).find((o) => o.key === key);
    if (!option || !["Saver", "Basic", "Flex"].includes(family)) return;
    const setting = optionSetting(j, option);
    setting.family = family;
    if (j.option?.key === key) {
      j.family = family;
      s.reviewed = false;
    }
    rerender();
    return;
  }
  if (el.dataset.date) {
    const [ji, date] = el.dataset.date.split("|"),
      j = s.journeys[+ji];
    if (date === j.date) return;
    if (!confirmChange(j)) return;
    invalidateJourney(j);
    j.date = date;
    j.option = null;
    draft.legs[+ji].date = date;
    rerender();
    return;
  }
  if (el.id === "demo-data") {
    const names = [
      ["CHEN", "WEI LIN", "MR"],
      ["LIN", "YU TING", "MS"],
      ["WANG", "JUN HAO", "MR"],
      ["HUANG", "JIA XIN", "MS"],
      ["LIU", "YI CHEN", "MX"],
      ["LEE", "RUI EN", "MS"],
      ["HSU", "BO YU", "MR"],
      ["CHANG", "SI YU", "MS"],
      ["WU", "CHENG HAN", "MR"],
    ];
    s.travelers.forEach((t, i) =>
      Object.assign(t, {
        title: names[i][2],
        surname: names[i][0],
        givenName: names[i][1],
        birthDate: `${1990 + i}-0${(i % 8) + 1}-15`,
        nationality: "TW",
        documentSex: "X",
        passportNumber: "TEST000" + i,
        passportIssueCountry: "TW",
        passportExpiry: addDays(localDate(), 1500),
      }),
    );
    s.contact = {
      name: "陳瑋霖（測試）",
      email: "wei.lin.chen@example.com",
      phone: "+886 000000000",
    };
    setErrors({});
    s.reviewed = false;
    rerender();
    toast("已填入虛構測試資料");
    return;
  }
  if (el.dataset.bagChange) {
    const [ji, ti, kg, delta] = el.dataset.bagChange.split("|").map(Number),
      bags = service(s.travelers[ti].id, s.journeys[ji].id).bags;
    if (![23, 32].includes(kg)) return;
    if (delta === 1 && bags.length < 3) bags.push(kg);
    if (delta === -1 && bags.includes(kg)) bags.splice(bags.lastIndexOf(kg), 1);
    s.reviewed = false;
    rerender();
    return;
  }
  if (el.dataset.seat) {
    const error = selectSeat(el.dataset.seat);
    if (error) toast(error);
    rerender();
    return;
  }
  if (el.dataset.seatDirection) {
    if (moveSeatFlight(+el.dataset.seatDirection)) rerender();
    return;
  }
  if (el.id === "auto-seats") {
    try {
      const result = autoSeats(s);
      if (
        result.cost &&
        !confirm("自動分配將增加選位費 " + fmt(result.cost) + "，是否確認？")
      )
        return;
      for (const x of result.assignments)
        service(x.tid, x.jid).seats[x.key] = x.id;
      s.reviewed = false;
      rerender();
      toast("已分配所有尚未選擇的座位");
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (el.dataset.card) {
    s.card = el.dataset.card;
    rerender();
    return;
  }
  if (el.id === "pay") {
    const error = validateFlights(s) || validateSeats(s) || validateMeals(s);
    if (error || !s.reviewed || Object.keys(validateTravelers(s)).length) {
      flowError(error || "請返回訂單確認重新檢查資料與條款");
      return;
    }
    s.paymentError = "";
    const pending = pay(
      s,
      new URLSearchParams(location.search).get("qaPayment"),
    );
    document.body.classList.add("busy");
    rerender();
    document
      .querySelectorAll("button,input,select")
      .forEach((x) => (x.disabled = true));
    try {
      const result = await pending;
      document.body.classList.remove("busy");
      if (result.success) {
        s.confirmation = result.confirmation;
        s.priceBreakdown = calculateOrder(s);
      } else s.paymentError = result.error;
      rerender({ top: true });
    } catch (err) {
      document.body.classList.remove("busy");
      s.paymentState = "failed";
      s.paymentError = err.message;
      rerender();
    }
    return;
  }
  if (el.id === "download-pdf") {
    const confirmation = s.confirmation;
    el.disabled = true;
    el.textContent = "正在產生 PDF…";
    try {
      await downloadPDF(s);
      confirmation.downloadedPdfCount++;
      toast("電子行程單已下載");
    } catch (err) {
      toast("PDF 產生失敗，請重試：" + err.message);
    } finally {
      el.disabled = false;
      el.textContent = "下載 A4 電子行程單 PDF";
    }
    return;
  }
  if (el.id === "new-booking") goHome();
});
window.addEventListener("beforeunload", (e) => {
  if (s.screen === "booking") {
    e.preventDefault();
    e.returnValue = "";
  }
});
validateData();
render();
