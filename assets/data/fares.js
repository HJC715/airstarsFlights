export const cabinNames = {
  Y: "經濟艙",
  W: "豪華經濟艙",
  C: "商務艙",
  F: "頭等艙",
};
export const cabinMultiplier = { Y: 1, W: 1.7, C: 3.2, F: 5.5 };
export const families = {
  Saver: { name: "超值", multiplier: 0.85, change: 3000, refund: null },
  Basic: { name: "基本", multiplier: 1, change: 1500, refund: 2500 },
  Flex: { name: "彈性", multiplier: 1.3, change: 0, refund: 0 },
};
export const baggage = {
  Y: [1, 2, 2, 23],
  W: [1, 2, 3, 23],
  C: [2, 3, 3, 32],
  F: [3, 3, 4, 32],
};
export const mileage = {
  Y: [0.5, 1, 1.25],
  W: [0.75, 1.1, 1.5],
  C: [1.25, 1.5, 1.75],
  F: [1.5, 1.75, 2],
};
export const seatFees = {
  premiumCabin: 0,
  standard: 350,
  preferred: 700,
  extraLegroom: 1300,
};
export const categoryNames = {
  premiumCabin: "尊榮座位",
  standard: "一般座位",
  preferred: "優選座位",
  extraLegroom: "加大腿部空間",
};
export const distanceBands = [
  [1499, 4500, 600],
  [2999, 7000, 900],
  [4999, 9800, 1400],
  [7999, 18000, 2200],
  [11999, 28000, 3200],
  [Infinity, 34000, 4000],
];
export const familyIndex = (f) => Object.keys(families).indexOf(f);
