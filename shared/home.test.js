import { describe, expect, test } from "vitest";
import {
  CATALOG, DEFAULT_LAYOUTS, DOORS, FLAT, FLOORS, MATERIALS, MAX_ITEMS, ROOMS, WALLPAPERS,
  cleanLayout, footprint, freeSpot, layoutProblem, roomAt, turned, wallsOf,
} from "./home.js";

const area = (id) => ROOMS[id].areas.reduce((s, a) => s + (a.x1 - a.x0) * (a.y1 - a.y0), 0);
const bedB = DEFAULT_LAYOUTS.bedB;
const withItems = (items, base = bedB) => ({ ...base, items });

describe("the flat", () => {
  test("about 750 sq ft: two bedrooms on the left opening onto the main area, the bathroom in the back right corner", () => {
    const total = Object.keys(ROOMS).reduce((s, id) => s + area(id), 0);
    expect(total).toBe(FLAT.w * FLAT.d);
    expect(total).toBe(750);
    expect(roomAt(1, 1)).toBe("bedA");
    expect(roomAt(1, 24)).toBe("bedB");
    expect(roomAt(FLAT.w - 1, 1)).toBe("bath");
    for (const d of DOORS) {
      const mid = (d.from + d.to) / 2;
      const sides = d.axis === "x" ? [roomAt(d.at - 0.5, mid), roomAt(d.at + 0.5, mid)] : [roomAt(mid, d.at - 0.5), roomAt(mid, d.at + 0.5)];
      expect(sides.sort()).toEqual([...d.rooms].sort());
    }
  });

  test("walls go round each room, with gaps where the doors are", () => {
    const walls = wallsOf("bedB");
    const east = walls.filter((w) => w.side === "e");
    expect(east.map((w) => [w.from, w.to])).toEqual([[12, 20], [23, 25]]);
    expect(walls.find((w) => w.side === "n").outer).toBe(false);   // bedroom 1 is behind it
    expect(walls.find((w) => w.side === "s").outer).toBe(true);
  });
});

describe("the catalog", () => {
  test("every piece is made of known materials and comes in known colours", () => {
    for (const [kind, c] of Object.entries(CATALOG)) {
      expect(c.colors.length, kind).toBeGreaterThan(0);
      for (const b of c.boxes) {
        expect(b.length, kind).toBe(7);
        expect(b[6].startsWith("main") || Object.hasOwn(MATERIALS, b[6]), `${kind}: ${b[6]}`).toBe(true);
      }
    }
  });

  test("the flat as it comes is a layout the server would take", () => {
    for (const room of Object.keys(ROOMS)) {
      expect(layoutProblem(room, DEFAULT_LAYOUTS[room]), room).toBe(null);
      expect(WALLPAPERS[DEFAULT_LAYOUTS[room].wall] && FLOORS[DEFAULT_LAYOUTS[room].floor], room).toBeTruthy();
    }
  });
});

