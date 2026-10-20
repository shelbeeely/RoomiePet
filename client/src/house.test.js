import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  DOORS, FURNITURE, H, ROOMS, W, bathSpot, bedSpot, bowlSpot, destination, roomAt, roomPath, route, wanderSpot,
} from "./house.js";

const atlas = JSON.parse(readFileSync(new URL("../public/sprites/sheet.json", import.meta.url)));
const inside = (p, f) => p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1;

describe("the house", () => {
  test("rooms fit the apartment and every free spot is on its room's floor", () => {
    for (const [id, r] of Object.entries(ROOMS)) {
      for (const a of r.areas) expect(a.x1 <= W && a.y1 <= H, id).toBe(true);
      for (const a of r.free) {
        for (const corner of [{ x: a.x0, y: a.y0 }, { x: a.x1, y: a.y1 }, { x: a.x0, y: a.y1 }, { x: a.x1, y: a.y0 }]) {
          expect(roomAt(corner.x, corner.y), `${id} ${JSON.stringify(corner)}`).toBe(id);
        }
      }
    }
  });

  test("the layout: bedrooms on the left open onto the main area; the bathroom is the back right corner", () => {
    const right = (id) => Math.max(...ROOMS[id].areas.map((a) => a.x1));
    const left = (id) => Math.min(...ROOMS[id].areas.map((a) => a.x0));
    expect(right("bedA")).toBeLessThanOrEqual(left("main"));
    expect(right("bedB")).toBeLessThanOrEqual(left("main"));
    expect(right("bath")).toBe(W);
    expect(Math.min(...ROOMS.bath.areas.map((a) => a.y0))).toBe(0);
    expect(roomPath("bedA", "main")).toEqual(["bedA", "main"]);
    expect(roomPath("bedB", "main")).toEqual(["bedB", "main"]);
    // About 750 sq ft at 16 px to the foot.
    expect((W / 16) * (H / 16)).toBe(750);
  });

  test("every room reaches every other, through doors whose sides are in their rooms", () => {
    for (const d of DOORS) for (const r of d.rooms) expect(roomAt(d.at[r].x, d.at[r].y), JSON.stringify(d.at[r])).toBe(r);
    const ids = Object.keys(ROOMS);
    for (const a of ids) for (const b of ids) expect(roomPath(a, b).at(-1)).toBe(b);
    expect(roomPath("bedA", "bath")).toEqual(["bedA", "main", "bath"]);
  });

  test("a route goes door by door and ends at the spot", () => {
    const r = route("bedB", { room: "bath", x: 380, y: 130 });
    expect(r.map((p) => p.room)).toEqual(["bedB", "main", "main", "bath", "bath"]);
    expect(r.at(-1)).toEqual({ room: "bath", x: 380, y: 130 });
    expect(route("main", { room: "main", x: 250, y: 300 })).toHaveLength(1);
  });

  test("every piece of furniture is in the art", () => {
    for (const f of FURNITURE) {
      for (const frame of [f.frame, f.night, f.day].filter(Boolean)) expect(atlas.frames[frame], frame).toBeTruthy();
    }
    for (const r of Object.values(ROOMS)) {
      const [sprite, frame = "paper"] = r.paper.split("/");
      expect(atlas.frames[`${sprite}/${frame}`], r.paper).toBeTruthy();
      expect(atlas.frames[r.floor], r.floor).toBeTruthy();
    }
    for (const name of ["bowl/empty", "bowl/full", "door/main", "crown/crown", "tile/check", "wall@butter/base"]) {
      expect(atlas.frames[name], name).toBeTruthy();
    }
    for (const [key, f] of Object.entries(atlas.frames)) {
      if (/^(cat|bunny|chick|lop|raccoon|ferret|possum|stitched)(@|\/)/.test(key)) expect([f.frame.w, f.frame.h], key).toEqual([64, 64]);
    }
  });

  test("where pets go: bed when asleep, bowl after a kitchen chore, bath after cleaning, their room when sad", () => {
    const ok = { state: "ok", flags: {} };
    expect(destination({ ...ok, state: "asleep" }, null, 0)).toEqual(bedSpot(0));
    expect(bedSpot(0).room).toBe("bedA");
    expect(bedSpot(1).room).toBe("bedB");
    expect(roomAt(bedSpot(3).x, bedSpot(3).y)).toBe("bedB");
    expect(destination(ok, "eat", 2)).toEqual(bowlSpot(2));
    expect(destination(ok, "clean", 1)).toEqual(bathSpot(1));
    expect(destination({ ...ok, state: "egg" }, "eat", 0)).toBeNull();
    for (let i = 0; i < 20; i++) expect(destination({ state: "sad", flags: {} }, null, 1).room).toBe("bedB");
    for (const room of Object.keys(ROOMS)) {
      const s = wanderSpot(room);
      expect(roomAt(s.x, s.y)).toBe(room);
    }
  });
});
