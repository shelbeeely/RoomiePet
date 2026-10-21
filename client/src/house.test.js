import { describe, expect, test } from "vitest";
import { CATALOG, DEFAULT_LAYOUTS, footprint, roomAt } from "@shared/home.js";
import { allLayouts, bedSpot, bedroomOf, bowlSpot, destination, findPath, free, gridOf, sleepSpots, wanderSpot } from "./house.js";

const layouts = allLayouts({});
const grid = gridOf(layouts);
const solid = (room) => layouts[room].items.filter((i) => CATALOG[i.kind].layer === "solid").map(footprint);
const inside = (p, f) => p.x > f.x0 && p.x < f.x1 && p.y > f.y0 && p.y < f.y1;

/** Every bit of the way, in steps small enough to catch going through a wall. */
function walk(path, from) {
  const out = [];
  let a = from;
  for (const b of path) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1);
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    a = b;
  }
  return out;
}

describe("getting about", () => {
  test("from the bottom bedroom to the bathroom: through the doors, round the furniture", () => {
    const from = { x: 6, y: 20 };
    const to = { x: 25, y: 5 };
    const path = findPath(grid, from, to);
    const steps = walk(path, from);
    const rooms = [...new Set(steps.map((p) => roomAt(p.x, p.y)))];
    expect(rooms).toEqual(["bedB", "main", "bath"]);
    const furniture = Object.keys(layouts).flatMap(solid);
    for (const p of steps.slice(0, -4)) expect(furniture.some((f) => inside(p, f)), JSON.stringify(p)).toBe(false);
    // Crossing from room to room only where there's a door.
    for (let k = 1; k < steps.length; k++) {
      const [a, b] = [steps[k - 1], steps[k]];
      if (roomAt(a.x, a.y) === roomAt(b.x, b.y)) continue;
      const atDoor = (b.y > 14 && b.y < 17 && Math.abs(b.x - 13) < 0.3) || (b.x > 22 && b.x < 25 && Math.abs(b.y - 9) < 0.3);
      expect(atDoor, JSON.stringify([a, b])).toBe(true);
    }
  });

  test("wandering only picks free floor", () => {
    for (let k = 0; k < 50; k++) {
      const s = wanderSpot(grid, "bedB", Math.random);
      expect(roomAt(s.x, s.y)).toBe("bedB");
      expect(free(grid, Math.floor(s.x / 0.5), Math.floor(s.y / 0.5))).toBe(true);
    }
  });
});

describe("the L-desk", () => {
  test("a pet can go into the crook of the L, but not under either arm", () => {
    const desk = DEFAULT_LAYOUTS.bedB.items.find((i) => i.kind === "l_desk");
    const g = gridOf(allLayouts({ bedB: { ...DEFAULT_LAYOUTS.bedB, items: [desk] } }));
    const cell = (x, y) => free(g, Math.floor(x / 0.5), Math.floor(y / 0.5));
    expect(cell(desk.x + 3, desk.y + 2.5)).toBe(true);     // the crook
    expect(cell(desk.x + 3, desk.y + 1)).toBe(false);      // the arm along the back wall
    expect(cell(desk.x + 1, desk.y + 2.5)).toBe(false);    // the arm along the left wall
  });
});

describe("where pets go", () => {
  const cond = (state, flags = {}) => ({ state, flags });

  test("asleep: their own bedroom, the pet bed first, then the bed", () => {
    expect(bedroomOf(0)).toBe("bedA");
    expect(bedroomOf(1)).toBe("bedB");
    // Bedroom 2 has no pet bed: they sleep on the beds. Give it one and they curl up there first.
    expect(layouts.bedB.items.some((i) => CATALOG[i.kind].pets)).toBe(false);
    expect(sleepSpots(layouts, "bedB").every((s) => s.z > 1)).toBe(true);
    const bedB = { ...DEFAULT_LAYOUTS.bedB, items: [...DEFAULT_LAYOUTS.bedB.items, { kind: "kuromi_bed", color: "black", x: 5, y: 16.5, rot: 0 }] };
    const withPetBed = allLayouts({ bedB });
    const spots = sleepSpots(withPetBed, "bedB");
    expect(spots[0].z).toBeLessThan(1);         // in the pet bed, on the floor
    expect(spots[1].z).toBeGreaterThan(1);      // then up on the bed
    expect(bedSpot(withPetBed, gridOf(withPetBed), 1)).toEqual(spots[0]);
    expect(bedSpot(withPetBed, gridOf(withPetBed), 3)).toEqual(spots[1]);
    expect(destination(layouts, grid, cond("asleep"), null, 2).room).toBe("bedA");
  });

  test("fed: to the bowl, wherever someone put it", () => {
    const at = bowlSpot(layouts, grid, 0);
    expect(at.room).toBe("main");
    const moved = allLayouts({
      bedA: { ...DEFAULT_LAYOUTS.bedA, items: [...DEFAULT_LAYOUTS.bedA.items, { kind: "bowl", color: "sun", x: 6, y: 9, rot: 0 }] },
      main: { ...DEFAULT_LAYOUTS.main, items: DEFAULT_LAYOUTS.main.items.filter((i) => i.kind !== "bowl") },
    });
    const there = destination(moved, gridOf(moved), cond("ok"), "eat", 0);
    expect(there.room).toBe("bedA");
    expect(Math.hypot(there.x - 6.5, there.y - 9.5)).toBeLessThan(3);
  });

  test("cleaned: to the bathroom; eggs stay put", () => {
    expect(destination(layouts, grid, cond("ok"), "clean", 0).room).toBe("bath");
    expect(destination(layouts, grid, cond("egg"), null, 0)).toBe(null);
  });
});

describe("the closet's doors", () => {
  const inCloset = { x: 6.5, y: 23.75 };

  test("shut, the closet is wall: no pet can get in", () => {
    const g = gridOf(allLayouts({}));
    expect(free(g, Math.floor(inCloset.x / 0.5), Math.floor(inCloset.y / 0.5))).toBe(false);
  });

  test("open, a pet can go in to hide -- through the doors, never through its side walls", () => {
    const g = gridOf(allLayouts({}), ["bedB:closet"]);
    const from = { x: 6, y: 15 };
    const steps = walk(findPath(g, from, inCloset), from);
    const last = steps[steps.length - 1];
    expect(Math.hypot(last.x - inCloset.x, last.y - inCloset.y)).toBeLessThan(0.1);
    for (let k = 1; k < steps.length; k++) {
      const [a, b] = [steps[k - 1], steps[k]];
      const inside = (p) => p.x > 3.25 && p.x < 9.75 && p.y > 22.5;
      if (inside(a) !== inside(b)) expect(Math.abs(b.y - 22.5) < 0.3 && b.x > 3.25 && b.x < 9.75, JSON.stringify([a, b])).toBe(true);
    }
    // And now and then a pet in Bedroom 2 heads in there of its own accord.
    let hid = 0;
    for (let k = 0; k < 200; k++) {
      const d = destination(allLayouts({}), g, { state: "ok", flags: {} }, null, 1, Math.random);
      if (d.room === "bedB" && d.y > 22.5 && d.x > 3.25 && d.x < 9.75) hid += 1;
    }
    expect(hid).toBeGreaterThan(0);
  });
});
