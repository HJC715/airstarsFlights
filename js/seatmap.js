import { inventory } from "./inventory.js";
import { seatPrice } from "./pricing.js";

export function nextUnseatedTraveler(s, journey, flight) {
  return s.travelers.findIndex(
    (traveler) =>
      !s.services[traveler.id]?.[journey.id]?.seats?.[flight.instanceKey],
  );
}

export function toggleSeat(s, journey, legIndex, id) {
  if (s.paymentState === "processing")
    return "模擬付款處理中，暫時無法修改座位";
  if (typeof id !== "string" || !id) return "請選擇有效座位";
  const flight = journey?.option?.legs?.[legIndex];
  const cabin = journey?.cabins?.[legIndex];
  if (!flight || !cabin) return "請先為此航段選擇航班與艙等";

  const owners = s.travelers.filter(
    (traveler) =>
      s.services[traveler.id]?.[journey.id]?.seats?.[flight.instanceKey] === id,
  );
  if (owners.length) {
    for (const traveler of owners)
      delete s.services[traveler.id][journey.id].seats[flight.instanceKey];
    s.reviewed = false;
    return "";
  }

  const available = inventory(flight, cabin);
  if (!available.seats.some((seat) => seat.id === id))
    return "此座位不屬於本航段已購艙等";
  if (available.occupied.has(id)) return "此座位已被占用，請選擇其他座位";
  const travelerIndex = nextUnseatedTraveler(s, journey, flight);
  if (travelerIndex === -1)
    return "此航段已完成選位；如需更換，請先點選已選座位取消";

  const traveler = s.travelers[travelerIndex];
  s.services[traveler.id] ??= {};
  s.services[traveler.id][journey.id] ??= { seats: {}, meals: {}, bags: [] };
  s.services[traveler.id][journey.id].seats[flight.instanceKey] = id;
  s.reviewed = false;
  return "";
}

export function autoSeats(s) {
  const assignments = [];
  let cost = 0;
  for (const j of s.journeys)
    for (let i = 0; i < j.option.legs.length; i++) {
      const f = j.option.legs[i],
        inv = inventory(f, j.cabins[i]);
      const used = new Set(
        s.travelers
          .map((t) => s.services[t.id]?.[j.id]?.seats[f.instanceKey])
          .filter(Boolean),
      );
      const free = inv.seats
        .filter((x) => !inv.occupied.has(x.id) && !used.has(x.id))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      for (const t of s.travelers)
        if (!s.services[t.id]?.[j.id]?.seats[f.instanceKey]) {
          const seat = free.shift();
          if (!seat) throw new Error("可用座位不足");
          assignments.push({
            tid: t.id,
            jid: j.id,
            key: f.instanceKey,
            id: seat.id,
          });
          cost += seatPrice(j.cabins[i], j.family, seat);
        }
    }
  return { assignments, cost };
}
