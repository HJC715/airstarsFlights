import { inventory } from "./inventory.js";
import { dateValid, localDate } from "./timezone.js";
import { airportByCode, aircraft } from "./data.js";
import { validMealSelections } from "./meals.js";
export function validateTravelers(s) {
  const errors = {};
  const first = s.journeys[0]?.option?.legs?.[0];
  const last = s.journeys.at(-1)?.option?.legs?.at(-1);
  if (!first || !last || s.journeys.some((j) => !j.option?.legs?.length))
    return { order: "請先為每個航程選擇航班" };
  if (
    !Array.isArray(s.travelers) ||
    s.travelers.length !== s.passengerCount ||
    !s.travelers.length ||
    s.travelers.some((t) => !t.id) ||
    new Set(s.travelers.map((t) => t.id)).size !== s.travelers.length
  )
    errors.order = "旅客資料須與成人數一致，請重新確認旅客";
  const firstDate = first.departureLocalISODate,
    end = localDate(last.arrivalUTC, airportByCode[last.destination].timeZone);
  for (const t of s.travelers || []) {
    const put = (k, msg) => (errors[t.id + "." + k] = msg);
    for (const k of ["surname", "givenName"])
      if (!/^[A-Z][A-Z '\-]{0,38}[A-Z]$/i.test(t[k]?.trim() || ""))
        put(k, "請輸入 2–40 個英文字母，可含空格、連字號及撇號");
    const adultDate = firstDate.slice(0, 4) - 18 + firstDate.slice(4);
    if (!dateValid(t.birthDate || "") || t.birthDate > adultDate)
      put("birthDate", "旅客須於首次起飛日年滿 18 歲");
    if (!t.title) put("title", "請選擇稱謂");
    if (!t.nationality) put("nationality", "請選擇國籍／地區");
    if (t.passportNumber) {
      if (!/^[A-Z0-9]{6,12}$/i.test(t.passportNumber))
        put("passportNumber", "請使用 6–12 位英數字模擬證件");
      if (!t.passportIssueCountry)
        put("passportIssueCountry", "請選擇發照國家");
      if (!dateValid(t.passportExpiry || "") || t.passportExpiry <= end)
        put("passportExpiry", "效期須晚於最後一段抵達日");
    }
  }
  const c = s.contact || {};
  if (!c.name || c.name.trim().length < 2 || c.name.length > 80)
    errors["contact.name"] = "請輸入 2–80 字元聯絡姓名";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || ""))
    errors["contact.email"] = "請輸入有效測試電子郵件";
  if (
    !/^\+[\d -]+$/.test(c.phone || "") ||
    (c.phone.match(/\d/g) || []).length < 7 ||
    (c.phone.match(/\d/g) || []).length > 20
  )
    errors["contact.phone"] = "請輸入含 + 國碼的 7–20 位數電話";
  return errors;
}
export function validateFlights(s, now = Date.now()) {
  if (
    !Number.isInteger(s.passengerCount) ||
    s.passengerCount < 1 ||
    s.passengerCount > 9
  )
    return "成人數須為 1–9 位";
  if (!s.journeys.length) return "請先搜尋並選擇航班";
  let previous = -Infinity;
  for (const j of s.journeys) {
    if (!j.option?.legs?.length) return "請為每個航程選擇航班";
    const legs = j.option.legs;
    if (
      legs.length > 2 ||
      legs[0].origin !== j.origin ||
      legs.at(-1).destination !== j.destination ||
      legs[0].departureLocalISODate !== j.date
    )
      return "航班與搜尋航程不一致，請重新選擇";
    if (j.option.legs[0].departureUTC <= previous)
      return "後續航程起飛須晚於前一航程抵達";
    for (let i = 0; i < j.option.legs.length; i++) {
      const f = j.option.legs[i];
      if (
        !Number.isFinite(f.departureUTC) ||
        !Number.isFinite(f.arrivalUTC) ||
        f.arrivalUTC <= f.departureUTC
      )
        return "航班時間無效，請重新搜尋";
      if (f.departureUTC < now + 7200000)
        return "航班須至少提前兩小時預訂，請重新搜尋";
      if (!aircraft[f.aircraftType]?.cabins[j.cabins?.[i]])
        return "請選擇此航班提供的有效艙等";
      if (i) {
        const prior = legs[i - 1],
          wait = (f.departureUTC - prior.arrivalUTC) / 60000;
        if (
          prior.destination !== f.origin ||
          !["TPE", "KHH"].includes(f.origin) ||
          wait < 90 ||
          wait > 1080
        )
          return "轉機須於同一樞紐機場等待 90 分鐘至 18 小時";
      }
      if (inventory(f, j.cabins[i]).remaining < s.passengerCount)
        return "艙等可售數不足";
    }
    previous = j.option.legs.at(-1).arrivalUTC;
  }
  return "";
}
export function validateSeats(s) {
  if (!s.journeys.length || s.journeys.some((j) => !j.option?.legs?.length))
    return "請先為每個航程選擇航班";
  for (const j of s.journeys)
    for (let i = 0; i < j.option.legs.length; i++) {
      const f = j.option.legs[i],
        inv = inventory(f, j.cabins[i]),
        used = new Set();
      for (const t of s.travelers) {
        const id = s.services[t.id]?.[j.id]?.seats?.[f.instanceKey];
        if (!id) continue;
        if (
          !inv.seats.some((x) => x.id === id) ||
          inv.occupied.has(id) ||
          used.has(id)
        )
          return "已選座位須有效且不重複；也可取消選位，於報到時安排";
        used.add(id);
      }
    }
  return "";
}
export function validateMeals(s) {
  if (!s.journeys.length || s.journeys.some((j) => !j.option?.legs?.length))
    return "請先為每個航程選擇航班";
  for (const j of s.journeys)
    for (let i = 0; i < j.option.legs.length; i++) {
      const f = j.option.legs[i];
      for (const t of s.travelers)
        if (!validMealSelections(f, j.cabins[i], s.services[t.id]?.[j.id]))
          return "請確認每位旅客的餐點與特殊餐需求";
    }
  return "";
}
export function clearJourneyServices(
  s,
  jid,
  { seats = true, meals = true, bags = true } = {},
) {
  for (const data of Object.values(s.services)) {
    if (!data[jid]) continue;
    if (seats) data[jid].seats = {};
    if (meals) {
      data[jid].meals = {};
      data[jid].specialMeals = {};
    }
    if (bags) data[jid].bags = [];
  }
  s.maxStep = 1;
  s.reviewed = false;
  s.paymentState = "reviewed";
  s.paymentError = "";
  s.confirmation = null;
}
