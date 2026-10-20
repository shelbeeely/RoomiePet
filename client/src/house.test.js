import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { CATALOG, DEFAULT_LAYOUTS, footprint, roomAt } from "@shared/home.js";
import { SPECIES } from "@shared/pet.js";
import { allLayouts, bedSpot, bedroomOf, bowlSpot, destination, findPath, free, gridOf, sleepSpots, wanderSpot } from "./house.js";
import { petKey } from "./sprites.js";

const atlas = JSON.parse(readFileSync(new URL("../public/sprites/sheet.json", import.meta.url)));
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
      const atDoor = (b.y > 20 && b.y < 23 && Math.abs(b.x - 11) < 0.3) || (b.x > 22 && b.x < 25 && Math.abs(b.y - 9) < 0.3);
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

describe("where pets go", () => {
  const cond = (state, flags = {}) => ({ state, flags });

  test("asleep: their own bedroom, the pet bed first, then the bed", () => {
    expect(bedroomOf(0)).toBe("bedA");
    expect(bedroomOf(1)).toBe("bedB");
    const spots = sleepSpots(layouts, "bedB");
    expect(spots[0].z).toBeLessThan(1);         // in the pet bed, on the floor
    expect(spots[1].z).toBeGreaterThan(1);      // then up on the bed
    expect(bedSpot(layouts, grid, 1)).toEqual(spots[0]);
    expect(bedSpot(layouts, grid, 3)).toEqual(spots[1]);
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

test("every pet has its back view, for walking away", () => {
  for (const [species, s] of Object.entries(SPECIES)) {
    for (const color of s.colors) {
      for (const anim of ["idle_back", "walk_back"]) expect(atlas.animations[`${petKey(species, color)}/${anim}`], `${species} ${color} ${anim}`).toBeTruthy();
    }
  }
});
