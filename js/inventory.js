import { aircraft } from "./data.js";
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const cache = new Map();
export function inventory(f, c) {
  const seed = `${f.flightNo}|${f.departureLocalISODate}|${c}`;
  if (cache.has(seed)) return cache.get(seed);
  const seats = aircraft[f.aircraftType].seats.filter((s) => s.cabin === c),
    r = hash(seed) % 100;
  const ratio =
    r === 0
      ? 1
      : r <= 4
        ? (87 + (hash(seed + "|occupancy") % 10)) / 100
        : (20 + (hash(seed + "|occupancy") % 61)) / 100;
  const occupiedCount =
    r === 0 ? seats.length : Math.floor(seats.length * ratio);
  const occupied = new Set(
    [...seats]
      .sort(
        (a, b) =>
          hash(seed + "|" + a.id) - hash(seed + "|" + b.id) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, occupiedCount)
      .map((s) => s.id),
  );
  const data = {
    seats,
    occupied,
    total: seats.length,
    remaining: seats.length - occupiedCount,
  };
  cache.set(seed, data);
  return data;
}
