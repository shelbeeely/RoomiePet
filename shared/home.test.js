import { describe, expect, test } from "vitest";
import {
  CATALOG, DEFAULT_LAYOUTS, DOORS, FLAT, FLOORS, GRID, MATERIALS, MAX_ITEMS, PILLOWS, ROOMS, WALLPAPERS,
  bounds, cleanLayout, footprint, freeSpot, layoutProblem, place, roomAt, turned, wallSpotNear, wallsOf,
} from "./home.js";

const rect = (a) => (a.x1 - a.x0) * (a.y1 - a.y0);
const area = (id) => ROOMS[id].areas.reduce((s, a) => s + rect(a), 0) + (ROOMS[id].builtins || []).reduce((s, b) => s + rect(b), 0);
const bedB = DEFAULT_LAYOUTS.bedB;
const withItems = (items, base = bedB) => ({ ...base, items });

const overlapping = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

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
    expect(east.map((w) => [w.from, w.to, w.line])).toEqual([[12, 14, 13], [17, 25, 13]]);
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
  const bed = { kind: "bed", color: "blue", x: 0.5, y: 12, rot: 0 };

  test("furniture stays in the room and off the doorways, and solid pieces don't overlap", () => {
    expect(layoutProblem("bedB", withItems([{ ...bed, x: 10 }]))).toMatch(/doesn't fit/);
    expect(layoutProblem("bedB", withItems([{ ...bed, y: 11 }]))).toMatch(/doesn't fit/);             // into bedroom 1
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
    expect(layoutProblem("bedB", withItems([{ ...window, side: "n", line: 12, at: 2 }]))).toMatch(/outside wall/);
    expect(layoutProblem("bedB", withItems([{ ...window, kind: "picture", color: "sun", side: "n", line: 12, at: 2 }]))).toBe(null);
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
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => ({ kind: "picture", color: "sun", side: "n", line: 12, at: 0 }));
    expect(layoutProblem("bedB", withItems(many))).toMatch(/40/);
    expect(layoutProblem("attic", bedB)).toMatch(/no such room/);
  });

  test("what is kept is only what the catalog knows", () => {
    const l = cleanLayout(withItems([{ ...bed, sneaky: true }, { kind: "clock", color: "white", side: "n", line: 12, at: 1, x: 3 }]));
    expect(l.items).toEqual([bed, { kind: "clock", color: "white", side: "n", line: 12, at: 1 }]);
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

  test("Bedroom 2, as sketched: white, 13 x 13, a Twin XL and a twin with headboards on the front wall, small windows above them, a built-in closet between", () => {
    const l = DEFAULT_LAYOUTS.bedB;
    expect(layoutProblem("bedB", l)).toBe(null);
    expect(l.wall).toBe("white");
    const room = bounds("bedB");
    expect([room.x1 - room.x0, room.y1 - room.y0]).toEqual([13, 13]);     // the L-desk, tall chest and Twin XL down the left wall
    const beds = l.items.filter((i) => CATALOG[i.kind].bed);
    expect(beds.map((b) => b.kind).sort()).toEqual(["platform_bed", "twin_xl"]);
    expect(beds.length).toBe(2);
    for (const bed of beds) {
      expect(footprint(bed).y1).toBe(25);
      expect(place(bed, CATALOG[bed.kind].w / 2, 0)[1]).toBe(25);          // the headboard's middle is at the front wall
    }
    const [left, right] = beds.map(footprint).sort((p, q) => p.x0 - q.x0);
    expect(left.x0).toBe(0);
    expect(right.x1).toBe(13);
    // A small high window over each headboard.
    // A small high window over each headboard; over the twin's, a tapestry hung on a rod in front
    // of it (from the photo of that bed).
    const over = l.items.filter((i) => ["basement_window", "tapestry"].includes(i.kind) && i.side === "s").sort((p, q) => p.at - q.at);
    expect(over.map((i) => i.kind)).toEqual(["basement_window", "tapestry"]);
    // As in the photo of the real room: one more on the side wall, grey planks underfoot.
    expect(l.items.some((i) => CATALOG[i.kind].outer && i.kind.endsWith("window") && i.side === "w")).toBe(true);
    expect(l.floor).toBe("greywood");
    for (const [w, bed] of [[over[0], left], [over[1], right]]) {
      expect([w.side, w.line]).toEqual(["s", 25]);
      expect(w.at >= bed.x0 - 0.01 && w.at + CATALOG[w.kind].w <= bed.x1 + 0.01).toBe(true);
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
    // The rest as sketched: the L-desk in the back left corner, the shelf and the TV desk along
    // the back wall, the tall chest on the left one, the lift-lid chest at the foot of the twin.
    // From the photos: the Twin XL lies along the left wall, the side window above it, the chest
    // between it and the desk.
    const at = (kind) => footprint(l.items.find((i) => i.kind === kind));
    expect([at("l_desk").x0, at("l_desk").y0]).toEqual([0, room.y0]);
    for (const [x, y] of CATALOG.l_desk.plan) expect(x <= CATALOG.l_desk.w && y <= CATALOG.l_desk.d).toBe(true);   // the L inside its box
    // From the photo of the desk: the chair is tucked into the crook of the L, which is floor;
    // on either arm it is not.
    const chair = l.items.find((i) => i.kind === "chair");
    const desk = l.items.find((i) => i.kind === "l_desk");
    expect(overlapping(footprint(chair), footprint(desk))).toBe(true);
    expect(layoutProblem("bedB", { ...l, items: l.items.map((i) => (i === chair ? { ...i, x: 0.25 } : i)) })).toMatch(/overlaps the l-desk/);
    expect(layoutProblem("bedB", { ...l, items: l.items.map((i) => (i === chair ? { ...i, y: 12.5 } : i)) })).toMatch(/overlaps the l-desk/);
    // The twin by the door: a black steel platform frame, no headboard; pink Hello Kitty pillowcases.
    expect(beds.find((b) => b.kind === "platform_bed").color).toBe("kitty");
    expect(PILLOWS.kitty.case).toMatch(/^#/);
    // Her half (the twin by the door) is dark pastel, with Kuromi about it.
    for (const kind of ["kuromi_bed", "skull_rug"]) expect(at(kind).x1, kind).toBeGreaterThan(6.5);
    for (const kind of ["kuromi_poster", "string_lights"]) {
      const w = l.items.find((i) => i.kind === kind);
      expect(w.side === "e" || w.line >= 6.5, kind).toBe(true);
    }
    // The clothes rack rolls about: it is a piece like any other.
    expect(l.items.some((i) => i.kind === "clothes_rack")).toBe(true);
    for (const kind of ["shelf_3tier", "desk_tv"]) expect(at(kind).y0, kind).toBe(room.y0);
    expect(at("shelf_3tier").x0).toBeGreaterThanOrEqual(at("l_desk").x1);
    expect(at("desk_tv").x0).toBeGreaterThanOrEqual(at("shelf_3tier").x1);
    expect(at("tall_chest").x0).toBe(0);
    expect(at("tall_chest").y0).toBe(at("l_desk").y1);
    expect(at("tall_chest").y1).toBeLessThanOrEqual(left.y0);
    const side = l.items.find((i) => i.kind === "deep_window");
    expect([side.side, side.line]).toEqual(["w", 0]);
    expect(side.at >= left.y0 && side.at + CATALOG.deep_window.w <= left.y1).toBe(true);
    expect(left.y1 - left.y0).toBe(CATALOG.twin_xl.d);
    expect(at("storage_chest").y1).toBe(right.y0);                    // the lift-lid chest at its foot
    expect(CATALOG.platform_bed.boxes.every((b) => b[2] + b[5] <= 2.1)).toBe(true);   // no headboard
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

describe("wall pieces dragged about", () => {
  test("go to the nearest wall they can hang on, centred on the pointer", () => {
    const picture = { kind: "picture", color: "sun", side: "w", line: 0, at: 14 };
    expect(wallSpotNear("bedB", picture, 6, 12.3)).toEqual({ ...picture, side: "n", line: 12, at: 5 });
    // A window only goes on an outside wall: by the back wall (Bedroom 1 behind) it finds the left.
    const window = { kind: "basement_window", color: "white", side: "s", line: 25, at: 0.5 };
    expect(wallSpotNear("bedB", window, 1, 12.4).side).toBe("w");
    // Never inside the closet.
    expect(wallSpotNear("bedB", picture, 6.5, 24.8).inside).toBeUndefined();
    expect(layoutProblem("bedB", withItems([wallSpotNear("bedB", picture, 6.5, 24.8)]))).toBe(null);
  });
});

describe("the real flat, from its photos", () => {
  test("the kitchen is an L in the back left corner: stove and fridge on one wall, sink under a window and the dishwasher on the other", () => {
    const items = DEFAULT_LAYOUTS.main.items;
    const at = (kind) => footprint(items.find((i) => i.kind === kind));
    for (const kind of ["stove", "fridge"]) expect(at(kind).x0, kind).toBe(13);          // the left wall
    for (const kind of ["sink_counter", "dishwasher", "base_cabinet"]) expect(at(kind).y0, kind).toBe(0);   // the back wall
    const sink = at("sink_counter");
    const window = items.find((i) => i.kind === "basement_window" && i.side === "n");
    expect(window.at >= sink.x0 && window.at + CATALOG.basement_window.w <= sink.x1).toBe(true);
  });

  test("the posts across the living room: nothing stands on them, pets go round", () => {
    const post = ROOMS.main.posts[0];
    const l = DEFAULT_LAYOUTS.main;
    expect(layoutProblem("main", { ...l, items: [...l.items, { kind: "beanbag", color: "teal", x: post.x - 1, y: post.y - 1, rot: 0 }] })).toMatch(/post/);
    expect(layoutProblem("main", { ...l, items: [...l.items, { kind: "small_rug", color: "pink", x: post.x - 2, y: post.y - 1, rot: 0 }] })).toBe(null);   // a rug can go under
  });

  test("the front door is in an outside wall and kept clear; Bedroom 1's door is just past the fridge", () => {
    const door = DEFAULT_LAYOUTS.main.items.find((i) => i.kind === "entry_door");
    expect(wallsOf("main").find((w) => w.side === door.side && w.line === door.line && w.from <= door.at).outer).toBe(true);
    const fridge = footprint(DEFAULT_LAYOUTS.main.items.find((i) => i.kind === "fridge"));
    const bedA = DOORS.find((d) => d.rooms.includes("bedA"));
    expect(bedA.from).toBeGreaterThanOrEqual(fridge.y1);
    expect(bedA.from - fridge.y1).toBeLessThan(1);
  });

  test("the bathroom has the laundry: washer and dryer, vanity, toilet, the tub with its shower", () => {
    for (const kind of ["washer", "dryer", "vanity", "toilet", "tub_shower"]) expect(DEFAULT_LAYOUTS.bath.items.some((i) => i.kind === kind), kind).toBe(true);
  });
});
