// The apartment as a model the server and every phone share: about 750 sq ft
// (30 x 25 ft), measured in feet. Left to right: the two bedrooms, one behind
// the other, each opening onto the main area -- kitchen along its back wall,
// living room in front -- and the bathroom with the laundry in the back right
// corner. Rooms are unions of rectangles; walls run along their edges, with
// gaps for the doors. What stands in a room is its layout: a wallpaper, a
// floor and pieces from the catalog, which roommates rearrange in the room
// builder. The server keeps each household's layouts and checks them here,
// so a phone can't save a bed through a wall or across a doorway.

export const FLAT = { w: 30, d: 25 };

export const ROOMS = {
  // The real flat (from the listing's photos): a basement, the two bedrooms on the left, each
  // opening onto the open kitchen and living room, the bathroom with the laundry in the back
  // right corner. Bedrooms 13 ft wide: Bedroom 2 13 x 13, as deep as its left wall's L-desk,
  // dresser and Twin XL need end to end (from the sketch of it), Bedroom 1 13 x 12.
  // Bedroom 1: its reach-in closet, two sliding doors, stands in the front right corner.
  bedA: {
    label: "Bedroom 1",
    areas: [{ x0: 0, x1: 13, y0: 0, y1: 10 }, { x0: 0, x1: 8, y0: 10, y1: 12 }],
    builtins: [{ kind: "closet", style: "sliding", x0: 8, x1: 13, y0: 10, y1: 12, doors: "n", clear: 1 }],
  },
  // Bedroom 2's closet is part of its walls: the room steps round it, walls along both its
  // sides and across its front, where its two full-size doors are (facing into the room).
  // It fills the front wall between the beds and stands 2 ft 6 into the room.
  bedB: {
    label: "Bedroom 2",
    areas: [{ x0: 0, x1: 13, y0: 12, y1: 22.5 }, { x0: 0, x1: 3.25, y0: 22.5, y1: 25 }, { x0: 9.75, x1: 13, y0: 22.5, y1: 25 }],
    builtins: [{ kind: "closet", style: "boards", x0: 3.25, x1: 9.75, y0: 22.5, y1: 25, doors: "n", clear: 3 }],
  },
  // The open kitchen and living room: an L of kitchen in the back left corner, white posts
  // holding the beam in a row across the middle, a louvered bifold closet in the front wall.
  main: {
    label: "Kitchen & living room",
    areas: [
      { x0: 13, x1: 21, y0: 0, y1: 23 }, { x0: 13, x1: 14, y0: 23, y1: 25 }, { x0: 19, x1: 21, y0: 23, y1: 25 },
      { x0: 21, x1: 30, y0: 9, y1: 25 },
    ],
    builtins: [{ kind: "closet", style: "louvered", x0: 14, x1: 19, y0: 23, y1: 25, doors: "n", clear: 2 }],
    posts: [{ x: 15.75, y: 11 }, { x: 20.75, y: 11 }, { x: 25.75, y: 11 }],
  },
  bath: { label: "Bathroom & laundry", areas: [{ x0: 21, x1: 30, y0: 0, y1: 9 }] },
};

/** A post's footprint: 6 inches square. */
export const postBox = (p) => ({ x0: p.x - 0.25, x1: p.x + 0.25, y0: p.y - 0.25, y1: p.y + 0.25 });

// A door is a gap in the wall on a line: x = at (axis "x") or y = at (axis "y"), from..to along it.
export const DOORS = [
  { rooms: ["bedA", "main"], axis: "x", at: 13, from: 7, to: 10 },   // just past the fridge
  // Bedroom 2's: on its right wall, 2 ft from the top (back) corner, as the real one is.
  { rooms: ["bedB", "main"], axis: "x", at: 13, from: 14, to: 17 },
  { rooms: ["bath", "main"], axis: "y", at: 9, from: 22, to: 25 },
];

const EPS = 1e-9;

export function roomAt(x, y) {
  for (const [id, r] of Object.entries(ROOMS)) {
    if (r.areas.some((a) => x >= a.x0 && x < a.x1 && y >= a.y0 && y < a.y1)) return id;
  }
  return null;
}

export function bounds(room) {
  const as = ROOMS[room].areas;
  return {
    x0: Math.min(...as.map((a) => a.x0)), x1: Math.max(...as.map((a) => a.x1)),
    y0: Math.min(...as.map((a) => a.y0)), y1: Math.max(...as.map((a) => a.y1)),
  };
}

export function doorAt(axis, line, along) {
  return DOORS.find((d) => d.axis === axis && d.at === line && along >= d.from - EPS && along <= d.to + EPS) || null;
}

/**
 * A room's walls: straight runs along its edges, split by doors. side is which
 * edge of the room the wall is (n is its back, as the flat is drawn); line is
 * the x or y it runs along, from..to the span; outer when nothing is on the
 * other side.
 */
export function wallsOf(room) {
  if (!wallCache.has(room)) wallCache.set(room, Object.freeze(findWalls(room).map(Object.freeze)));
  return wallCache.get(room);
}
const wallCache = new Map();

function findWalls(room) {
  // Walked a quarter foot at a time: a room's outline can step round a built-in closet at
  // 3.25 ft. Edges with nothing beyond are outer -- unless what is beyond is a built-in,
  // which is the room's own wall, not outdoors.
  const b = bounds(room);
  const runs = [];
  const add = (side, line, along, outer, builtin, inside = false) => {
    const last = runs[runs.length - 1];
    if (last && last.side === side && last.line === line && Math.abs(last.to - along) < EPS && last.outer === outer
      && (last.builtin || null) === builtin && !!last.inside === inside) last.to = along + GRID;
    else runs.push({ side, line, from: along, to: along + GRID, outer, ...(builtin ? { builtin } : {}), ...(inside ? { inside } : {}) });
  };
  const nx = Math.round((b.x1 - b.x0) / GRID);
  const ny = Math.round((b.y1 - b.y0) / GRID);
  const at = (k, origin) => origin + k * GRID;
  const sides = [["n", 0, -1, "y"], ["s", 0, 1, "y"], ["w", -1, 0, "x"], ["e", 1, 0, "x"]];
  for (const [side, dx, dy, axis] of sides) {
    // Walk the lines in order so each run is contiguous.
    const outerN = axis === "y" ? ny : nx;
    const innerN = axis === "y" ? nx : ny;
    for (let p = 0; p < outerN; p++) {
      for (let q = 0; q < innerN; q++) {
        const x = axis === "y" ? at(q, b.x0) : at(p, b.x0);
        const y = axis === "y" ? at(p, b.y0) : at(q, b.y0);
        const cx = x + GRID / 2;
        const cy = y + GRID / 2;
        if (roomAt(cx, cy) !== room) continue;
        const ox = cx + dx * GRID;
        const oy = cy + dy * GRID;
        const other = roomAt(ox, oy);
        const line = axis === "y" ? (dy < 0 ? y : y + GRID) : (dx < 0 ? x : x + GRID);
        const along = axis === "y" ? x : y;
        if (other === room || doorAt(axis, line, along + GRID / 2)) continue;
        // Beyond is a built-in: this room's own (its closet's walls), or the next room's (a
        // plain wall between, Bedroom 1's closet behind Bedroom 2's back wall).
        const inBuiltin = builtinAt(ox, oy);
        const own = inBuiltin && (ROOMS[room].builtins || []).includes(inBuiltin);
        add(side, line, along, other === null && !inBuiltin, own ? inBuiltin.kind : null);
      }
    }
  }
  // A built-in's own outside walls (the back of Bedroom 2's closet is the flat's outside wall).
  for (const bi of ROOMS[room].builtins || []) {
    for (const [side, dx, dy, axis] of sides) {
      const outerN = Math.round((axis === "y" ? bi.y1 - bi.y0 : bi.x1 - bi.x0) / GRID);
      const innerN = Math.round((axis === "y" ? bi.x1 - bi.x0 : bi.y1 - bi.y0) / GRID);
      for (let p = 0; p < outerN; p++) {
        for (let q = 0; q < innerN; q++) {
          const x = axis === "y" ? at(q, bi.x0) : at(p, bi.x0);
          const y = axis === "y" ? at(p, bi.y0) : at(q, bi.y0);
          const ox = x + GRID / 2 + dx * GRID;
          const oy = y + GRID / 2 + dy * GRID;
          if (builtinAt(ox, oy) || roomAt(ox, oy)) continue;
          const line = axis === "y" ? (dy < 0 ? y : y + GRID) : (dx < 0 ? x : x + GRID);
          add(side, line, axis === "y" ? x : y, true, bi.kind, true);
        }
      }
    }
  }
  return runs;
}

/** A built-in (Bedroom 2's closet) at a point, if any: part of a room's walls, not its floor. */
export function builtinAt(x, y) {
  for (const r of Object.values(ROOMS)) {
    for (const bi of r.builtins || []) if (x >= bi.x0 && x < bi.x1 && y >= bi.y0 && y < bi.y1) return bi;
  }
  return null;
}

