import { state as s } from "./state.js";
import { aircraft } from "./data.js";
import { inventory } from "./inventory.js";
import { money, seatPrice } from "./pricing.js";
import { nextUnseatedTraveler, toggleSeat } from "./seatmap.js";
import { cabinNames, categoryNames, families } from "../assets/data/fares.js";

export const seatContext = { journey: 0, leg: 0, traveler: 0 };
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const fmt = (amount) => money(amount, s.selectedCurrency);
const travelerName = (traveler, index) => {
  const name = [traveler.surname, traveler.givenName]
    .filter(Boolean)
    .join(" / ");
  return `成人 ${index + 1}${name ? " · " + name : ""}`;
};
const chosenSeat = (traveler, journey, flight) =>
  s.services[traveler.id]?.[journey.id]?.seats?.[flight.instanceKey];
const flightEntries = () =>
  s.journeys.flatMap((journey, journeyIndex) =>
    (journey.option?.legs || []).map((flight, legIndex) => ({
      journey,
      flight,
      journeyIndex,
      legIndex,
    })),
  );

function currentFlight() {
  const entries = flightEntries();
  const sameJourney = entries.filter(
    (entry) => entry.journeyIndex === seatContext.journey,
  );
  const entry =
    entries.find(
      (item) =>
        item.journeyIndex === seatContext.journey &&
        item.legIndex === seatContext.leg,
    ) ||
    sameJourney.at(-1) ||
    entries[0];
  if (!entry) {
    Object.assign(seatContext, { journey: 0, leg: 0, traveler: 0 });
    return null;
  }
  const next = nextUnseatedTraveler(s, entry.journey, entry.flight);
  Object.assign(seatContext, {
    journey: entry.journeyIndex,
    leg: entry.legIndex,
    traveler: next === -1 ? s.travelers.length : next,
  });
  return { ...entry, entries, index: entries.indexOf(entry) };
}

export function selectSeat(id) {
  const current = currentFlight();
  if (!current) return "請先選擇航班";
  const error = toggleSeat(s, current.journey, current.legIndex, id);
  currentFlight();
  return error;
}

export function moveSeatFlight(delta) {
  const current = currentFlight();
  const direction = Math.sign(Number(delta));
  if (!current || !Number.isFinite(direction) || !direction) return false;
  const next = current.entries[current.index + direction];
  if (!next) return false;
  seatContext.journey = next.journeyIndex;
  seatContext.leg = next.legIndex;
  currentFlight();
  return true;
}

