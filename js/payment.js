import { calculateOrder } from "./pricing.js";
import { freezeBookingSnapshot } from "./state.js";

const randomID = (n) =>
  Array.from(
    { length: n },
    () =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)],
  ).join("");
export const cards = [
  ["DEMO-GOLD", "VISA 金卡", "12/30"],
  ["DEMO-SILVER", "Mastercard 銀卡", "08/31"],
  ["DEMO-VIRTUAL", "JCB 虛擬卡", "06/32"],
];
export async function pay(s, qa) {
  if (s.paymentState === "processing" || s.paymentState === "completed")
    throw new Error("付款已在處理或完成");
  const frozenBookingSnapshot = freezeBookingSnapshot(s, calculateOrder(s));
  s.paymentState = "processing";
  await new Promise((r) =>
    setTimeout(r, 3000 + Math.floor(Math.random() * 2001)),
  );
  if (qa === "fail" || (qa !== "success" && Math.random() >= 0.98)) {
    s.paymentState = "failed";
    return {
      success: false,
      error: ["模擬授權失敗", "模擬連線逾時", "模擬驗證未通過"][
        Math.floor(Math.random() * 3)
      ],
    };
  }
  s.paymentState = "completed";
  return {
    success: true,
    confirmation: {
      pnr: randomID(6),
      ticketsByTravelerId: Object.fromEntries(
        frozenBookingSnapshot.travelers.map((t) => [
          t.id,
          "ST-ETK-" + randomID(8),
        ]),
      ),
      completedAtUTC: new Date().toISOString(),
      frozenBookingSnapshot,
      downloadedPdfCount: 0,
    },
  };
}