// -- the catalog -------------------------------------------------------------------------

// Colours a piece can come in, and the fixed materials models are made of.
export const COLORWAYS = {
  blue: "#7fa8d8", pink: "#e7a1b6", sage: "#a8c99a", sun: "#f0c75e", lilac: "#c3b3e0", coral: "#ee8f6f",
  teal: "#5fb3b3", grey: "#a7a7b8", oak: "#c08a5c", walnut: "#7a553c", white: "#efeae2", black: "#55506a",
};

export const MATERIALS = {
  wood: "#b07a4a", woodDark: "#7a4f2e", white: "#f4efe6", cream: "#efe2c8", metal: "#b8c0cc", dark: "#3b3049",
  glass: "#9fd3ef", leaf: "#5fae5a", leafDark: "#3f8a4a", pot: "#c8643c", screen: "#33406a", pillow: "#fffaf0",
  porcelain: "#f7f7fa", water: "#8fd0ef", shade: "#ffe6a8", gold: "#e9b64a", red: "#e05d5d", food: "#c08a50",
  book1: "#d8645a", book2: "#5a8ad8", book3: "#f0c75e", book4: "#6fbf8a", frame: "#7a4f2e", sky: "#bfe3f5", pink: "#f4a6b8",
  granite: "#cfc9bf", graniteDark: "#a39d94", hob: "#2f2b36", led: "#4f6bff",
};

// Boxes: [x, y, z, w, d, h, material], in feet, x across the piece and y from its back (y = 0)
// to its front, at rotation 0 -- the front facing the room's front, as the flat is drawn.
// "main" is the colour chosen; "main^" a little lighter, "main_" a little darker.
// layer: solid pieces block the way and can't overlap; rugs lie under everything; small things
// (the bowl) don't block the way but can't sit on furniture. bed and pets mark where pets sleep.
// clear keeps that much floor free in front of a piece's doors. Wall pieces hang on a wall: w along
// it, z up it, d out from it. spots are where pets curl up on a piece: [x, y, z].
const legs = (w, d, h, inset = 0.1, s = 0.25, mat = "wood") => [
  [inset, inset, 0, s, s, h, mat], [w - inset - s, inset, 0, s, s, h, mat],
  [inset, d - inset - s, 0, s, s, h, mat], [w - inset - s, d - inset - s, 0, s, s, h, mat],
];

