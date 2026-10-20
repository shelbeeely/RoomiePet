import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  DOORS, FURNITURE, H, ROOMS, W, bathSpot, bedSpot, bowlSpot, destination, roomAt, roomPath, route, wanderSpot,
} from "./house.js";

const atlas = JSON.parse(readFileSync(new URL("../public/sprites/sheet.json", import.meta.url)));
const inside = (p, f) => p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1;

describe("the house", () => {
  test("rooms fit the house and every free area is on its room's floor", () => {
    for (const [id, r] of Object.entries(ROOMS)) {
      expect(r.floor.x1 <= W && r.floor.y1 <= H, id).toBe(true);
      for (const a of r.free) expect(inside({ x: a.x0, y: a.y0 }, r.floor) && inside({ x: a.x1, y: a.y1 }, r.floor), id).toBe(true);
    }
  });

  test("every room reaches every other, through doors whose sides are in their rooms", () => {
    for (const d of DOORS) for (const r of d.rooms) expect(roomAt(d.at[r].x, d.at[r].y), JSON.stringify(d.at[r])).toBe(r);
    const ids = Object.keys(ROOMS);
    for (const a of ids) for (const b of ids) expect(roomPath(a, b).at(-1)).toBe(b);
    expect(roomPath("bedA", "bath")).toEqual(["bedA", "living", "bath"]);
  });

  test("a route goes door by door and ends at the spot", () => {
    const r = route("bedB", { room: "bath", x: 200, y: 200 });
    expect(r.map((p) => p.room)).toEqual(["bedB", "living", "living", "bath", "bath"]);
    expect(r.at(-1)).toEqual({ room: "bath", x: 200, y: 200 });
    expect(route("living", { room: "living", x: 100, y: 200 })).toHaveLength(1);
  });

  test("every piece of furniture is in the art", () => {
    for (const f of FURNITURE) {
      for (const frame of [f.frame, f.night, f.day].filter(Boolean)) expect(atlas.frames[frame], frame).toBeTruthy();
    }
    for (const r of Object.values(ROOMS)) {
      const [sprite, frame = "paper"] = r.paper.split("/");
      expect(atlas.frames[`${sprite}/${frame}`], r.paper).toBeTruthy();
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
