import { describe, expect, test } from "vitest";
import { dollCamera, order, pieceBox, wallPieceBox } from "./dollhouse.js";

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