export const CATALOG = {
  bed: {
    label: "Bed", group: "bedroom", w: 3.5, d: 6.5, layer: "solid", colors: ["blue", "pink", "sage", "lilac", "sun", "grey"],
    boxes: [
      [0, 0, 0, 3.5, 0.3, 2.8, "wood"], [0, 0.3, 0, 3.5, 6.2, 1.1, "wood"],
      [0.1, 0.3, 1.1, 3.3, 1.9, 0.6, "white"], [0.5, 0.45, 1.7, 2.5, 1.0, 0.35, "pillow"],
      [0.05, 2.2, 1.1, 3.4, 4.25, 0.7, "main"], [0.05, 2.2, 1.8, 3.4, 0.45, 0.08, "main^"],
    ],
    spots: [[1.2, 4.2, 1.8], [2.4, 4.8, 1.8], [1.75, 3.2, 1.8]],
    bed: true,
  },
  twin_xl: {
    // A college-length twin, 80 in: the one on the left in Bedroom 2.
    label: "Twin XL bed", group: "bedroom", w: 3.5, d: 6.5, layer: "solid", colors: ["sage", "blue", "pink", "lilac", "sun"],
    boxes: [
      [0, 0, 0, 3.5, 0.3, 2.8, "wood"], [0, 0.3, 0, 3.5, 6.2, 1.1, "wood"],
      [0.1, 0.3, 1.1, 3.3, 1.9, 0.6, "white"], [0.5, 0.45, 1.7, 2.5, 1.0, 0.35, "pillow"],
      [0.05, 2.2, 1.1, 3.4, 4.25, 0.7, "main"], [0.05, 2.2, 1.8, 3.4, 0.45, 0.08, "main^"],
    ],
    spots: [[1.2, 4.2, 1.8], [2.4, 4.8, 1.8], [1.75, 3.2, 1.8]],
    bed: true,
  },
  double_bed: {
    label: "Double bed", group: "bedroom", w: 5, d: 6.5, layer: "solid", colors: ["sage", "blue", "pink", "lilac", "sun"],
    boxes: [
      [0, 0, 0, 5, 0.3, 3, "wood"], [0, 0.3, 0, 5, 6.2, 1.1, "wood"],
      [0.1, 0.3, 1.1, 4.8, 1.9, 0.6, "white"], [0.35, 0.45, 1.7, 2, 1.0, 0.35, "pillow"], [2.65, 0.45, 1.7, 2, 1.0, 0.35, "pillow"],
      [0.05, 2.2, 1.1, 4.9, 4.25, 0.7, "main"], [0.05, 2.2, 1.8, 4.9, 0.45, 0.08, "main^"],
    ],
    spots: [[1.5, 4.2, 1.8], [3.5, 4.4, 1.8], [2.5, 5.4, 1.8], [1.5, 5.6, 1.8]],
    bed: true,
  },
  nightstand: {
    label: "Nightstand", group: "bedroom", w: 1.5, d: 1.5, layer: "solid", colors: ["oak", "white", "walnut", "pink"],
    boxes: [
      [0, 0, 0, 1.5, 1.5, 1.8, "main"], [0, 0, 1.8, 1.5, 1.5, 0.15, "main_"], [0.25, 1.5, 0.9, 1, 0.04, 0.5, "main_"],
      [0.55, 0.5, 1.95, 0.4, 0.4, 0.5, "dark"], [0.3, 0.25, 2.45, 0.9, 0.9, 0.6, "shade"],
    ],
    glow: [0.75, 0.75, 2.7],
  },
  dresser: {
    label: "Dresser", group: "bedroom", w: 3, d: 1.5, layer: "solid", colors: ["white", "oak", "walnut", "lilac"],
    boxes: [
      [0, 0, 0, 3, 1.5, 2.8, "main"], [0, 0, 2.8, 3, 1.5, 0.15, "main_"],
      [0.2, 1.5, 0.3, 2.6, 0.04, 0.6, "main_"], [0.2, 1.5, 1.1, 2.6, 0.04, 0.6, "main_"], [0.2, 1.5, 1.9, 2.6, 0.04, 0.6, "main_"],
      [2.2, 0.4, 2.95, 0.5, 0.5, 0.7, "leaf"],
    ],
  },
  wardrobe: {
    label: "Wardrobe", group: "bedroom", w: 3.5, d: 2, layer: "solid", colors: ["white", "oak", "walnut", "blue"],
    boxes: [
      [0, 0, 0, 3.5, 2, 6.2, "main"], [0, 0, 6.2, 3.5, 2, 0.2, "main_"],
      [0.15, 2, 0.4, 1.55, 0.04, 5.6, "main^"], [1.8, 2, 0.4, 1.55, 0.04, 5.6, "main^"],
      [1.5, 2.04, 2.8, 0.15, 0.06, 0.8, "gold"], [1.85, 2.04, 2.8, 0.15, 0.06, 0.8, "gold"],
    ],
  },
  closet: {
    // A built-in closet: walls boxing it into the room from the wall behind, two full-size
    // doors (37 in each, 6 ft 8 tall) on its front. In Bedroom 2 it fills the left wall
    // between the beds and stands out into the room 2 ft 6 (a closet's depth). builtin: it is
    // part of the room, so the dollhouse cuts it where it cuts the walls. clear is the floor
    // kept free in front of the doors, as far as a full door swings out.
    label: "Closet (built in)", group: "bedroom", w: 6.5, d: 2.5, layer: "solid", builtin: true, clear: 3,
    colors: ["white", "oak", "walnut", "sage", "lilac"],
    boxes: [
      [0, 0, 0, 6.5, 2.44, 7, "main"],
      [0, 2.44, 0, 6.5, 0.06, 7, "main_"],
      ...[0.1, 3.27].flatMap((u) => [
        [u, 2.5, 0, 3.13, 0.04, 6.67, "main^"],
        [u + 0.3, 2.54, 3.7, 2.53, 0.01, 2.6, "main"], [u + 0.3, 2.54, 0.5, 2.53, 0.01, 2.8, "main"],
      ]),
      [2.95, 2.54, 3.0, 0.12, 0.06, 0.5, "gold"], [3.43, 2.54, 3.0, 0.12, 0.06, 0.5, "gold"],
    ],
  },
  desk: {
    label: "Desk", group: "bedroom", w: 4, d: 2, layer: "solid", colors: ["oak", "white", "walnut", "black"],
    boxes: [
      ...legs(4, 2, 2.3, 0.1, 0.25, "main_"), [2.8, 0.1, 0, 1.1, 1.8, 2.3, "main"], [2.9, 1.9, 1.4, 0.9, 0.04, 0.6, "main_"],
      [0, 0, 2.3, 4, 2, 0.2, "main"], [0.8, 0.5, 2.5, 1.4, 0.9, 0.06, "metal"], [0.8, 0.45, 2.5, 1.4, 0.08, 0.9, "dark"],
      [3.1, 0.4, 2.5, 0.4, 0.4, 0.5, "red"],
    ],
  },
  l_desk: {
    // The corner desk in the photos of Bedroom 2: the long arm along the back wall with the
    // monitor on a riser lit blue underneath and a little two-drawer cabinet under its far end,
    // the short arm down the left wall by the tall chest. parts are its two arms, so the floor in
    // the crook of the L is floor: the chair tucks in there.
    label: "L-desk", group: "bedroom", w: 4.5, d: 3, layer: "solid", colors: ["black", "oak", "white", "walnut"],
    parts: [[0, 0, 4.5, 1.75], [0, 1.75, 1.75, 1.25]],
    plan: [[0, 0], [4.5, 0], [4.5, 1.75], [1.75, 1.75], [1.75, 3], [0, 3]],   // its outline from above
    boxes: [
      [0.1, 0.1, 0, 0.15, 0.15, 2.3, "main_"], [4.25, 0.1, 0, 0.15, 0.15, 2.3, "main_"],
      [0.1, 2.75, 0, 0.15, 0.15, 2.3, "main_"], [1.5, 2.75, 0, 0.15, 0.15, 2.3, "main_"],
      [3.1, 0.2, 0, 1.1, 1.4, 1.6, "woodDark"], [3.2, 1.6, 0.15, 0.9, 0.04, 0.6, "wood"], [3.2, 1.6, 0.85, 0.9, 0.04, 0.6, "wood"],
      [0, 0, 2.3, 4.5, 1.75, 0.15, "main"], [0, 1.75, 2.3, 1.75, 1.25, 0.15, "main"],
      [0.6, 0.05, 2.45, 0.08, 0.6, 0.35, "main_"], [4.2, 0.05, 2.45, 0.08, 0.6, 0.35, "main_"], [0.6, 0.05, 2.8, 3.7, 0.65, 0.06, "main"],
      [0.6, 0.68, 2.72, 3.7, 0.03, 0.08, "led"],
      [2.15, 0.2, 2.86, 0.5, 0.35, 0.1, "dark"], [1.55, 0.3, 2.95, 1.7, 0.08, 1.05, "dark"], [1.62, 0.38, 3.02, 1.56, 0.02, 0.9, "screen"],
      [1.8, 0.85, 2.45, 1.2, 0.4, 0.07, "white"],
      [0.15, 0.2, 2.45, 0.55, 0.45, 0.75, "wood"], [0.2, 2.2, 2.45, 0.9, 0.6, 0.06, "dark"], [0.3, 1.2, 2.45, 0.3, 0.3, 0.45, "red"],
    ],
  },
  shelf_3tier: {
    // As in the photo of Bedroom 2: three dark shelves on four silver poles, as tall as the TV
    // beside it, a bag on top.
    label: "3-tier shelf", group: "bedroom", w: 2, d: 1.25, layer: "solid", colors: ["black", "white", "oak", "walnut"],
    boxes: [
      ...[[0.05, 0.05], [1.8, 0.05], [0.05, 1.05], [1.8, 1.05]].map(([x, y]) => [x, y, 0, 0.15, 0.15, 4.2, "metal"]),
      ...[0.4, 2.0, 3.6].map((z) => [0, 0, z, 2, 1.25, 0.08, "main"]),
      [0.25, 0.3, 0.48, 0.5, 0.7, 0.85, "book1"], [0.8, 0.3, 0.48, 0.3, 0.7, 0.75, "book3"], [1.15, 0.3, 0.48, 0.5, 0.7, 0.8, "book2"],
      [0.3, 0.2, 2.08, 1.4, 0.9, 0.5, "cream"], [0.3, 0.3, 3.68, 0.9, 0.6, 0.8, "leaf"],
    ],
  },
  clothes_rack: {
    // A rolling garment rail, as in the photos of Bedroom 2: it gets wheeled about the room, so
    // it is in the catalog to move like any piece.
    label: "Clothes rack", group: "bedroom", w: 4, d: 1.75, layer: "solid", colors: ["white", "black", "metal"],
    boxes: [
      [0, 0.75, 0.15, 0.15, 0.25, 5.2, "main"], [3.85, 0.75, 0.15, 0.15, 0.25, 5.2, "main"], [0, 0.8, 5.2, 4, 0.15, 0.12, "main"],
      [0, 0.1, 0.15, 0.15, 1.55, 0.1, "main"], [3.85, 0.1, 0.15, 0.15, 1.55, 0.1, "main"],
      ...[[0, 0.1], [0, 1.5], [3.85, 0.1], [3.85, 1.5]].map(([x, y]) => [x, y, 0, 0.15, 0.15, 0.15, "dark"]),
      ...["dark", "cream", "dark", "book4", "white", "dark", "shade", "book1", "dark", "white"].map((m, k) => [0.25 + k * 0.35, 0.4, 2.3, 0.32, 0.95, 2.8, m]),
    ],
  },
  tall_chest: {
    // The chest of drawers in the photo of Bedroom 2: five drawers, black knobs, nearly as tall
    // as the window beside it.
    label: "Tall chest", group: "bedroom", w: 2.75, d: 1.5, layer: "solid", colors: ["white", "oak", "walnut", "black"],
    boxes: [
      [0.05, 0, 0, 2.65, 1.5, 4.05, "main"], [0, 0, 4.05, 2.75, 1.5, 0.15, "main_"],
      ...[0.3, 1.05, 1.8, 2.55, 3.3].flatMap((z) => [
        [0.2, 1.5, z, 2.35, 0.04, 0.65, "main^"], [0.45, 1.54, z + 0.28, 0.12, 0.06, 0.12, "dark"], [2.18, 1.54, z + 0.28, 0.12, 0.06, 0.12, "dark"],
      ]),
      [1.6, 0.4, 4.2, 0.45, 0.45, 0.5, "white"], [0.4, 0.3, 4.2, 0.9, 0.5, 0.35, "book2"],
    ],
  },
  desk_tv: {
    // The stand on the back wall by the door, as in the photo: dark, a shelf below its top, a
    // big TV standing on it.
    label: "Desk with TV", group: "bedroom", w: 4, d: 2, layer: "solid", colors: ["black", "white", "oak", "walnut"],
    boxes: [
      ...legs(4, 2, 2.3, 0.1, 0.25, "main_"), [0.1, 0.1, 1.0, 3.8, 1.8, 0.1, "main_"], [0, 0, 2.3, 4, 2, 0.15, "main"],
      [1.6, 0.5, 2.45, 0.8, 0.45, 0.12, "dark"], [1.9, 0.6, 2.57, 0.2, 0.15, 0.3, "dark"],
      [0.4, 0.5, 2.85, 3.2, 0.15, 1.75, "dark"], [0.5, 0.65, 2.95, 3.0, 0.03, 1.55, "screen"],
    ],
  },
  chest_2: {
    label: "Two-drawer chest", group: "bedroom", w: 2, d: 1.5, layer: "solid", colors: ["white", "oak", "walnut", "black"],
    boxes: [
      [0, 0, 0, 2, 1.5, 2.05, "main"], [0, 0, 2.05, 2, 1.5, 0.15, "main_"],
      [0.15, 1.5, 0.2, 1.7, 0.04, 0.8, "main_"], [0.15, 1.5, 1.1, 1.7, 0.04, 0.8, "main_"],
      [0.9, 1.54, 0.55, 0.2, 0.06, 0.1, "gold"], [0.9, 1.54, 1.45, 0.2, 0.06, 0.1, "gold"],
    ],
  },
  chair: {
    label: "Chair", group: "bedroom", w: 1.5, d: 1.5, layer: "solid", colors: ["oak", "coral", "teal", "white", "black"],
    boxes: [...legs(1.5, 1.5, 1.4, 0.1, 0.2, "main_"), [0.05, 0.05, 1.4, 1.4, 1.4, 0.2, "main"], [0.05, 0.05, 1.6, 1.4, 0.2, 1.5, "main"]],
  },
  bookshelf: {
    label: "Bookshelf", group: "living", w: 3, d: 1, layer: "solid", colors: ["oak", "white", "walnut", "teal"],
    boxes: [
      [0, 0, 0, 3, 1, 5, "main"],
      ...[0.4, 1.6, 2.8, 4.0].flatMap((z, i) => [
        [0.2, 1, z, 0.6, 0.04, 0.9, `book${(i % 4) + 1}`], [0.85, 1, z, 0.4, 0.04, 0.8, `book${((i + 1) % 4) + 1}`],
        [1.3, 1, z, 0.7, 0.04, 0.9, `book${((i + 2) % 4) + 1}`], [2.1, 1, z, 0.6, 0.04, 0.7, `book${((i + 3) % 4) + 1}`],
      ]),
    ],
  },
  plant: {
    label: "Plant", group: "living", w: 1.5, d: 1.5, layer: "solid", colors: ["coral", "white", "teal", "sun"],
    boxes: [[0.3, 0.3, 0, 0.9, 0.9, 1, "main"], [0.05, 0.05, 1, 1.4, 1.4, 0.9, "leaf"], [0.3, 0.3, 1.9, 0.9, 0.9, 0.7, "leafDark"], [0.5, 0.5, 2.6, 0.5, 0.5, 0.4, "leaf"]],
  },
  lamp: {
    label: "Floor lamp", group: "living", w: 1, d: 1, layer: "solid", colors: ["sun", "white", "pink", "teal"],
    boxes: [[0.2, 0.2, 0, 0.6, 0.6, 0.15, "dark"], [0.42, 0.42, 0.15, 0.16, 0.16, 3.6, "dark"], [0.05, 0.05, 3.7, 0.9, 0.9, 1, "main"]],
    glow: [0.5, 0.5, 4],
  },
  beanbag: {
    label: "Beanbag", group: "living", w: 2.5, d: 2.5, layer: "solid", colors: ["coral", "teal", "lilac", "sun", "grey"],
    boxes: [[0, 0, 0, 2.5, 2.5, 0.8, "main"], [0.25, 0.25, 0.8, 2, 2, 0.5, "main"], [0.3, 0.1, 1.3, 1.9, 0.8, 0.6, "main_"]],
    spots: [[1.25, 1.5, 1.3]],
  },
  pet_bed: {
    label: "Pet bed", group: "pets", w: 2, d: 2, layer: "solid", colors: ["pink", "blue", "sage", "lilac", "sun"],
    boxes: [[0, 0, 0, 2, 2, 0.25, "main_"], [0, 0, 0.25, 2, 0.35, 0.4, "main"], [0, 0.35, 0.25, 0.35, 1.65, 0.4, "main"],
      [1.65, 0.35, 0.25, 0.35, 1.65, 0.4, "main"], [0.35, 1.7, 0.25, 1.3, 0.3, 0.2, "main"], [0.35, 0.35, 0.25, 1.3, 1.35, 0.1, "pillow"]],
    spots: [[1, 1.05, 0.35]],
    pets: true,
  },
  toybox: {
    label: "Toy box", group: "pets", w: 2, d: 1.5, layer: "solid", colors: ["sun", "teal", "coral", "lilac"],
    boxes: [[0, 0, 0, 2, 1.5, 1.4, "main"], [0, 0, 1.4, 2, 1.5, 0.15, "main_"], [0.3, 0.4, 1.55, 0.6, 0.6, 0.6, "red"], [1.2, 0.5, 1.55, 0.5, 0.5, 0.35, "book2"]],
  },
  bowl: {
    label: "Food bowl", group: "pets", w: 1, d: 1, layer: "small", colors: ["blue", "pink", "sage", "sun"],
    boxes: [[0.1, 0.1, 0, 0.8, 0.8, 0.35, "main"], [0.25, 0.25, 0.35, 0.5, 0.5, 0.06, "food"]],
    bowl: true,
  },
  sofa: {
    label: "Sofa", group: "living", w: 6.5, d: 3, layer: "solid", colors: ["teal", "coral", "grey", "blue", "sun"],
    boxes: [
      [0, 0, 0, 6.5, 0.8, 2.7, "main"], [0, 0.8, 0, 6.5, 2.2, 1.2, "main_"],
      [0, 0.8, 1.2, 0.7, 2.2, 0.8, "main"], [5.8, 0.8, 1.2, 0.7, 2.2, 0.8, "main"],
      [0.7, 0.8, 1.2, 2.55, 2.1, 0.3, "main^"], [3.25, 0.8, 1.2, 2.55, 2.1, 0.3, "main^"],
    ],
    spots: [[2, 2, 1.5], [4.5, 2, 1.5], [3.2, 1.6, 1.5]],
  },
  armchair: {
    label: "Armchair", group: "living", w: 3, d: 3, layer: "solid", colors: ["coral", "teal", "sun", "grey", "lilac"],
    boxes: [[0, 0, 0, 3, 0.8, 2.7, "main"], [0, 0.8, 0, 3, 2.2, 1.2, "main_"], [0, 0.8, 1.2, 0.6, 2.2, 0.8, "main"],
      [2.4, 0.8, 1.2, 0.6, 2.2, 0.8, "main"], [0.6, 0.8, 1.2, 1.8, 2.1, 0.3, "main^"]],
    spots: [[1.5, 1.9, 1.5]],
  },
  tv: {
    label: "TV", group: "living", w: 4, d: 1.5, layer: "solid", colors: ["walnut", "oak", "white", "black"],
    boxes: [[0, 0.1, 0, 4, 1.4, 1.4, "main"], [0.2, 1.5, 0.3, 1.7, 0.04, 0.8, "main_"], [2.1, 1.5, 0.3, 1.7, 0.04, 0.8, "main_"],
      [1.6, 0.6, 1.4, 0.8, 0.4, 0.2, "dark"], [0.3, 0.7, 1.6, 3.4, 0.2, 2, "dark"], [0.45, 0.9, 1.75, 3.1, 0.03, 1.7, "screen"]],
  },
  table: {
    label: "Table", group: "kitchen", w: 4, d: 3, layer: "solid", colors: ["oak", "white", "walnut", "teal"],
    boxes: [...legs(4, 3, 2.3, 0.2, 0.25, "main_"), [0, 0, 2.3, 4, 3, 0.2, "main"], [1.5, 1, 2.5, 1, 1, 0.3, "white"], [1.7, 1.2, 2.8, 0.6, 0.6, 0.3, "red"]],
  },
  counter: {
    label: "Kitchen counter", group: "kitchen", w: 6, d: 2, layer: "solid", colors: ["white", "sage", "blue", "oak"],
    boxes: [
      [0, 0, 0, 6, 2, 2.8, "main"], [0, 0, 2.8, 6, 2, 0.2, "cream"], [0.15, 2, 0.3, 1.8, 0.04, 2.2, "main_"],
      [2.1, 2, 0.3, 1.8, 0.04, 2.2, "main_"], [4.05, 2, 0.3, 1.8, 0.04, 2.2, "main_"],
      [0.5, 0.4, 3, 1.8, 1.2, 0.04, "dark"], [3.7, 0.3, 2.96, 1.6, 1.3, 0.06, "metal"], [4.3, 0.1, 3, 0.3, 0.3, 0.7, "metal"],
    ],
  },
  fridge: {
    label: "Fridge", group: "kitchen", w: 2.5, d: 2.5, layer: "solid", colors: ["white", "teal", "pink", "grey"],
    boxes: [[0, 0, 0, 2.5, 2.5, 6, "main"], [0.1, 2.5, 3.6, 2.3, 0.04, 2.3, "main^"], [0.1, 2.5, 0.2, 2.3, 0.04, 3.2, "main^"],
      [0.2, 2.54, 2.8, 0.15, 0.06, 0.6, "metal"], [0.2, 2.54, 3.8, 0.15, 0.06, 0.6, "metal"]],
  },
  // The real flat's kitchen, from its photos: oak cabinets, granite tops, white appliances,
  // an L round the corner -- fridge and stove along one wall, sink and dishwasher the other.
  base_cabinet: {
    label: "Base cabinet", group: "kitchen", w: 2, d: 2, layer: "solid", colors: ["oak", "white", "sage", "blue"],
    boxes: [[0, 0, 0, 2, 2, 2.8, "main"], [0, 0, 2.8, 2, 2, 0.2, "granite"], [0.15, 2, 0.3, 1.7, 0.04, 1.6, "main_"], [0.15, 2, 2.1, 1.7, 0.04, 0.55, "main_"]],
  },
  sink_counter: {
    label: "Sink counter", group: "kitchen", w: 4, d: 2, layer: "solid", colors: ["oak", "white", "sage", "blue"],
    boxes: [
      [0, 0, 0, 4, 2, 2.8, "main"], [0, 0, 2.8, 4, 2, 0.2, "granite"],
      [0.15, 2, 0.3, 1.75, 0.04, 2.2, "main_"], [2.1, 2, 0.3, 1.75, 0.04, 2.2, "main_"],
      [0.8, 0.35, 2.96, 2.4, 1.3, 0.06, "metal"], [1.9, 0.08, 3, 0.2, 0.25, 0.7, "metal"],
    ],
  },
  dishwasher: {
    label: "Dishwasher", group: "kitchen", w: 2, d: 2, layer: "solid", colors: ["white", "grey", "black"],
    boxes: [[0, 0, 0, 2, 2, 2.8, "main"], [0, 0, 2.8, 2, 2, 0.2, "granite"], [0.1, 2, 2.35, 1.8, 0.04, 0.3, "main_"], [0.6, 2.04, 2.45, 0.8, 0.06, 0.1, "metal"]],
  },
  stove: {
    label: "Stove", group: "kitchen", w: 2.5, d: 2.25, layer: "solid", colors: ["white", "grey", "black"],
    boxes: [
      [0, 0, 0, 2.5, 2.25, 3, "main"], [0, 0, 3, 2.5, 0.35, 0.6, "main"],
      [0.25, 0.55, 3, 0.75, 0.7, 0.03, "hob"], [1.5, 0.55, 3, 0.75, 0.7, 0.03, "hob"], [0.25, 1.4, 3, 0.75, 0.6, 0.03, "hob"], [1.5, 1.4, 3, 0.75, 0.6, 0.03, "hob"],
      [0.3, 2.25, 0.5, 1.9, 0.04, 1.6, "screen"], [0.3, 2.29, 2.25, 1.9, 0.05, 0.1, "metal"],
    ],
  },
  bathtub: {
    label: "Bathtub", group: "bath", w: 5, d: 2.5, layer: "solid", colors: ["white", "pink", "sage", "blue"],
    boxes: [[0, 0, 0, 5, 2.5, 1.8, "main"], [0.3, 0.3, 1.8, 4.4, 1.9, 0.02, "water"], [4.4, 0.05, 1.8, 0.3, 0.25, 0.7, "metal"]],
  },
  toilet: {
    label: "Toilet", group: "bath", w: 1.5, d: 2.5, layer: "solid", colors: ["white", "pink", "blue", "black"],
    boxes: [[0.2, 0, 0, 1.1, 0.7, 2.6, "porcelain"], [0.15, 0.7, 0, 1.2, 1.6, 1.4, "porcelain"], [0.15, 0.7, 1.4, 1.2, 1.6, 0.1, "main"]],
  },
  sink: {
    label: "Sink", group: "bath", w: 2, d: 1.5, layer: "solid", colors: ["white", "oak", "teal", "pink"],
    boxes: [[0, 0, 0, 2, 1.5, 2.6, "main"], [0, 0, 2.6, 2, 1.5, 0.2, "porcelain"], [0.4, 0.35, 2.8, 1.2, 0.9, 0.03, "water"], [0.9, 0.05, 2.8, 0.2, 0.3, 0.6, "metal"]],
  },
  washer: {
    // Top-loading, as in the real bathroom: a lid on top, controls at the back.
    label: "Washer", group: "bath", w: 2.5, d: 2.5, layer: "solid", colors: ["white", "grey", "blue", "pink"],
    boxes: [[0, 0, 0, 2.5, 2.5, 3, "main"], [0, 0, 3, 2.5, 0.6, 0.35, "main_"], [0.2, 0.75, 3, 2.1, 1.55, 0.04, "main^"], [0.2, 0.1, 3.35, 0.3, 0.3, 0.05, "metal"]],
  },
  vanity: {
    label: "Vanity", group: "bath", w: 3, d: 1.75, layer: "solid", colors: ["oak", "white", "walnut", "teal"],
    boxes: [
      [0, 0, 0, 3, 1.75, 2.6, "main"], [0, 0, 2.6, 3, 1.75, 0.15, "porcelain"], [0.8, 0.4, 2.75, 1.4, 0.9, 0.03, "water"],
      [1.4, 0.05, 2.75, 0.2, 0.3, 0.5, "metal"], [0.15, 1.75, 0.3, 1.3, 0.04, 1.9, "main_"], [1.55, 1.75, 0.3, 1.3, 0.04, 1.9, "main_"],
    ],
  },
  dryer: {
    label: "Dryer", group: "bath", w: 2.25, d: 2.25, layer: "solid", colors: ["white", "grey"],
    boxes: [[0, 0, 0, 2.25, 2.25, 3, "main"], [0, 0, 3, 2.25, 0.5, 0.35, "main_"], [0.35, 2.25, 0.9, 1.55, 0.04, 1.2, "main_"], [0.2, 0.1, 3.35, 0.3, 0.3, 0.05, "metal"]],
  },
  tub_shower: {
    // The real bathroom's: a white tub with a shower surround to the ceiling and a curtain rod.
    label: "Tub & shower", group: "bath", w: 5, d: 2.5, layer: "solid", colors: ["white"],
    boxes: [
      [0, 0, 0, 5, 2.5, 1.7, "main"], [0.25, 0.25, 1.7, 4.5, 2, 0.02, "water"],
      [0, 0, 1.7, 5, 0.25, 4.6, "main"], [0, 0.25, 1.7, 0.25, 2.25, 4.6, "main"], [4.75, 0.25, 1.7, 0.25, 2.25, 4.6, "main"],
      [2.3, 0.25, 2.6, 0.4, 0.15, 0.4, "metal"], [2.4, 0.25, 5.7, 0.2, 0.3, 0.15, "metal"],
      [0, 2.4, 6.2, 5, 0.06, 0.06, "metal"],
    ],
  },
  basket: {
    label: "Laundry basket", group: "bath", w: 1.5, d: 1.5, layer: "solid", colors: ["oak", "white", "teal", "pink"],
    boxes: [[0.1, 0.1, 0, 1.3, 1.3, 1.4, "main"], [0.25, 0.25, 1.4, 1, 1, 0.3, "sky"], [0.6, 0.3, 1.7, 0.5, 0.5, 0.15, "pink"]],
  },
  rug: {
    label: "Rug", group: "floor", w: 6, d: 4, layer: "rug", colors: ["pink", "sage", "blue", "sun", "lilac", "coral"],
    boxes: [[0, 0, 0, 6, 4, 0.05, "main"], [0.4, 0.4, 0.05, 5.2, 3.2, 0.01, "main^"]],
  },
  small_rug: {
    label: "Small rug", group: "floor", w: 4, d: 3, layer: "rug", colors: ["sage", "pink", "blue", "sun", "lilac", "coral"],
    boxes: [[0, 0, 0, 4, 3, 0.05, "main"], [0.3, 0.3, 0.05, 3.4, 2.4, 0.01, "main^"]],
  },
  mat: {
    label: "Bath mat", group: "floor", w: 3, d: 2, layer: "rug", colors: ["blue", "pink", "sage", "white"],
    boxes: [[0, 0, 0, 3, 2, 0.06, "main"]],
  },
  window: {
    label: "Window", group: "wall", w: 3, d: 0.15, layer: "wall", outer: true, colors: ["white", "oak", "teal"],
    boxes: [[0, 0, 1.2, 3, 0.12, 2.6, "main"], [0.2, 0.12, 1.4, 1.2, 0.03, 2.2, "sky"], [1.6, 0.12, 1.4, 1.2, 0.03, 2.2, "sky"], [-0.1, 0, 1.1, 3.2, 0.3, 0.12, "main"]],
  },
  basement_window: {
    // Small and up high, with a deep sill and a curtain rod above: a basement room's window,
    // as in the photo of the real Bedroom 2 (above a headboard, and one on the side wall).
    label: "Small window", group: "wall", w: 2.5, d: 0.4, layer: "wall", outer: true, colors: ["white", "oak", "teal"],
    boxes: [
      [0, 0, 2.97, 2.5, 0.12, 0.85, "main"], [0.15, 0.12, 3.05, 2.2, 0.03, 0.68, "sky"], [0, 0, 2.85, 2.5, 0.4, 0.12, "main_"],
      [-0.4, 0.15, 3.88, 3.3, 0.06, 0.06, "dark"], [-0.45, 0.13, 3.84, 0.1, 0.1, 0.14, "dark"], [2.85, 0.13, 3.84, 0.1, 0.1, 0.14, "dark"],
    ],
  },
  wall_cabinets: {
    label: "Wall cabinets", group: "wall", w: 3, d: 1.1, layer: "wall", colors: ["oak", "white", "sage", "blue"],
    boxes: [[0, 0, 3.3, 3, 1.1, 2.5, "main"], [0.1, 1.1, 3.4, 1.35, 0.04, 2.3, "main_"], [1.55, 1.1, 3.4, 1.35, 0.04, 2.3, "main_"]],
  },
  entry_door: {
    // The flat's front door, in an outside wall: a six-panel door with a knob and a deadbolt.
    label: "Front door", group: "wall", w: 3, d: 0.12, layer: "wall", outer: true, clear: 3, colors: ["white", "oak", "teal", "black"],
    boxes: [
      [-0.2, 0, 0, 3.4, 0.06, 7, "white"], [0, 0.06, 0, 3, 0.05, 6.7, "main"],
      [0.3, 0.11, 4.2, 0.95, 0.02, 1.9, "main_"], [1.75, 0.11, 4.2, 0.95, 0.02, 1.9, "main_"],
      [0.3, 0.11, 2.6, 0.95, 0.02, 1.2, "main_"], [1.75, 0.11, 2.6, 0.95, 0.02, 1.2, "main_"],
      [0.3, 0.11, 0.4, 0.95, 0.02, 1.9, "main_"], [1.75, 0.11, 0.4, 0.95, 0.02, 1.9, "main_"],
      [2.6, 0.11, 3.0, 0.15, 0.08, 0.15, "metal"], [2.6, 0.11, 3.5, 0.15, 0.08, 0.12, "metal"],
    ],
  },
  medicine_cabinet: {
    label: "Medicine cabinet", group: "wall", w: 1.75, d: 0.4, layer: "wall", colors: ["white", "oak"],
    boxes: [[0, 0, 3.2, 1.75, 0.4, 2.1, "main"], [0.55, 0.4, 3.3, 1.1, 0.03, 1.9, "glass"], [0.05, 0.4, 3.3, 0.4, 0.02, 1.9, "main_"]],
  },
  picture: {
    label: "Picture", group: "wall", w: 2, d: 0.1, layer: "wall", colors: ["blue", "pink", "sage", "sun"],
    boxes: [[0, 0, 2.2, 2, 0.08, 1.4, "frame"], [0.15, 0.08, 2.35, 1.7, 0.02, 1.1, "main"], [0.4, 0.1, 2.5, 0.6, 0.01, 0.5, "white"]],
  },
  mirror: {
    label: "Mirror", group: "wall", w: 1.5, d: 0.1, layer: "wall", colors: ["sun", "white", "black"],
    boxes: [[0, 0, 1.5, 1.5, 0.08, 2.4, "main"], [0.15, 0.08, 1.65, 1.2, 0.02, 2.1, "glass"]],
  },
  shelf: {
    label: "Wall shelf", group: "wall", w: 3, d: 0.8, layer: "wall", colors: ["oak", "white", "walnut"],
    boxes: [[0, 0, 2.8, 3, 0.8, 0.12, "main"], [0.3, 0.2, 2.92, 0.5, 0.4, 0.6, "pot"], [0.3, 0.15, 3.5, 0.6, 0.5, 0.4, "leaf"], [1.4, 0.15, 2.92, 1.2, 0.5, 0.7, "book2"]],
  },
  tapestry: {
    // The black moon-and-sun tapestry hung on a curtain rod over the head of the twin by the
    // door (in front of the small window there).
    label: "Tapestry", group: "wall", w: 3.25, d: 0.15, layer: "wall", colors: ["black", "blue", "lilac"],
    boxes: [
      [-0.1, 0.05, 3.88, 3.45, 0.06, 0.06, "dark"], [0.05, 0, 2.2, 3.15, 0.05, 1.68, "main"],
      [1.2, 0.05, 2.75, 0.85, 0.01, 0.75, "white"], [1.42, 0.06, 2.95, 0.4, 0.01, 0.35, "main"],
      [0.5, 0.05, 2.95, 0.4, 0.01, 0.4, "white"], [2.35, 0.05, 2.95, 0.4, 0.01, 0.4, "white"],
      ...[[0.25, 3.5], [2.85, 3.5], [0.3, 2.4], [2.8, 2.4], [1.6, 3.65]].map(([x, z]) => [x, 0.05, z, 0.1, 0.01, 0.1, "white"]),
    ],
  },
  floating_shelf: {
    // The little black shelf by the head of the twin, with an alarm clock and a book or two on it.
    label: "Floating shelf", group: "wall", w: 1.75, d: 0.75, layer: "wall", colors: ["black", "white", "oak"],
    boxes: [[0, 0, 2.9, 1.75, 0.75, 0.1, "main"], [0.15, 0.15, 3.0, 0.7, 0.5, 0.15, "book3"], [0.95, 0.2, 3.0, 0.45, 0.35, 0.4, "dark"],
      [1.02, 0.55, 3.08, 0.32, 0.01, 0.22, "led"]],
  },
  deep_window: {
    // The bigger window in Bedroom 2's side wall, over the Twin XL: set deep in the wall with a
    // wide sill, flowers and books along it.
    label: "Window with a deep sill", group: "wall", w: 2.75, d: 0.7, layer: "wall", outer: true, colors: ["white", "oak", "black"],
    boxes: [
      [0, 0, 3.0, 2.75, 0.7, 0.1, "main_"], [0, 0, 3.1, 0.15, 0.15, 2.4, "main"], [2.6, 0, 3.1, 0.15, 0.15, 2.4, "main"],
      [0.15, 0.04, 3.1, 2.45, 0.03, 2.4, "sky"],
      [0.25, 0.2, 3.1, 0.65, 0.4, 0.25, "book1"], [0.45, 0.3, 3.35, 0.2, 0.2, 0.45, "pink"], [0.3, 0.2, 3.75, 0.55, 0.45, 0.4, "white"],
      [1.1, 0.25, 3.1, 0.55, 0.35, 0.2, "book2"], [2.0, 0.2, 3.1, 0.4, 0.4, 0.4, "water"],
    ],
  },
  clock: {
    label: "Clock", group: "wall", w: 1, d: 0.1, layer: "wall", colors: ["white", "sun", "pink", "teal"],
    boxes: [[0, 0, 3, 1, 0.08, 1, "main"], [0.2, 0.08, 3.2, 0.6, 0.02, 0.6, "white"], [0.45, 0.1, 3.5, 0.1, 0.01, 0.3, "dark"]],
  },
};

