import { state } from "./state.js";
import { cabinNames } from "../assets/data/fares.js";
import { money } from "./pricing.js";
import {
  NO_MEAL,
  hasMainCourseSelection,
  mealOptions,
  specialMealOptions,
  mealName,
  serviceCount,
} from "./meals.js";

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const optionMarkup = (options, selected) =>
  options
    .map(
      ([code, name]) =>
        `<option value="${escapeHTML(code)}"${code === selected ? " selected" : ""}>${escapeHTML(name)}</option>`,
    )
    .join("");

export function ensureMeals(order = state) {
  order.services ??= {};
  for (const journey of order.journeys) {
    if (!journey.option) continue;
    journey.option.legs.forEach((flight, legIndex) => {
      const cabin = journey.cabins[legIndex];
      for (const traveler of order.travelers) {
        order.services[traveler.id] ??= {};
        const service = (order.services[traveler.id][journey.id] ??= {
          seats: {},
          meals: {},
          specialMeals: {},
          bags: [],
        });
        service.meals ??= {};
        service.specialMeals ??= {};
        const previous = Array.isArray(service.meals[flight.instanceKey])
          ? service.meals[flight.instanceKey]
          : [];
        // Migrate earlier in-memory special selections to the segment-wide
        // request field without discarding a premium main course.
        const savedSpecial = service.specialMeals[flight.instanceKey];
        const migratedSpecial = previous.find((code) =>
          specialMealOptions().some(
            ([special]) => special !== NO_MEAL && special === code,
          ),
        );
        const special = savedSpecial ?? migratedSpecial ?? NO_MEAL;
        service.specialMeals[flight.instanceKey] = specialMealOptions().some(
          ([code]) => code === special,
        )
          ? special
          : NO_MEAL;
        service.meals[flight.instanceKey] = Array.from(
          { length: serviceCount(flight) },
          (_, index) => {
            const choices = mealOptions(flight, cabin, index);
            return choices.some(([code]) => code === previous[index])
              ? previous[index]
              : choices[0][0];
          },
        );
      }
    });
  }
}

export function mealsView(order = state) {
  ensureMeals(order);
  return `<div class="notice" style="margin-bottom:20px">所有機上餐飲均已包含，餐點預約不另收費。食品與特殊餐皆為虛構示範，不保證真實過敏原或宗教飲食認證。</div>${order.journeys
    .map((journey, journeyIndex) =>
      journey.option.legs
        .map((flight, legIndex) => {
          const cabin = journey.cabins[legIndex];
          const premium = hasMainCourseSelection(cabin);
          return `<section class="panel meal-panel"><h2>${escapeHTML(flight.flightNo)} · ${escapeHTML(flight.origin)} → ${escapeHTML(flight.destination)}</h2><p class="small">${cabinNames[cabin]} · ${serviceCount(flight)} 次餐飲服務 · ${money(0, order.selectedCurrency)}</p><p>${premium ? "可預選各次餐飲主菜或早餐，並另行設定特殊餐需求。" : "可預約特殊餐；無特殊需求時由機上安排餐飲，無須預選一般主菜。"}</p>${order.travelers
            .map((traveler, travelerIndex) => {
              const service = order.services[traveler.id][journey.id];
              const special = service.specialMeals[flight.instanceKey];
              return `<div class="review-section"><h3>${escapeHTML(traveler.surname)} / ${escapeHTML(traveler.givenName)}</h3>${premium ? `<h4>主菜預選</h4><div class="meal-services">${Array.from({ length: serviceCount(flight) }, (_, index) => `<label class="form-label">第 ${index + 1} 次餐飲<select data-meal="${journeyIndex}|${legIndex}|${travelerIndex}|${index}">${optionMarkup(mealOptions(flight, cabin, index), service.meals[flight.instanceKey][index])}</select></label>`).join("")}</div>` : ""}<div class="meal-services" style="margin-top:18px"><label class="form-label">特殊餐需求（此航段全部餐飲）<select data-special-meal="${journeyIndex}|${legIndex}|${travelerIndex}">${optionMarkup(specialMealOptions(), special)}</select></label></div><p class="small">${special === NO_MEAL ? "目前無特殊餐需求。" : `已預約${escapeHTML(mealName(special))}，此航段每次餐飲皆優先依特殊需求供應。`}${premium ? " 特殊餐需求優先於主菜預選；變更特殊需求會保留原主菜選擇。" : ""}</p></div>`;
            })
            .join("")}</section>`;
        })
        .join(""),
    )
    .join("")}`;
}