describe("what a layout may be", () => {
  const bed = { kind: "bed", color: "blue", x: 0.5, y: 12, rot: 0 };

  test("furniture stays in the room and off the doorways, and solid pieces don't overlap", () => {
    expect(layoutProblem("bedB", withItems([{ ...bed, x: 8 }]))).toMatch(/doesn't fit/);
    expect(layoutProblem("bedB", withItems([{ ...bed, y: 11 }]))).toMatch(/doesn't fit/);             // into bedroom 1
    expect(layoutProblem("bedB", withItems([{ ...bed, x: 7.5, y: 17 }]))).toMatch(/blocks a doorway/);
    expect(layoutProblem("bedB", withItems([bed, { ...bed, x: 3 }]))).toMatch(/overlaps/);
    expect(layoutProblem("bedB", withItems([bed, { ...bed, x: 4 }]))).toBe(null);
    expect(layoutProblem("bedB", withItems([{ ...bed, x: 0.25 }]))).toMatch(/out of place/);   // on the half foot
  });

  test("rugs go under anything, but not under each other; the bowl can't go on furniture", () => {
    const rug = { kind: "rug", color: "pink", x: 1, y: 14, rot: 0 };
    expect(layoutProblem("bedB", withItems([bed, rug]))).toBe(null);
    expect(layoutProblem("bedB", withItems([rug, { ...rug, kind: "small_rug", x: 2 }]))).toMatch(/overlaps/);
    expect(layoutProblem("bedB", withItems([bed, { kind: "bowl", color: "blue", x: 1, y: 14, rot: 0 }]))).toMatch(/overlaps/);
    expect(layoutProblem("bedB", withItems([rug, { kind: "bowl", color: "blue", x: 1, y: 14, rot: 0 }]))).toBe(null);
  });

  test("wall pieces hang on the room's own walls; windows only on outside ones", () => {
    const window = { kind: "window", color: "white", side: "w", line: 0, at: 14 };
    expect(layoutProblem("bedB", withItems([window]))).toBe(null);
    expect(layoutProblem("bedB", withItems([{ ...window, side: "n", line: 12, at: 2 }]))).toMatch(/outside wall/);
    expect(layoutProblem("bedB", withItems([{ ...window, kind: "picture", color: "sun", side: "n", line: 12, at: 2 }]))).toBe(null);
    expect(layoutProblem("bedB", withItems([{ ...window, kind: "picture", color: "sun", side: "e", line: 11, at: 19 }]))).toMatch(/walls/); // the doorway
    expect(layoutProblem("bedB", withItems([window, { ...window, at: 15 }]))).toMatch(/overlaps/);
    expect(layoutProblem("bedB", withItems([{ ...window, line: 3 }]))).toMatch(/outside wall/);
  });

  test("only the catalog's pieces and colours, and not too many of them", () => {
    expect(layoutProblem("bedB", withItems([{ ...bed, kind: "jacuzzi" }]))).toMatch(/catalog/);
    expect(layoutProblem("bedB", withItems([{ ...bed, kind: "constructor" }]))).toMatch(/catalog/);
    expect(layoutProblem("bedB", withItems([{ ...bed, color: "plaid" }]))).toMatch(/colour/);
    expect(layoutProblem("bedB", withItems([null]))).toMatch(/catalog/);
    expect(layoutProblem("bedB", { ...bedB, wall: "toString" })).toMatch(/wallpaper/);
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => ({ kind: "picture", color: "sun", side: "n", line: 12, at: 0 }));
    expect(layoutProblem("bedB", withItems(many))).toMatch(/40/);
    expect(layoutProblem("attic", bedB)).toMatch(/no such room/);
  });

  test("what is kept is only what the catalog knows", () => {
    const l = cleanLayout(withItems([{ ...bed, sneaky: true }, { kind: "clock", color: "white", side: "n", line: 12, at: 1, x: 3 }]));
    expect(l.items).toEqual([bed, { kind: "clock", color: "white", side: "n", line: 12, at: 1 }]);
  });
});

describe("the builder's moves", () => {
  test("a quarter turn keeps a piece where it was; four bring it back", () => {
    const bed = { kind: "bed", color: "blue", x: 3, y: 15, rot: 0 };
    const t = turned(bed);
    const [a, b] = [footprint(bed), footprint(t)];
    expect(t.rot).toBe(1);
    expect(b.x1 - b.x0).toBe(6.5);
    expect((a.x0 + a.x1) / 2).toBeCloseTo((b.x0 + b.x1) / 2, 5);
    expect(turned(turned(turned(t)))).toEqual(bed);
  });

  test("a new piece goes where it fits, until nothing more does", () => {
    let layout = withItems([]);
    let n = 0;
    for (;;) {
      const it = freeSpot("bedB", layout, "wardrobe");
      if (!it) break;
      layout = withItems([...layout.items, it], layout);
      expect(layoutProblem("bedB", layout)).toBe(null);
      n += 1;
    }
    expect(n).toBeGreaterThan(5);
    expect(freeSpot("bedB", layout, "picture")).not.toBe(null);
    const window = freeSpot("bedB", bedB, "window");
    expect(wallsOf("bedB").find((w) => w.side === window.side && w.line === window.line).outer).toBe(true);
  });
});