// What the pieces really measure, in feet (width x depth). The models above were drawn at
// round sizes, a little big -- a "twin" 42 inches wide, a desk 4 ft -- so a bedroom held
// less than a real one; each is scaled to these, boxes, spots and lamp glow with it.
// Bedroom 2 (13 x 12 ft) takes two twin beds against the front wall with the closet between,
// a desk, a dresser and a pet bed (shared/home.test.js).
const REAL = {
  bed: [3.25, 6.5],           // twin: 39 x 75 in mattress, and its headboard
  twin_xl: [3.25, 7],         // 39 x 80 in
  double_bed: [4.5, 6.5],     // full: 54 in
  nightstand: [1.5, 1.25],
  wardrobe: [3, 2],
  desk: [3.5, 1.75],          // 42 x 21 in
  chair: [1.5, 1.5],
  bookshelf: [2.5, 1],
  plant: [1.25, 1.25],
  pet_bed: [1.75, 1.75],
  toybox: [2, 1.25],
  armchair: [2.75, 2.75],
  tv: [4, 1.25],
  table: [4, 2.5],            // 48 x 30 in, seats four
  toilet: [1.5, 2.25],
  washer: [2.25, 2.25],       // 27 in
  basket: [1.25, 1.25],
  mat: [2.5, 1.75],
  vanity: [2.5, 1.75],        // the real bathroom's, 30 in
};
for (const [kind, [w, d]] of Object.entries(REAL)) {
  const c = CATALOG[kind];
  const kx = w / c.w;
  const ky = d / c.d;
  c.boxes = c.boxes.map(([x, y, z, bw, bd, h, mat]) => [x * kx, y * ky, z, bw * kx, bd * ky, h, mat]);
  if (c.spots) c.spots = c.spots.map(([x, y, z]) => [x * kx, y * ky, z]);
  if (c.glow) c.glow = [c.glow[0] * kx, c.glow[1] * ky, c.glow[2]];
  c.w = w;
  c.d = d;
}

