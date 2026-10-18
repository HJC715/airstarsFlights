// [first row, last row, seat blocks]; capacities derive only from actual seats.
export const layouts = {
  A320neo: { C: [1, 2, "AC|DF"], Y: [5, 29, "ABC|DEF"] },
  A321neo: { C: [1, 3, "AC|DF"], Y: [5, 34, "ABC|DEF"] },
  "A330-900neo": {
    C: [1, 7, "A|DG|K"],
    W: [11, 14, "AB|DEFG|HK"],
    Y: [20, 46, "AB|DEFG|JK"],
  },
  "B787-9": {
    F: [1, 2, "A|DG|K"],
    C: [5, 11, "A|DG|K"],
    W: [15, 18, "AC|DEF|HK"],
    Y: [22, 42, "ABC|DEF|HJK"],
  },
  "B787-10": {
    F: [1, 2, "A|DG|K"],
    C: [5, 13, "A|DG|K"],
    W: [17, 21, "AC|DEF|HK"],
    Y: [25, 49, "ABC|DEF|HJK"],
  },
  "A350-900": {
    F: [1, 2, "A|DG|K"],
    C: [5, 13, "A|DG|K"],
    W: [17, 20, "AB|DEFG|HK"],
    Y: [24, 51, "ABC|DEF|HJK"],
  },
  "A350-1000": {
    F: [1, 2, "A|DG|K"],
    C: [5, 15, "A|DG|K"],
    W: [19, 23, "AB|DEFG|HK"],
    Y: [27, 58, "ABC|DEF|HJK"],
  },
  "B777-300ER": {
    F: [1, 2, "A|DG|K"],
    C: [5, 14, "A|DG|K"],
    W: [18, 22, "AB|DEFG|HK"],
    Y: [26, 55, "ABC|DEFG|HJK"],
  },
};
export const aircraft = Object.fromEntries(
  Object.entries(layouts).map(([type, cabins]) => {
    const seats = Object.entries(cabins).flatMap(
      ([cabin, [first, last, blocks]]) =>
        Array.from({ length: last - first + 1 }, (_, i) => {
          const row = first + i;
          return blocks.split("|").flatMap((letters, block) =>
            [...letters]
              .filter(
                (letter) =>
                  !(
                    type === "A330-900neo" &&
                    cabin === "W" &&
                    row === 14 &&
                    "DEFG".includes(letter)
                  ),
              )
              .map((letter) => ({
                id: row + letter,
                row,
                letter,
                block,
                cabin,
                category: "FC".includes(cabin)
                  ? "premiumCabin"
                  : i === 0
                    ? "extraLegroom"
                    : i <= 3
                      ? "preferred"
                      : "standard",
              })),
          );
        }).flat(),
    );
    return [
      type,
      {
        type,
        cabins,
        seats,
        capacityByCabin: Object.fromEntries(
          Object.keys(cabins).map((c) => [
            c,
            seats.filter((s) => s.cabin === c).length,
          ]),
        ),
      },
    ];
  }),
);
