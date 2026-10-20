import { describe, expect, test } from "vitest";
import {
  CATALOG, DEFAULT_LAYOUTS, DOORS, FLAT, FLOORS, GRID, MATERIALS, MAX_ITEMS, ROOMS, WALLPAPERS,
  bounds, cleanLayout, footprint, freeSpot, layoutProblem, place, roomAt, turned, wallsOf,
} from "./home.js";

const rect = (a) => (a.x1 - a.x0) * (a.y1 - a.y0);
const area = (id) => ROOMS[id].areas.reduce((s, a) => s + rect(a), 0) + (ROOMS[id].builtins || []).reduce((s, b) => s + rect(b), 0);
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
    const east = walls.filter((w) => w.side === "e" && !w.builtin);
    expect(east.map((w) => [w.from, w.to, w.line])).toEqual([[13, 15, 13], [18, 25, 13]]);
    expect(walls.find((w) => w.side === "n").outer).toBe(false);   // bedroom 1 is behind it
    expect(walls.filter((w) => w.side === "s" && w.line === 25).every((w) => w.outer)).toBe(true);
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
  const bed = { kind: "bed", color: "blue", x: 0.5, y: 13, rot: 0 };

  test("furniture stays in the room and off the doorways, and solid pieces don't overlap", () => {
    expect(layoutProblem("bedB", withItems([{ ...bed, x: 10 }]))).toMatch(/doesn't fit/);
    expect(layoutProblem("bedB", withItems([{ ...bed, y: 12 }]))).toMatch(/doesn't fit/);             // into bedroom 1
    expect(layoutProblem("bedB", withItems([{ ...bed, x: 9.5 }]))).toMatch(/blocks a doorway/);
    expect(layoutProblem("bedB", withItems([bed, { ...bed, x: 3 }]))).toMatch(/overlaps/);
    expect(layoutProblem("bedB", withItems([bed, { ...bed, x: 4 }]))).toBe(null);
    expect(layoutProblem("bedB", withItems([{ ...bed, x: 0.25 }]))).toBe(null);               // on the 3 inch grid
    expect(layoutProblem("bedB", withItems([{ ...bed, x: 0.1 }]))).toMatch(/out of place/);
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
    expect(layoutProblem("bedB", withItems([{ ...window, side: "n", line: 13, at: 2 }]))).toMatch(/outside wall/);
    expect(layoutProblem("bedB", withItems([{ ...window, kind: "picture", color: "sun", side: "n", line: 13, at: 2 }]))).toBe(null);
    expect(layoutProblem("bedB", withItems([{ ...window, kind: "picture", color: "sun", side: "e", line: 13, at: 16 }]))).toMatch(/walls/); // the doorway
    expect(layoutProblem("bedB", withItems([window, { ...window, at: 15 }]))).toMatch(/overlaps/);
    expect(layoutProblem("bedB", withItems([{ ...window, line: 3 }]))).toMatch(/outside wall/);
  });

  test("only the catalog's pieces and colours, and not too many of them", () => {
    expect(layoutProblem("bedB", withItems([{ ...bed, kind: "jacuzzi" }]))).toMatch(/catalog/);
    expect(layoutProblem("bedB", withItems([{ ...bed, kind: "constructor" }]))).toMatch(/catalog/);
    expect(layoutProblem("bedB", withItems([{ ...bed, color: "plaid" }]))).toMatch(/colour/);
    expect(layoutProblem("bedB", withItems([null]))).toMatch(/catalog/);
    expect(layoutProblem("bedB", { ...bedB, wall: "toString" })).toMatch(/wallpaper/);
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => ({ kind: "picture", color: "sun", side: "n", line: 13, at: 0 }));
    expect(layoutProblem("bedB", withItems(many))).toMatch(/40/);
    expect(layoutProblem("attic", bedB)).toMatch(/no such room/);
  });

  test("what is kept is only what the catalog knows", () => {
    const l = cleanLayout(withItems([{ ...bed, sneaky: true }, { kind: "clock", color: "white", side: "n", line: 13, at: 1, x: 3 }]));
    expect(l.items).toEqual([bed, { kind: "clock", color: "white", side: "n", line: 13, at: 1 }]);
  });
});