export const WALLPAPERS = {
  white: { label: "White", base: "#fdfcf8", pattern: "plain" },
  rose: { label: "Rose", base: "#e7b8c6", pattern: "stripe" },
  lilac: { label: "Lilac", base: "#c3b3e0", pattern: "dots" },
  butter: { label: "Butter", base: "#f0dc9c", pattern: "plain" },
  sky: { label: "Sky", base: "#a9cdeb", pattern: "stripe" },
  mint: { label: "Mint", base: "#b8e2cc", pattern: "dots" },
  peach: { label: "Peach", base: "#f5c4a1", pattern: "plain" },
  night: { label: "Night", base: "#5a5a8a", pattern: "stars" },
  tiles: { label: "Tiles", base: "#d8f0ee", pattern: "tile" },
};

export const FLOORS = {
  oak: { label: "Oak", base: "#c08a5c", pattern: "planks" },
  walnut: { label: "Walnut", base: "#8a5d3a", pattern: "planks" },
  birch: { label: "Birch", base: "#e2c39a", pattern: "planks" },
  carpet: { label: "Blue carpet", base: "#8ea6c8", pattern: "carpet" },
  rosecarpet: { label: "Pink carpet", base: "#e2a9b9", pattern: "carpet" },
  check: { label: "Check tiles", base: "#f4efe6", pattern: "check" },
  // Bedroom 2's, from a photo of the real room: grey weathered wood-look vinyl planks.
  greywood: { label: "Grey planks", base: "#857c71", pattern: "weathered" },
  brownwood: { label: "Brown planks", base: "#8a6a50", pattern: "weathered" },
  aqua: { label: "Aqua tiles", base: "#bfe6e2", pattern: "check" },
};

