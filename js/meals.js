import { menus } from "../assets/data/meals.js";

export const NO_MEAL = "NONE";
export const serviceCount = (f) =>
  f.durationMinutes <= 480 ? 1 : f.durationMinutes <= 900 ? 2 : 3;
export const hasMainCourseSelection = (cabin) => ["C", "F"].includes(cabin);

// Main courses and special requests are separate selections. Economy and
// premium economy store NONE markers instead of preselected dishes.
export function mealOptions(f, cabin, serviceIndex = 0) {
  return hasMainCourseSelection(cabin)
    ? [...menus.P, ...menus.B]
    : [[NO_MEAL, "無需求"]];
}
export const specialMealOptions = () => [[NO_MEAL, "無需求"], ...menus.SP];
export const mealName = (code) =>
  code === NO_MEAL
    ? "無需求"
    : Object.values(menus)
        .flat()
        .find((meal) => meal[0] === code)?.[1] ||
      code ||
      "尚未選擇";

export function mealSelections(flight, cabin, service = {}) {
  const mains = service?.meals?.[flight.instanceKey];
  const specialCode = service?.specialMeals?.[flight.instanceKey] ?? NO_MEAL;
  return Array.from({ length: serviceCount(flight) }, (_, index) => {
    const mainCode =
      mains?.[index] ?? (hasMainCourseSelection(cabin) ? null : NO_MEAL);
    return {
      index,
      mainCode,
      specialCode,
      effectiveCode: specialCode === NO_MEAL ? mainCode : specialCode,
    };
  });
}

export function validMealSelections(flight, cabin, service = {}) {
  if (!["Y", "W", "C", "F"].includes(cabin)) return false;
  const mains = service?.meals?.[flight.instanceKey];
  if (!Array.isArray(mains) || mains.length !== serviceCount(flight))
    return false;
  const specialCode = service?.specialMeals?.[flight.instanceKey] ?? NO_MEAL;
  return (
    specialMealOptions().some(([code]) => code === specialCode) &&
    Array.from(mains).every((main, index) =>
      mealOptions(flight, cabin, index).some(([code]) => code === main),
    )
  );
}

export function mealDescription(flight, cabin, service = {}) {
  const selections = mealSelections(flight, cabin, service);
  const specialCode = selections[0]?.specialCode ?? NO_MEAL;
  const special =
    specialCode === NO_MEAL
      ? "特殊餐需求：無需求"
      : `特殊餐需求：${mealName(specialCode)}（全段每次餐飲優先供應）`;
  if (!hasMainCourseSelection(cabin))
    return `${special}；機上提供 ${serviceCount(flight)} 次餐飲服務`;
  const mains = selections
    .map(({ index, mainCode }) => `第 ${index + 1} 餐 ${mealName(mainCode)}`)
    .join(" ／ ");
  return `主菜預選：${mains}；${special}${specialCode === NO_MEAL ? "" : "，原主菜預選予以保留"}`;
}
