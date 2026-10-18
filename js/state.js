export function initialState() {
  return {
    screen: "home",
    tripType: "round-trip",
    passengerCount: 1,
    journeys: [],
    travelers: [],
    services: {},
    contact: {},
    selectedCurrency: "TWD",
    activeStep: 1,
    maxStep: 1,
    reviewed: false,
    card: "DEMO-GOLD",
    paymentState: "reviewed",
    paymentError: "",
    confirmation: null,
    priceBreakdown: null,
    quoteNow: Date.now(),
  };
}
export const state = initialState();
export function reset() {
  const currency = state.selectedCurrency;
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, initialState(), { selectedCurrency: currency });
}
export function freezeBookingSnapshot(s, priceBreakdown) {
  const snapshot = structuredClone({
    tripType: s.tripType,
    passengerCount: s.passengerCount,
    journeys: s.journeys,
    travelers: s.travelers,
    services: s.services,
    contact: s.contact,
    selectedCurrency: s.selectedCurrency,
    quoteNow: s.quoteNow,
    priceBreakdown,
  });
  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  return freeze(snapshot);
}
export function service(tid, jid) {
  state.services[tid] ??= {};
  state.services[tid][jid] ??= { seats: {}, meals: {}, bags: [] };
  return state.services[tid][jid];
}