// -- layouts -----------------------------------------------------------------------------

export const MAX_ITEMS = 40;

/** A piece's footprint on the floor: x0..x1, y0..y1 in feet. Rotation turns it a quarter at a time. */
export function footprint(item) {
  const c = CATALOG[item.kind];
  if (c.layer === "wall") return wallBox(item);
  const turned = item.rot % 2 === 1;
  const w = turned ? c.d : c.w;
  const d = turned ? c.w : c.d;
  return { x0: item.x, y0: item.y, x1: item.x + w, y1: item.y + d };
}

/**
 * What a piece stands on: its footprint, or for one that isn't a plain box (the L-desk) each of
 * its parts, so the floor in the crook of the L stays floor.
 */
export function partsOf(item) {
  const c = CATALOG[item.kind];
  if (!c.parts) return [footprint(item)];
  return c.parts.map(([x, y, w, d]) => {
    const [ax, ay] = place(item, x, y);
    const [bx, by] = place(item, x + w, y + d);
    return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) };
  });
}

/** Where a point of a piece (its own feet, rotation 0) lands in the flat. */
export function place(item, u, v) {
  const c = CATALOG[item.kind];
  switch (item.rot) {
    case 1: return [item.x + c.d - v, item.y + u];
    case 2: return [item.x + c.w - u, item.y + c.d - v];
    case 3: return [item.x + v, item.y + c.w - u];
    default: return [item.x + u, item.y + v];
  }
}

