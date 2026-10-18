import { inventory } from "./inventory.js";
import { seatPrice } from "./pricing.js";
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
