import { menus } from "../assets/data/meals.js";
export const serviceCount = (f) =>
  f.durationMinutes <= 480 ? 1 : f.durationMinutes <= 900 ? 2 : 3;
export function mealOptions(f, c, i) {
  const key =
    i === 1
      ? "L1"
      : i === 2
        ? "L2"
        : f.durationMinutes <= 180
          ? "S"
          : f.durationMinutes <= 480
            ? "M"
            : "L";
  return [
    ...("FC".includes(c) ? menus.P : menus[key]),
    ...(c === "W" ? menus.P.slice(0, 2) : []),
    ...menus.SP,
  ];
}
export const mealName = (code) =>
  Object.values(menus)
    .flat()
    .find((m) => m[0] === code)?.[1] || code;