/** A wall piece's place along its wall: along `at`, out from the wall by d. */
export function wallPlace(item, u, v) {
  const { side, line, at } = item;
  if (side === "n") return [at + u, line + v];
  if (side === "s") return [at + u, line - v];
  if (side === "w") return [line + v, at + u];
  return [line - v, at + u];
}

function wallBox(item, out = CATALOG[item.kind].d) {
  const c = CATALOG[item.kind];
  const [ax, ay] = wallPlace(item, 0, 0);
  const [bx, by] = wallPlace(item, c.w, out);
  return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) };
}

/** The piece's boxes in the flat, as {x0, y0, z0, x1, y1, z1, mat}. */
export function boxesOf(item) {
  const c = CATALOG[item.kind];
  const at = c.layer === "wall" ? wallPlace : place;
  return c.boxes.map(([x, y, z, w, d, h, mat]) => {
    const [ax, ay] = at(item, x, y);
    const [bx, by] = at(item, x + w, y + d);
    return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by), z0: z, z1: z + h, mat };
  });
}

/** Where pets curl up on a piece, in the flat. */
export function spotsOf(item) {
  return (CATALOG[item.kind].spots || []).map(([u, v, z]) => {
    const [x, y] = place(item, u, v);
    return { x, y, z };
  });
}

const overlaps = (a, b) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;
// Pieces go on a quarter-foot (3 inch) grid: real sizes (a twin bed is 39 inches wide) then
// sit flush against each other and the walls, where a half-foot grid left gaps.
export const GRID = 0.25;
const onGrid = (n) => Number.isFinite(n) && Math.abs(n / GRID - Math.round(n / GRID)) < EPS;

/** The floor just in front of a piece (its doors' side), out to `reach` feet. */
export function frontOf(item, reach) {
  const c = CATALOG[item.kind];
  if (c.layer === "wall") return wallBox(item, reach);
  const [ax, ay] = place(item, 0, c.d);
  const [bx, by] = place(item, c.w, c.d + reach);
  return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) };
}

/** Room in front of each door a piece of furniture mustn't stand in, so pets (and people) get through. */
export function doorways(room) {
  return DOORS.filter((d) => d.rooms.includes(room)).map((d) => {
    const deep = 1.5;
    // Which side of the line this room is on.
    const probe = d.axis === "x" ? roomAt(d.at - 0.5, (d.from + d.to) / 2) : roomAt((d.from + d.to) / 2, d.at - 0.5);
    const before = probe === room;
    return d.axis === "x"
      ? { x0: before ? d.at - deep : d.at, x1: before ? d.at : d.at + deep, y0: d.from, y1: d.to }
      : { x0: d.from, x1: d.to, y0: before ? d.at - deep : d.at, y1: before ? d.at : d.at + deep };
  });
}

function insideRoom(room, f) {
  if (ROOMS[room].areas.some((a) => f.x0 >= a.x0 && f.x1 <= a.x1 && f.y0 >= a.y0 && f.y1 <= a.y1)) return true;
  for (let x = f.x0 + GRID / 2; x < f.x1; x += GRID) {
    for (let y = f.y0 + GRID / 2; y < f.y1; y += GRID) if (roomAt(x, y) !== room) return false;
  }
  return true;
}

/** Whether a wall piece's span along its wall is all wall of this room (no door, no corner). */
function onWall(room, item) {
  const c = CATALOG[item.kind];
  const walls = wallsOf(room).filter((w) => !w.inside && w.side === item.side && w.line === item.line && (!c.outer || w.outer));
  for (let a = item.at + GRID / 2; a < item.at + c.w; a += GRID) {
    if (!walls.some((w) => a >= w.from && a <= w.to)) return false;
  }
  return true;
}

/**
 * Whether a layout can be saved for a room. Returns null when it can, or what is wrong
 * in words a roommate understands.
 */
export function layoutProblem(room, layout) {
  if (!ROOMS[room]) return "There is no such room";
  if (!layout || typeof layout !== "object") return "A layout is needed";
  if (!Object.hasOwn(WALLPAPERS, layout.wall)) return "Pick a wallpaper";
  if (!Object.hasOwn(FLOORS, layout.floor)) return "Pick a floor";
  if (!Array.isArray(layout.items)) return "A layout needs its furniture";
  if (layout.items.length > MAX_ITEMS) return `A room can hold ${MAX_ITEMS} pieces`;
  const placed = [];
  for (const item of layout.items) {
    const c = item && CATALOG[item.kind];
    if (!c || !Object.hasOwn(CATALOG, item.kind)) return "Something in the room isn't in the catalog";
    if (!c.colors.includes(item.color)) return `${c.label} doesn't come in that colour`;
    if (c.layer === "wall") {
      if (!["n", "e", "s", "w"].includes(item.side) || !onGrid(item.at) || !onGrid(item.line)) return `${c.label} must hang on a wall`;
      if (!onWall(room, item)) return c.outer ? `${c.label} must go on an outside wall` : `${c.label} must hang on one of the room's walls`;
      const span = { side: item.side, line: item.line, from: item.at, to: item.at + c.w };
      if (placed.some((p) => p.span && p.span.side === span.side && p.span.line === span.line && p.span.from < span.to - EPS && span.from < p.span.to - EPS)) {
        return `${c.label} overlaps something on the wall`;
      }
      placed.push({ span, c });
      continue;
    }
    if (![0, 1, 2, 3].includes(item.rot) || !onGrid(item.x) || !onGrid(item.y)) return `${c.label} is out of place`;
    const f = footprint(item);
    if (!insideRoom(room, f)) return `${c.label} doesn't fit there`;
    const parts = partsOf(item);
    const hit = (g) => parts.some((q) => overlaps(q, g));
    for (const p of placed) {
      if (!p.f || !p.parts.some(hit)) continue;
      const a = c.layer;
      const b = p.c.layer;
      if (a === b || (a === "small" && b === "solid") || (a === "solid" && b === "small")) return `${c.label} overlaps the ${p.c.label.toLowerCase()}`;
    }
    if (c.layer === "solid" && doorways(room).some(hit)) return `${c.label} blocks a doorway`;
    if (c.layer !== "rug" && (ROOMS[room].posts || []).some((p) => hit(postBox(p)))) return `${c.label} is where a post is`;
    placed.push({ f, parts, c });
  }
  // A built-in's doors (Bedroom 2's closet) need room to open too.
  for (const bi of ROOMS[room].builtins || []) {
    const d = bi.clear;
    const front = { n: { x0: bi.x0, x1: bi.x1, y0: bi.y0 - d, y1: bi.y0 }, s: { x0: bi.x0, x1: bi.x1, y0: bi.y1, y1: bi.y1 + d },
      w: { x0: bi.x0 - d, x1: bi.x0, y0: bi.y0, y1: bi.y1 }, e: { x0: bi.x1, x1: bi.x1 + d, y0: bi.y0, y1: bi.y1 } }[bi.doors];
    const blocker = placed.find((p) => p.f && p.c.layer === "solid" && p.parts.some((q) => overlaps(q, front)));
    if (blocker) return `The ${blocker.c.label.toLowerCase()} is in front of the ${bi.kind}`;
  }
  // A built-in closet's doors need room to open: nothing solid on the floor in front of them.
  for (const item of layout.items) {
    const c = CATALOG[item.kind];
    if (!c.clear) continue;
    const front = frontOf(item, c.clear);
    const blocker = placed.find((p) => p.f && p.c.layer === "solid" && p.parts.some((q) => overlaps(q, front)));
    if (blocker) return `The ${blocker.c.label.toLowerCase()} is in front of the ${c.label.toLowerCase()}`;
  }
  return null;
}