describe("room to live in", () => {
  test("pieces are their real sizes: a twin bed is 39 inches by 75, a desk 42 by 21", () => {
    expect(CATALOG.bed.w).toBe(3.25);
    expect(CATALOG.bed.d).toBeGreaterThanOrEqual(6.25);
    expect(CATALOG.desk.w * 12).toBe(42);
    for (const c of Object.values(CATALOG)) {
      for (const [x, y, , w, d] of c.boxes) {
        if (c.layer === "wall") continue;
        // Drawer fronts and handles stand an inch proud at most; nothing more.
        expect(x >= -0.1 && y >= -0.1 && x + w <= c.w + 0.1 && y + d <= c.d + 0.1, `${c.label} model inside its footprint`).toBe(true);
      }
    }
  });

  test("Bedroom 2: white, 13 x 12, two twin beds with headboards on the front wall, small windows above them, a built-in closet between", () => {
    const l = DEFAULT_LAYOUTS.bedB;
    expect(layoutProblem("bedB", l)).toBe(null);
    expect(l.wall).toBe("white");
    const room = bounds("bedB");
    expect([room.x1 - room.x0, room.y1 - room.y0]).toEqual([13, 12]);     // turned a quarter: wide, not deep
    const beds = l.items.filter((i) => i.kind === "bed");
    expect(beds.length).toBe(2);
    for (const bed of beds) {
      expect(footprint(bed).y1).toBe(25);
      expect(place(bed, CATALOG.bed.w / 2, 0)[1]).toBe(25);          // the headboard's middle is at the front wall
    }
    const [left, right] = beds.map(footprint).sort((p, q) => p.x0 - q.x0);
    expect(left.x0).toBe(0);
    expect(right.x1).toBe(13);
    // A small high window over each headboard.
    const windows = l.items.filter((i) => i.kind === "basement_window").sort((p, q) => p.at - q.at);
    expect(windows.length).toBe(2);
    for (const [w, bed] of [[windows[0], left], [windows[1], right]]) {
      expect([w.side, w.line]).toEqual(["s", 25]);
      expect(w.at >= bed.x0 && w.at + CATALOG.basement_window.w <= bed.x1).toBe(true);
    }
    expect(Math.min(...CATALOG.basement_window.boxes.map((b) => b[2]))).toBeGreaterThan(2.8);   // above the headboards
    // The closet is part of the room's walls on the front wall between the beds: the room steps
    // round it, walls along both its sides and across its front, where its two full-size doors
    // face in. It fills the space flush with both beds, and nothing can stand in it or in front.
    const c = ROOMS.bedB.builtins.find((bi) => bi.kind === "closet");
    expect(c.y1).toBe(25);
    expect(c.x0).toBe(left.x1);
    expect(c.x1).toBe(right.x0);
    expect(c.y1 - c.y0).toBeGreaterThanOrEqual(2);                    // a closet's depth, out into the room
    expect(c.doors).toBe("n");
    expect((c.x1 - c.x0 - 0.3) / 2).toBeGreaterThanOrEqual(3);        // two full-size doors
    const around = wallsOf("bedB").filter((w) => w.builtin === "closet" && !w.inside).map((w) => [w.side, w.line, w.from, w.to]);
    expect(around.sort()).toEqual([["e", c.x0, c.y0, c.y1], ["s", c.y0, c.x0, c.x1], ["w", c.x1, c.y0, c.y1]].sort());
    expect(wallsOf("bedB").some((w) => w.builtin && !w.inside && w.outer)).toBe(false);   // its walls aren't outside walls
    // Its back is the flat's outside wall, and nothing hangs inside it.
    expect(wallsOf("bedB").filter((w) => w.inside).map((w) => [w.side, w.line, w.from, w.to, w.outer])).toEqual([["s", 25, c.x0, c.x1, true]]);
    expect(layoutProblem("bedB", { ...l, items: [...l.items, { kind: "picture", color: "sun", side: "s", line: 25, at: 5 }] })).toMatch(/walls/);
    expect(roomAt(6, 24)).toBe(null);                                  // inside it is no floor
    expect(layoutProblem("bedB", { ...l, items: [...l.items, { kind: "plant", color: "teal", x: 5, y: 23, rot: 0 }] })).toMatch(/doesn't fit/);
    expect(layoutProblem("bedB", { ...l, items: [...l.items, { kind: "beanbag", color: "teal", x: 5, y: 20, rot: 0 }] })).toMatch(/in front of the closet/);
    // The door is still on the right wall, into the living room.
    const door = DOORS.find((d) => d.rooms.includes("bedB"));
    expect(door.rooms).toContain("main");
    expect([door.axis, door.at]).toEqual(["x", room.x1]);
    expect(door.from - room.y0).toBe(2);                               // 2 ft from the back (top) corner
    expect(door.to - door.from).toBe(3);
    for (const kind of ["desk", "dresser", "pet_bed"]) expect(l.items.some((i) => i.kind === kind), kind).toBe(true);
    // And there is still room to add things.
    for (const kind of ["beanbag", "bookshelf", "lamp"]) expect(freeSpot("bedB", l, kind), kind).not.toBe(null);
  });



});

describe("the builder's moves", () => {
  test("a quarter turn keeps a piece where it was; four bring it back", () => {
    const bed = { kind: "bed", color: "blue", x: 3, y: 15, rot: 0 };
    const t = turned(bed);
    const [a, b] = [footprint(bed), footprint(t)];
    expect(t.rot).toBe(1);
    expect(b.x1 - b.x0).toBe(6.5);
    expect(Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2)).toBeLessThanOrEqual(GRID);
    expect(Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)).toBeLessThanOrEqual(GRID);
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