export function seatsView() {
  const current = currentFlight();
  if (!current)
    return '<section class="panel seat-update"><p class="notice">請先為每個航程選擇航班。</p></section>';
  const { journey, flight, legIndex, entries, index } = current;
  const cabin = journey.cabins[legIndex];
  const plane = aircraft[flight.aircraftType];
  const layout = plane?.cabins[cabin];
  if (!layout)
    return '<section class="panel seat-update"><p class="notice">請先選擇此航段提供的艙等。</p></section>';
  const available = inventory(flight, cabin);
  const [firstRow, lastRow, blocks] = layout;
  const seatsById = new Map(available.seats.map((seat) => [seat.id, seat]));
  const owners = new Map(
    s.travelers.flatMap((traveler, travelerIndex) => {
      const seat = chosenSeat(traveler, journey, flight);
      return seat ? [[seat, { traveler, travelerIndex }]] : [];
    }),
  );
  const target = s.travelers[seatContext.traveler];
  const status = target
    ? `正在為 ${travelerName(target, seatContext.traveler)} 選位`
    : "本航段所有旅客已完成選位";
  const rows = Array.from({ length: lastRow - firstRow + 1 }, (_, offset) => {
    const row = firstRow + offset;
    return `<div class="seat-row"><span class="row-number">${row}</span>${blocks
      .split("|")
      .map(
        (letters, blockIndex) =>
          `${blockIndex ? '<span class="aisle" aria-hidden="true"></span>' : ""}<div class="seat-block">${[
            ...letters,
          ]
            .map((letter) => {
              const seat = seatsById.get(row + letter);
              if (!seat)
                return '<span class="seat-gap" aria-hidden="true"></span>';
              const owner = owners.get(seat.id);
              const occupied = available.occupied.has(seat.id) && !owner;
              const price = fmt(seatPrice(cabin, journey.family, seat));
              const label = `${seat.id} ${cabinNames[cabin]} ${categoryNames[seat.category]} · ${
                owner
                  ? travelerName(owner.traveler, owner.travelerIndex) +
                    "已選，再按一次取消"
                  : occupied
                    ? "已被占用，不可選"
                    : price
              }`;
              return `<button type="button" class="seat ${seat.category}${owner ? " selected" : ""}" data-seat="${seat.id}" ${occupied ? "disabled" : ""} aria-label="${esc(label)}" aria-pressed="${Boolean(owner)}"><span>${seat.id}</span>${owner ? `<small>成人 ${owner.travelerIndex + 1}</small>` : ""}</button>`;
            })
            .join("")}</div>`,
      )
      .join("")}</div>`;
  }).join("");

  return `<section class="panel seat-update"><div class="between row wrap"><h2>選擇您的座位</h2><button type="button" id="auto-seats" class="outline">自動分配可用座位</button></div><p class="small">選位為選填。點選座位依旅客順序自動指派；再次點選本訂單已選座位即可取消。未選座位將於報到時由系統隨機安排。</p><label class="form-label seat-flight-picker">實際飛行航段<select id="seat-flight">${entries
    .map(
      (entry, entryIndex) =>
        `<option value="${entry.journeyIndex}|${entry.legIndex}" ${entryIndex === index ? "selected" : ""}>第 ${entryIndex + 1} 段 · ${entry.flight.flightNo} ${entry.flight.origin} → ${entry.flight.destination} · ${entry.flight.aircraftType}</option>`,
    )
    .join(
      "",
    )}</select></label><div class="notice seat-flight-info"><strong>${flight.flightNo} · ${flight.origin} → ${flight.destination}</strong><span>${flight.aircraftType} · ${cabinNames[cabin]} · ${families[journey.family].name}</span></div><p class="seat-current-traveler" role="status" aria-live="polite">${esc(status)}</p><ul class="seat-traveler-list" aria-label="本航段旅客選位狀態">${s.travelers
    .map((traveler, travelerIndex) => {
      const chosen = chosenSeat(traveler, journey, flight);
      const seat = seatsById.get(chosen);
      return `<li class="${chosen ? "is-assigned" : travelerIndex === seatContext.traveler ? "is-next" : ""}"><span>${esc(travelerName(traveler, travelerIndex))}</span><strong>${
        chosen
          ? `${esc(chosen)} · ${fmt(seatPrice(cabin, journey.family, seat))}`
          : "於報到時由系統隨機安排"
      }</strong></li>`;
    })
    .join(
      "",
    )}</ul><div class="seat-legend"><span>可選</span><span style="--box:#d8dce0">已被占用</span><span style="--box:#132847">本訂單已選（再按取消）</span><span style="--box:#d4e5dc">加大腿部空間</span><span style="--box:#e7e1d3">優選</span></div><p class="small seat-scroll-hint">座位圖可左右滑動，僅顯示本航段已購艙等。</p><div class="seat-shell" role="region" aria-label="${esc(flight.flightNo + " " + cabinNames[cabin] + " 座位圖，可左右捲動")}" tabindex="0"><div class="seat-map"><div class="seat-cabin-title">${cabinNames[cabin]} · ${plane.capacityByCabin[cabin]} 席</div>${rows}</div></div><nav class="seat-flight-navigation" aria-label="切換選位航段"><button type="button" data-seat-direction="-1" ${index === 0 ? "disabled" : ""}>← 上一段</button><span>第 ${index + 1} / ${entries.length} 段</span><button type="button" data-seat-direction="1" ${index === entries.length - 1 ? "disabled" : ""}>下一段 →</button></nav></section>`;
}