/** A layout with only what the catalog knows, in the shape the server keeps. */
export function cleanLayout(layout) {
  return {
    wall: layout.wall,
    floor: layout.floor,
    items: layout.items.map((i) => (CATALOG[i.kind].layer === "wall"
      ? { kind: i.kind, color: i.color, side: i.side, line: i.line, at: i.at }
      : { kind: i.kind, color: i.color, x: i.x, y: i.y, rot: i.rot })),
  };
}

const W = (kind, color, side, line, at) => ({ kind, color, side, line, at });
const F = (kind, color, x, y, rot = 0) => ({ kind, color, x, y, rot });

// How the flat comes furnished, until someone rearranges a room.
export const DEFAULT_LAYOUTS = {
  bedA: {
    // The other basement bedroom: white, brown planks, two small windows meeting in the back
    // left corner, its closet in the front right.
    wall: "white", floor: "brownwood",
    items: [
      W("basement_window", "white", "n", 0, 0.75), W("basement_window", "white", "w", 0, 0.75), W("picture", "pink", "n", 0, 7),
      F("small_rug", "pink", 4.5, 4), F("bed", "pink", 0, 4, 3), F("nightstand", "white", 0, 7.25, 3), F("dresser", "white", 6, 0),
      F("plant", "coral", 11.75, 0),
    ],
  },
  bedB: {
    // As sketched, and as the photos taken from the foot of the twin by the door show it: an
    // L-desk in the back left corner, a 3-tier shelf and the TV on its stand along the back
    // wall to the door, the tall chest on the left wall, and along the front the Twin XL and
    // the twin with the closet (part of the walls, see ROOMS) a tight fit between them, a small
    // high window above each, a two-drawer chest at the foot of the twin. Each bed is in its
    // own nook between the closet and the wall: the Twin XL's with the deep-silled window in the
    // left wall, the twin's with a little shelf on the right wall by its head and a tapestry hung
    // over it, in front of its window. The sizes are guesses until the room is measured.
    wall: "white", floor: "greywood",
    items: [
      W("basement_window", "white", "s", 25, 0.5), W("tapestry", "black", "s", 25, 9.75),
      W("deep_window", "white", "w", 0, 18), W("floating_shelf", "black", "e", 13, 22.75),
      F("l_desk", "black", 0, 12), F("chair", "white", 2.5, 13.75, 2), F("shelf_3tier", "black", 5, 12),
      F("desk_tv", "black", 7.5, 12), F("tall_chest", "white", 0, 15, 3), F("clothes_rack", "white", 4.75, 14),
      F("twin_xl", "lilac", 0, 18, 2), F("bed", "grey", 9.75, 18.5, 2), F("chest_2", "white", 10.25, 17, 2),
    ],
  },
  main: {
    // As in the photos: the kitchen an L round the back left corner -- base cabinet, stove and
    // fridge down the left wall, dishwasher and the sink under its little window along the back,
    // oak cabinets above -- and the living room in front of the posts, the front door on the right.
    wall: "white", floor: "greywood",
    items: [
      W("basement_window", "white", "n", 0, 17.75), W("wall_cabinets", "oak", "n", 0, 14.75), W("wall_cabinets", "oak", "w", 13, 0.25),
      W("entry_door", "white", "e", 30, 20.5), W("basement_window", "white", "e", 30, 13), W("clock", "white", "n", 9, 26.5),
      F("base_cabinet", "oak", 13, 0), F("dishwasher", "white", 15, 0), F("sink_counter", "oak", 17, 0),
      F("stove", "white", 13, 2, 3), F("fridge", "white", 13, 4.5, 3), F("bowl", "blue", 17.5, 3),
      F("table", "oak", 16, 5.5), F("chair", "oak", 17.25, 8, 2),
      F("rug", "pink", 22.5, 14.5), F("tv", "walnut", 25.5, 9), F("sofa", "teal", 20.5, 19.5, 2),
      F("bookshelf", "oak", 13, 19, 3), F("armchair", "coral", 17.5, 14, 1), F("plant", "coral", 19.75, 23), F("lamp", "sun", 21.5, 22.75),
    ],
  },
  bath: {
    // The bathroom with the laundry: washer and dryer side by side on the left, the oak vanity
    // under the small window at the back with a mirror and medicine cabinet, the toilet, and the
    // tub with its shower along the right.
    wall: "white", floor: "greywood",
    items: [
      W("basement_window", "white", "n", 0, 23.25), W("medicine_cabinet", "white", "n", 0, 25.75),
      F("washer", "white", 21, 2.25, 3), F("dryer", "white", 21, 0, 3), F("vanity", "oak", 23.25, 0),
      F("toilet", "white", 25.75, 0), F("tub_shower", "white", 27.5, 0, 3), F("mat", "blue", 24, 3.25),
    ],
  },
};

/** The layout a room has: the household's own, or how it came. */
export function layoutOf(layouts, room) {
  return layouts?.[room] || DEFAULT_LAYOUTS[room];
}

// -- the builder's moves, kept here so they are tested ----------------------------------

export const snap = (n) => Math.round(n / GRID) * GRID;

/**
 * A piece turned a quarter, about its middle, kept on the grid. The shift that keeps it
 * centred is rounded (not the position), and undone on the way back, so four turns bring
 * it back where it was -- rounding each new position let a 3.25 ft bed creep.
 */
export function turned(item) {
  const c = CATALOG[item.kind];
  const shift = Math.trunc((c.w - c.d) / 2 / GRID) * GRID;
  const sign = item.rot % 2 === 0 ? 1 : -1;
  return { ...item, rot: (item.rot + 1) % 4, x: item.x + sign * shift, y: item.y - sign * shift };
}

/**
 * A wall piece slid to the wall nearest a point (x, y) on the floor plan: onto that wall,
 * centred on the point along it, kept within it. accept(wall) limits which walls (the
 * dollhouse only offers the ones that stand); outside-only pieces (windows) need outer walls.
 */
export function wallSpotNear(room, item, x, y, accept = () => true) {
  const c = CATALOG[item.kind];
  let best = null;
  for (const wl of wallsOf(room)) {
    if (wl.inside || !accept(wl) || (c.outer && !wl.outer) || wl.to - wl.from < c.w - EPS) continue;
    const ns = wl.side === "n" || wl.side === "s";
    const along = ns ? x : y;
    const across = ns ? y : x;
    const at = Math.max(wl.from, Math.min(wl.to - c.w, snap(along - c.w / 2)));
    const d = Math.abs(across - wl.line) + Math.max(0, wl.from - along, along - wl.to);
    if (!best || d < best.d) best = { d, at, side: wl.side, line: wl.line };
  }
  return best ? { ...item, side: best.side, line: best.line, at: best.at } : item;
}

/** Somewhere a new piece fits in a room, nearest its middle (and on a wall for wall pieces), or null. */
export function freeSpot(room, layout, kind, color) {
  const c = CATALOG[kind];
  const col = color || c.colors[0];
  const tries = [];
  if (c.layer === "wall") {
    for (const w of wallsOf(room)) {
      for (let at = w.from; at + c.w <= w.to + EPS; at += 0.5) tries.push({ kind, color: col, side: w.side, line: w.line, at, score: (w.side === "n" ? 0 : 1) * 100 + Math.abs(at + c.w / 2 - (w.from + w.to) / 2) });
    }
  } else {
    const b = bounds(room);
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    for (let rot = 0; rot < 4; rot += 1) {
      for (let x = b.x0; x <= b.x1; x += 0.5) {
        for (let y = b.y0; y <= b.y1; y += 0.5) {
          const it = { kind, color: col, x, y, rot };
          const f = footprint(it);
          tries.push({ ...it, score: Math.hypot((f.x0 + f.x1) / 2 - cx, (f.y0 + f.y1) / 2 - cy) + rot * 0.01 });
        }
      }
    }
  }
  tries.sort((a, b) => a.score - b.score);
  // Most places are plainly taken: rule those out cheaply before checking the whole layout.
  const taken = c.layer === "rug" || c.layer === "wall" ? [] : layout.items
    .filter((i) => ["solid", "small"].includes(CATALOG[i.kind]?.layer)).flatMap(partsOf);
  for (const { score: _score, ...item } of tries) {
    if (c.layer !== "wall") {
      if (!insideRoom(room, footprint(item)) || partsOf(item).some((f) => taken.some((t) => overlaps(f, t)))) continue;
    }
    if (!layoutProblem(room, { ...layout, items: [...layout.items, item] })) return item;
  }
  return null;
}
