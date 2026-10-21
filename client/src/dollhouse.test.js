import { describe, expect, test } from "vitest";
import { CUTAWAY, HD, colorOf, dollCamera, hdCamera, order, pieceBox, wallPieceBox } from "./dollhouse.js";
import { CATALOG, boxesOf } from "@shared/home.js";

describe("the dollhouse's drawing order", () => {
  const window = { kind: "window", color: "white", side: "n", line: 0, at: 4.5 };
  const dresser = { kind: "dresser", color: "white", x: 4, y: 0, rot: 0 };
  const cam = dollCamera(null, 0);

  test("a window is drawn behind the furniture standing against its wall", () => {
    // Its sill reaches into the room: by its own box it tied with the dresser and went over it.
    const units = [{ name: "window", box: wallPieceBox(window) }, { name: "dresser", box: pieceBox(dresser) }];
    expect(order(units, cam, (u) => u.box).map((u) => u.name)).toEqual(["window", "dresser"]);
    expect(order([...units].reverse(), cam, (u) => u.box).map((u) => u.name)).toEqual(["window", "dresser"]);
  });

  test("a pet in front of the dresser is drawn after it, one behind the bed before it", () => {
    const pet = (x, y) => ({ name: "pet", box: { x0: x - 0.4, x1: x + 0.4, y0: y - 0.4, y1: y + 0.4, z0: 0, z1: 2.5 } });
    const bed = { name: "bed", box: pieceBox({ kind: "bed", color: "blue", x: 0.5, y: 3, rot: 0 }) };
    expect(order([pet(5, 3), { name: "dresser", box: pieceBox(dresser) }], cam, (u) => u.box).map((u) => u.name)).toEqual(["dresser", "pet"]);
    expect(order([bed, pet(2, 2)], cam, (u) => u.box).map((u) => u.name)).toEqual(["pet", "bed"]);
  });
});

describe("an L-desk, its arms in order on their own", () => {
  test("the chair in its crook goes in front of the arm behind it and behind the arm in front", () => {
    const desk = { kind: "l_desk", color: "black", x: 0, y: 12, rot: 0 };
    const chair = { name: "chair", box: pieceBox({ kind: "chair", color: "white", x: 2.5, y: 13.75, rot: 2 }) };
    const arms = [{ name: "back arm", box: pieceBox(desk, 0) }, { name: "left arm", box: pieceBox(desk, 1) }];
    const names = (rot) => order([chair, ...arms], dollCamera("bedB", rot), (u) => u.box).map((u) => u.name);
    // Seen from the front, the arm along the back wall is behind the chair.
    expect(names(0).indexOf("back arm")).toBeLessThan(names(0).indexOf("chair"));
    // Seen from the right (from the door's side), the arm along the left wall is behind it too;
    // seen from the left, that arm is in front of it.
    const sides = [1, 3].map((rot) => names(rot).indexOf("left arm") < names(rot).indexOf("chair"));
    expect(sides.sort()).toEqual([false, true]);
  });
});

describe("pieces drawn sharp", () => {
  test("the sharp camera sees the same at twice the pixels", () => {
    const cam = dollCamera("bedB", 1);
    expect(hdCamera(cam).project(3, 14, 2)).toEqual(cam.project(3, 14, 2).map((a) => a * HD));
    expect(hdCamera(cam).key).not.toBe(cam.key);
  });

  test("the iMac G3 and the Kuromi poster have sharp versions, in half pixels, filling the same space", () => {
    for (const [kind, item] of [["imac_g3", { kind: "imac_g3", color: "white", x: 4.75, y: 12, rot: 0 }],
      ["kuromi_poster", { kind: "kuromi_poster", color: "lilac", side: "e", line: 13, at: 19.25 }]]) {
      expect(CATALOG[kind].hd, kind).toBeTruthy();
      // Half-pixel boxes (1/32 ft) in the sharp one, none in the other.
      const half = (bs) => bs.some((b) => [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0].some((t) => Math.abs(t - 1 / 32) < 1e-6));
      expect(half(boxesOf(item, true)), kind).toBe(true);
      expect(half(boxesOf(item)), kind).toBe(false);
      const span = (bs) => [Math.min(...bs.map((b) => b.z0)), Math.max(...bs.map((b) => b.z1))];
      const [lo, hi] = [span(boxesOf(item)), span(boxesOf(item, true))];
      expect(Math.abs(lo[0] - hi[0]) + Math.abs(lo[1] - hi[1]), kind).toBeLessThan(0.15);
    }
    // Everything else draws as it always did.
    expect(boxesOf({ kind: "bed", color: "blue", x: 0, y: 0, rot: 0 }, true)).toEqual(boxesOf({ kind: "bed", color: "blue", x: 0, y: 0, rot: 0 }));
  });
});

describe("bedding", () => {
  test("the kitty bed has pink pillowcases with white faces; other beds white pillows", () => {
    expect(colorOf("pillow", { color: "kitty" })).toEqual([0xf3, 0xc6, 0xd6]);
    expect(colorOf("pillowPrint", { color: "kitty" })).toEqual([255, 255, 255]);
    expect(colorOf("pillow", { color: "blue" })).toEqual(colorOf("pillowPrint", { color: "blue" }));
  });
});

describe("the cutaway", () => {
  test("tall furniture is cut off where the walls are, so it doesn't stand up over what's behind it", () => {
    expect(pieceBox({ kind: "wardrobe", color: "white", x: 0, y: 0, rot: 0 }).z1).toBe(CUTAWAY);
    expect(pieceBox({ kind: "closet", color: "white", x: 0, y: 15.25, rot: 3 }).z1).toBe(4);            // built in: cut with the walls
    expect(pieceBox({ kind: "dresser", color: "white", x: 0, y: 0, rot: 0 }).z1).toBeLessThan(CUTAWAY);   // short things whole
  });
});
