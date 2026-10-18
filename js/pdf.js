import {
  calculateOrder,
  money,
  allowance,
  miles,
  conversionAdjustment,
  foreignMoney,
} from "./pricing.js";
import { airportByCode } from "./data.js";
import { localDateTime, localDate, dayDiff } from "./timezone.js";
import { families, cabinNames } from "../assets/data/fares.js";
import { mealName } from "./meals.js";
let loading, assetsLoading;
async function pdfLibrary() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(
      "../assets/vendor/jspdf.umd.min.js",
      import.meta.url,
    ).href;
    script.onload = () => {
      if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF);
      else {
        script.remove();
        reject(new Error("本機 PDF 工具載入不完整，請重試"));
      }
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("無法載入本機 PDF 工具，請重試"));
    };
    document.head.append(script);
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
function documentOrder(s) {
  const snapshot = s.confirmation?.frozenBookingSnapshot;
  return snapshot
    ? {
        ...snapshot,
        confirmation: s.confirmation,
        selectedCurrency: s.selectedCurrency,
      }
    : s;
}
function pdfAssets() {
  assetsLoading ??= (async () => {
    const font = new FontFace(
      "AirStarsDocument",
      `url(${new URL("../assets/vendor/AirStarsCJK.woff2", import.meta.url).href})`,
    );
    document.fonts.add(await font.load());
    const logo = new Image();
    logo.src = new URL("../assets/icons/logo.svg", import.meta.url).href;
    await logo.decode();
    return logo;
  })().catch((error) => {
    assetsLoading = undefined;
    throw error;
  });
  return assetsLoading;
}
export function itineraryLines(s) {
  s = documentOrder(s);
  const b = s.priceBreakdown || calculateOrder(s),
    c = s.selectedCurrency,
    f = (x) => money(x, c),
    lines = [];
  const line = (text, kind = "body") => lines.push({ text, kind });
  line("虛構訂位完成 · " + s.confirmation.pnr, "title");
  line(
    "出票日期時間：" +
      localDateTime(Date.parse(s.confirmation.completedAtUTC), "Asia/Taipei") +
      "（Asia/Taipei）",
  );
  line("此文件為虛構示範，不代表真實訂位、航空運輸或支付。");
  line("旅客與電子票號", "heading");
  for (const t of s.travelers)
    line(
      `${t.title} ${t.surname} / ${t.givenName}　${s.confirmation.ticketsByTravelerId[t.id]}`,
    );
  s.journeys.forEach((j, ji) => {
    const fam = families[j.family],
      a = allowance(j);
    line(
      `航程 ${ji + 1}　${j.origin} → ${j.destination}　${fam.name} ${j.family}`,
      "heading",
    );
    j.option.legs.forEach((flight, li) => {
      const origin = airportByCode[flight.origin],
        dest = airportByCode[flight.destination],
        diff = dayDiff(
          localDate(flight.arrivalUTC, dest.timeZone),
          flight.departureLocalISODate,
        );
      line(
        `${flight.flightNo} · ${flight.aircraftType} · ${cabinNames[j.cabins[li]]}`,
        "subheading",
      );
      line(
        `出發：${origin.nameZh} ${flight.origin}　${localDateTime(flight.departureUTC, origin.timeZone)}（${origin.timeZone}）`,
      );
      line(
        `抵達：${dest.nameZh} ${flight.destination}　${localDateTime(flight.arrivalUTC, dest.timeZone)}（${dest.timeZone}）${diff ? " " + (diff > 0 ? "+" : "") + diff + " 日" : ""}`,
      );
      for (const t of s.travelers) {
        const sv = s.services[t.id][j.id];
        line(
          `${t.surname} / ${t.givenName}　座位 ${sv.seats[flight.instanceKey]}`,
        );
        line(
          "餐飲：" +
            (sv.meals[flight.instanceKey] || [])
              .map((m, i) => `第 ${i + 1} 餐 ${mealName(m)}`)
              .join("；"),
        );
      }
      if (li === 0 && j.option.layoverMinutes)
        line(
          `於 ${j.option.connectionAirport} 同機場轉機，等候 ${j.option.layoverMinutes} 分鐘`,
        );
    });
    for (const t of s.travelers) {
      const bags = s.services[t.id][j.id].bags;
      line(
        `${t.surname} / ${t.givenName}：免費託運 ${a.pieces} 件 × ${a.kg} kg；手提 ${a.hand} 件 × 7 kg；額外加購 ${bags.length ? bags.map((k) => k + " kg").join("、") : "無"}。`,
      );
    }
    line(`模擬累積里程：每人 ${miles(j)} 英里。`);
    line(
      `改票手續費 ${f(fam.change)}／每人每方向，仍可能有票價差；${fam.refund === null ? "不可退票" : "退票手續費 " + f(fam.refund) + "／每人每方向"}。僅展示條款，不提供售後交易。`,
    );
    for (const cabin of new Set(j.cabins)) {
      const i = Object.keys(families).indexOf(j.family);
      line(
        cabinNames[cabin] +
          " 選位權益：" +
          ("FC".includes(cabin)
            ? "全部免費"
            : cabin === "Y"
              ? ["選位付費", "一般座位免費", "一般及優選免費"][i]
              : ["一般免費", "一般及優選免費", "一般、優選、加大腿部空間免費"][
                  i
                ]) +
          "。",
      );
    }
  });
  line("費用明細", "heading");
  b.segmentFaresTWD.forEach((p, i) => {
    const j = s.journeys.find((j) => j.id === p.journeyId);
    line(
      `航程 ${s.journeys.indexOf(j) + 1} · ${j.date || j.requestedDate} · ${p.flight} ${cabinNames[p.cabin]} 機票 ${money(p.unit)} × ${p.count} = ${money(p.amount)}`,
    );
    const tax = b.segmentTaxesTWD[i];
    line(
      `${p.flight} 模擬稅費 ${money(tax.unit)} × ${tax.count} = ${money(tax.amount)}`,
    );
  });
  for (const p of b.seatFeesTWD)
    line(
      `${s.travelers.find((t) => t.id === p.travelerId).surname} / ${s.travelers.find((t) => t.id === p.travelerId).givenName} ${p.flight} 座位 ${p.seat}：${money(p.amount)}`,
    );
  for (const p of b.extraBagFeesTWD)
    line(
      `${s.travelers.find((t) => t.id === p.travelerId).surname} / ${s.travelers.find((t) => t.id === p.travelerId).givenName} 航程 ${s.journeys.findIndex((j) => j.id === p.journeyId) + 1} 額外行李 ${p.kg} kg：${money(p.amount)}`,
    );
  line(
    `機票 ${f(b.fare)} · 模擬稅費 ${f(b.tax)} · 選位 ${f(b.seats)} · 行李 ${f(b.bags)}`,
  );
  const adj = conversionAdjustment(b, c);
  if (adj) line(`匯率換算尾差：${foreignMoney(adj, c)}`);
  line(`最終總額：${f(b.totalTWD)}`, "heading");
  line(`TWD 基準總額：${money(b.totalTWD)}`);
  line("固定模擬匯率，無真實扣款。餐飲已包含。");
  line("聯絡資訊", "heading");
  line(`${s.contact.name} · ${s.contact.email} · ${s.contact.phone}`);
  line(
    "離開成功頁或重新整理後，網站不保留訂單，無法查回。請自行保管此模擬文件。",
  );
  return lines;
}
export async function downloadPDF(s) {
  s = documentOrder(s);
  const [jsPDF, logo] = await Promise.all([pdfLibrary(), pdfAssets()]);
  const W = 1240,
    H = 1754,
    margin = 88,
    bottom = 1600;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("瀏覽器無法繪製行程單，請重試");
  let y = 230;
  const pages = [[]];
  function newPage() {
    pages.push([]);
    y = 230;
  }
  function header() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#132847";
    ctx.fillRect(0, 0, W, 12);
    ctx.drawImage(logo, margin, 35, 86, 86);
    ctx.font = "30px AirStarsDocument";
    ctx.fillText("星域航空 AIR STARS", margin + 104, 88);
    ctx.font = "17px AirStarsDocument";
    ctx.fillStyle = "#667789";
    ctx.fillText(
      "電子行程單 · 虛構訂位 " + s.confirmation.pnr,
      margin + 104,
      118,
    );
    ctx.fillStyle = "#a62f33";
    ctx.font = "21px AirStarsDocument";
    ctx.fillText("模擬文件，無旅行效力／不可用於搭機或支付", margin, 165);
    ctx.strokeStyle = "#d6c29e";
    ctx.beginPath();
    ctx.moveTo(margin, 190);
    ctx.lineTo(W - margin, 190);
    ctx.stroke();
  }
  function wrap(text, size) {
    ctx.font = `${size}px AirStarsDocument`;
    const arr = [];
    let current = "";
    for (const char of text) {
      if (ctx.measureText(current + char).width > W - margin * 2) {
        arr.push(current);
        current = char;
      } else current += char;
    }
    if (current) arr.push(current);
    return arr;
  }
  for (const item of itineraryLines(s)) {
    const size =
      item.kind === "title"
        ? 32
        : item.kind === "heading"
          ? 27
          : item.kind === "subheading"
            ? 23
            : 21;
    const rows = wrap(item.text, size);
    const lineHeight = Math.ceil(size * 1.65);
    if (item.kind === "heading" || item.kind === "title") {
      // Keep a section heading with at least the first following body line.
      if (y + 18 + rows.length * lineHeight + 42 > bottom) newPage();
      y += 18;
    }
    for (const row of rows) {
      if (y + lineHeight > bottom) newPage();
      pages.at(-1).push({ text: row, y, size, kind: item.kind });
      y += lineHeight;
    }
    y += 6;
  }
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  // Retain text layouts only; reuse one canvas for even the longest 9-person order.
  pages.forEach((rows, i) => {
    header();
    for (const row of rows) {
      ctx.font = `${row.size}px AirStarsDocument`;
      ctx.fillStyle = row.kind === "heading" ? "#94713a" : "#132847";
      ctx.fillText(row.text, margin, row.y);
    }
    ctx.font = "17px AirStarsDocument";
    ctx.fillStyle = "#a62f33";
    ctx.fillText("虛構資料與模擬文件 · 無旅行與支付效力", margin, H - 80);
    ctx.fillStyle = "#697789";
    ctx.fillText(
      `Air Stars · ${s.confirmation.pnr} · 第 ${i + 1} / ${pages.length} 頁`,
      margin,
      H - 48,
    );
    if (i) pdf.addPage("a4", "portrait");
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.88),
      "JPEG",
      0,
      0,
      210,
      297,
      undefined,
      "FAST",
    );
  });
  pdf.setProperties({
    title: "Air Stars Itinerary " + s.confirmation.pnr,
    subject: "虛構模擬行程單，無旅行效力",
    author: "Air Stars",
  });
  pdf.save("AirStars_Itinerary_" + s.confirmation.pnr + ".pdf");
  canvas.width = canvas.height = 0;
}
