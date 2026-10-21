// Drawing the flat from its model (shared/home.js): floors, walls and every
// piece of furniture are boxes, rasterised here into pixel art -- flat faces
// lit from above and the left, a darker line where faces meet, a dark
// outline round each piece -- so a bed the builder turns or recolours is
// drawn as crisply as anything in the sprite sheet. One camera, a
// dollhouse: the whole flat or one room of it, front-on from a little above
// (so furniture faces us as the pets do), turned a quarter at a time to see
// it from any side. An isometric view was tried and dropped for it.
//
// Everything is in scene pixels, 16 to the foot; the canvas scales them up.
import {
  CATALOG, COLORWAYS, DOORS, FLAT, FLOORS, MATERIALS, PILLOWS, ROOMS, WALLPAPERS, boxesOf, bounds, partsOf, roomAt, wallsOf,
} from "@shared/home.js";

export const PX = 16;
const WALL = 4;           // ft: walls standing (the room is seen cut away above that)
const CUT = 1;            // ft: walls inside the flat, cut down
const NEAR = 0.5;         // ft: walls nearest us, cut to a stub
const DEPTH = 0.75;       // floors seen a little squashed, from a little above
// ft: furniture is cut away above this, as the walls are. Drawn whole, a 6.5 ft closet against
// the left wall stood up the screen as a tall panel over the bed behind it; cut, it reads as
// a closet seen from above, like everything else in a dollhouse.
export const CUTAWAY = WALL + 0.5;

/** A piece's boxes as drawn: anything above the cutaway is cut off -- for things on a wall,
 * or built in like a closet, where the walls are cut. */
function cutBoxes(item, part = null, hd = false) {
  const c = CATALOG[item.kind];
  const top = c.layer === "wall" || c.builtin ? WALL : CUTAWAY;
  let boxes = boxesOf(item, hd);
  if (part !== null) {
    // One arm of an L-desk: the boxes standing on it, drawn and put in order on their own, so a
    // chair in the crook of the L goes in front of one arm and behind the other.
    const r = partsOf(item)[part];
    const on = (b) => (b.x0 + b.x1) / 2 > r.x0 && (b.x0 + b.x1) / 2 < r.x1 && (b.y0 + b.y1) / 2 > r.y0 && (b.y0 + b.y1) / 2 < r.y1;
    boxes = boxes.filter(on);
  }
  return boxes.filter((b) => b.z0 < top).map((b) => (b.z1 > top ? { ...b, z1: top } : b));
}
const THICK = 0.25;       // ft: walls
const OUTLINE = [43, 34, 56];
const WALL_TOP = [59, 48, 73];
const OUTSIDE = [138, 127, 156];

// -- colours ---------------------------------------------------------------------------

function rgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const mul = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

export function colorOf(mat, item) {
  if (mat.startsWith("main")) {
    const base = rgb(COLORWAYS[item.color] || COLORWAYS.grey);
    if (mat.endsWith("^")) return mul(base, 1.14);
    if (mat.endsWith("_")) return mul(base, 0.8);
    return base;
  }
  const bedding = PILLOWS[item.color];
  if (bedding && mat === "pillow") return rgb(bedding.case);
  if (bedding && mat === "pillowPrint") return rgb(bedding.print);
  return rgb(MATERIALS[mat] || "#ff00ff");
}

// A cheap, steady hash for speckles and board shades.
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

export function floorColor(floor, x, y) {
  const f = FLOORS[floor] || FLOORS.oak;
  const base = rgb(f.base);
  const px = Math.floor(x * PX);
  const py = Math.floor(y * PX);
  if (f.pattern === "planks") {
    const row = Math.floor(y * 2);                      // boards half a foot wide
    const offset = (row * 1.7) % 4;
    const board = Math.floor((x + offset) / 4);
    if (py % 8 === 0) return mul(base, 0.78);          // the gap between rows
    if (Math.floor((x + offset) * PX) % (4 * PX) === 0) return mul(base, 0.8);
    return mul(base, 0.94 + hash(row, board) * 0.1);
  }
  if (f.pattern === "weathered") {
    // Long grey planks, each its own shade, with lighter and darker streaks along the grain.
    const row = Math.floor(y * 2);
    const offset = (row * 2.3) % 5;
    const board = Math.floor((x + offset) / 5);
    if (py % 8 === 0) return mul(base, 0.72);
    if (Math.floor((x + offset) * PX) % (5 * PX) === 0) return mul(base, 0.74);
    const tone = 0.86 + hash(row, board) * 0.26;
    const grain = hash(py, Math.floor(px / 6) + board * 31);
    return mul(base, tone * (grain > 0.9 ? 1.12 : grain < 0.08 ? 0.86 : 1));
  }
  if (f.pattern === "check") {
    if (px % PX === 0 || py % PX === 0) return mul(base, 0.86);
    return (Math.floor(x) + Math.floor(y)) % 2 ? mul(base, 0.9) : base;
  }
  if (f.pattern === "carpet") return mul(base, 0.95 + hash(px, py) * 0.08);
  return base;
}

export function wallColor(wall, along, z) {
  const w = WALLPAPERS[wall] || WALLPAPERS.butter;
  const base = rgb(w.base);
  if (z < 0.4) return z > 0.32 ? mul(base, 0.55) : mul(base, 0.68);   // the skirting
  const a = Math.floor(along * PX);
  const h = Math.floor(z * PX);
  if (w.pattern === "stripe") return Math.floor(along * 2) % 2 ? mul(base, 0.92) : base;
  if (w.pattern === "dots") {
    const ia = Math.floor(along * 2);
    const iz = Math.floor(z * 2);
    const da = along * 2 - ia - 0.5;
    const dz = z * 2 - iz - 0.5;
    return (ia + iz) % 2 === 0 && da * da + dz * dz < 0.06 ? mul(base, 1.12) : base;
  }
  if (w.pattern === "stars") return hash(a >> 1, h >> 1) > 0.985 ? [255, 240, 190] : base;
  if (w.pattern === "tile") {
    if (a % 8 === 0 || h % 8 === 0) return mul(base, 0.82);
    return base;
  }
  return base;
}

// -- cameras ---------------------------------------------------------------------------

// A quarter turn of the floor, so the room can be seen from each side.
const TURNS = [
  (x, y) => [x, y],
  (x, y) => [y, -x],
  (x, y) => [-x, -y],
  (x, y) => [-y, x],
];

/**
 * The dollhouse camera: the flat (or one room of it) seen front-on from a
 * little above, from whichever side rot turns it to. Floors are squashed a
 * little, walls and furniture fronts stand up full height, so pieces face
 * us as the pets do. The walls furthest from us stand; the ones nearest are
 * cut to a stub, and seeing the whole flat, every wall inside it is cut
 * down too so no room hides another (the Sims' walls-down).
 */
export function dollCamera(room = null, rot = 0) {
  const turn = TURNS[rot];
  const b = room ? bounds(room) : { x0: 0, x1: FLAT.w, y0: 0, y1: FLAT.d };
  const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => turn(x, y));
  const us = corners.map(([u]) => u);
  const vs = corners.map(([, v]) => v);
  const margin = room ? 8 : 0;
  const top = (WALL + 0.5) * PX + margin;
  const u0 = Math.min(...us);
  const v0 = Math.min(...vs);
  const width = Math.ceil((Math.max(...us) - u0) * PX + margin * 2);
  const height = Math.ceil((Math.max(...vs) - v0) * PX * DEPTH + top + margin + (room ? 4 : 0));
  // Which way, in the flat, is towards the viewer: +v once turned.
  const toward = [[0, 1], [-1, 0], [0, -1], [1, 0]][rot];
  const ext = (box) => {
    const [ax, ay] = turn(box.x0, box.y0);
    const [bx, by] = turn(box.x1, box.y1);
    return { v0: Math.min(ay, by), v1: Math.max(ay, by) };
  };
  const normal = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  const facing = (side) => normal[side][0] * toward[0] + normal[side][1] * toward[1];
  // We see the tops of things and the faces turned towards us.
  const faces = { top: 1.04 };
  for (const side of Object.keys(normal)) if (facing(side) > 0.5) faces[side] = 0.84;
  return {
    key: `doll:${room || "flat"}:${rot}`,
    room,
    rot,
    width,
    height,
    project: (x, y, z) => {
      const [u, v] = turn(x, y);
      return [margin + (u - u0) * PX, top + (v - v0) * PX * DEPTH - z * PX];
    },
    /** The point on the floor (or at height z) under a point on the screen. */
    unproject: (sx, sy, z = 0) => {
      const u = (sx - margin) / PX + u0;
      const v = (sy - top + z * PX) / (PX * DEPTH) + v0;
      return [[u, v], [-v, u], [-u, -v], [v, -u]][rot];
    },
    behind: (a, c) => ext(a).v1 <= ext(c).v0 + 1e-6 || a.z1 <= c.z0 + 1e-6,
    depth: (x, y) => turn(x, y)[1],
    faces,
    /** A wall at the back, as we look: its room side faces us. */
    far: (wall) => facing(wall.side) < -0.5,
    wallHeight(wall) {
      const f = facing(wall.side);
      if (f > 0.5) return room || wall.outer ? NEAR : CUT;   // nearest us: a stub
      if (room) return WALL;                                   // one room: its back and sides stand
      return wall.outer ? WALL : CUT;                          // the whole flat: only its outside walls
    },
  };
}

// -- the rasteriser ----------------------------------------------------------------------

class Raster {
  constructor(x0, y0, x1, y1) {
    this.ox = Math.floor(x0) - 2;
    this.oy = Math.floor(y0) - 2;
    this.w = Math.ceil(x1) - this.ox + 3;
    this.h = Math.ceil(y1) - this.oy + 3;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }

  set(px, py, c) {
    const x = px - this.ox;
    const y = py - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = 255;
  }

  /** The parallelogram p0 + a*(pu - p0) + b*(pv - p0), a and b in 0..1, coloured by color(a, b). */
  face(p0, pu, pv, color, edge = 0) {
    const ux = pu[0] - p0[0];
    const uy = pu[1] - p0[1];
    const vx = pv[0] - p0[0];
    const vy = pv[1] - p0[1];
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 0.5) return;           // seen edge-on
    const xs = [p0[0], pu[0], pv[0], pu[0] + vx];
    const ys = [p0[1], pu[1], pv[1], pu[1] + vy];
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    const du = Math.abs(det) / lv;             // pixels across the face along a
    const dv = Math.abs(det) / lu;
    for (let py = Math.floor(Math.min(...ys)); py <= Math.ceil(Math.max(...ys)); py++) {
      for (let px = Math.floor(Math.min(...xs)); px <= Math.ceil(Math.max(...xs)); px++) {
        const cx = px + 0.5 - p0[0];
        const cy = py + 0.5 - p0[1];
        const a = (cx * vy - cy * vx) / det;
        const b = (ux * cy - uy * cx) / det;
        if (a < -1e-6 || a > 1 + 1e-6 || b < -1e-6 || b > 1 + 1e-6) continue;
        let c = typeof color === "function" ? color(a, b) : color;
        if (edge && (a * du < 1 || (1 - a) * du < 1 || b * dv < 1 || (1 - b) * dv < 1)) c = mul(c, edge);
        this.set(px, py, c);
      }
    }
  }

  outline(c = OUTLINE) {
    const { w, h, data } = this;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] === 255;
    const add = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) add.push(x, y);
      }
    }
    for (let i = 0; i < add.length; i += 2) this.set(add[i] + this.ox, add[i + 1] + this.oy, c);
  }

  toCanvas() {
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(this.w, this.h) : Object.assign(document.createElement("canvas"), { width: this.w, height: this.h });
    canvas.getContext("2d").putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    return { canvas, ox: this.ox, oy: this.oy, w: this.w, h: this.h, data: this.data };
  }
}

/** The faces of a box the camera sees: [corner, along-a corner, along-b corner, side]. */
function facesOf(box, cam) {
  const { x0, x1, y0, y1, z0, z1 } = box;
  const P = cam.project;
  const out = [];
  for (const side of Object.keys(cam.faces)) {
    if (side === "top") out.push([P(x0, y0, z1), P(x1, y0, z1), P(x0, y1, z1), side]);
    if (side === "s") out.push([P(x0, y1, z0), P(x1, y1, z0), P(x0, y1, z1), side]);
    if (side === "n") out.push([P(x0, y0, z0), P(x1, y0, z0), P(x0, y0, z1), side]);
    if (side === "e") out.push([P(x1, y0, z0), P(x1, y1, z0), P(x1, y0, z1), side]);
    if (side === "w") out.push([P(x0, y0, z0), P(x0, y1, z0), P(x0, y0, z1), side]);
  }
  return out;
}

function screenBounds(boxes, cam) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) {
      const [sx, sy] = cam.project(x, y, z);
      x0 = Math.min(x0, sx);
      y0 = Math.min(y0, sy);
      x1 = Math.max(x1, sx);
      y1 = Math.max(y1, sy);
    }
  }
  return [x0, y0, x1, y1];
}

/** Back to front: a box goes after every box it is in front of. */
export function order(units, cam, key = (u) => u) {
  const n = units.length;
  const after = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = key(units[i]);
      const b = key(units[j]);
      if (cam.behind(a, b)) after[j].push(i);
      else if (cam.behind(b, a)) after[i].push(j);
      else {
        // Touching or one on the other (a pet on a bed): the higher, then the nearer, goes after.
        const da = a.z0 - b.z0;
        const nearer = cam.depth((a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2) - cam.depth((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
        if (da > 0.3 || (Math.abs(da) <= 0.3 && nearer > 0)) after[i].push(j);
        else after[j].push(i);
      }
    }
  }
  const out = [];
  const state = new Uint8Array(n);
  const visit = (i) => {
    if (state[i]) return;
    state[i] = 1;
    for (const j of after[i]) visit(j);
    out.push(units[i]);
  };
  for (let i = 0; i < n; i++) visit(i);
  return out;
}

function drawBoxes(r, boxes, cam, colorFor, { edge = 0.82 } = {}) {
  for (const box of order(boxes, cam)) {
    const thin = Math.min(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) < 0.1;
    for (const [p0, pu, pv, side] of facesOf(box, cam)) {
      const c = colorFor(box, side);
      if (!c) continue;
      r.face(p0, pu, pv, typeof c === "function" ? c : mul(c, cam.faces[side]), thin ? 0 : edge);
    }
  }
}

// -- what gets drawn -------------------------------------------------------------------

const cache = new Map();
function cached(key, make) {
  let v = cache.get(key);
  if (!v) {
    if (cache.size > 600) cache.clear();
    v = make();
    cache.set(key, v);
  }
  return v;
}

/** A piece of furniture as a sprite: {canvas, ox, oy, w, h, data} at scene pixels. */
export function pieceSprite(item, cam, tint = null, part = null, hd = false) {
  const key = `${cam.key}|${JSON.stringify(item)}|${tint || ""}|${part ?? ""}|${hd ? "hd" : ""}`;
  return cached(key, () => {
    const boxes = cutBoxes(item, part, hd);
    const view = hd ? hdCamera(cam) : cam;
    const r = new Raster(...screenBounds(boxes, view));
    drawBoxes(r, boxes, view, (box) => {
      const c = colorOf(box.mat, item);
      return tint ? [c[0] * 0.5 + tint[0] * 0.5, c[1] * 0.5 + tint[1] * 0.5, c[2] * 0.5 + tint[2] * 0.5] : c;
    });
    r.outline();
    return r.toCanvas();
  });
}

// A few pieces (the iMac G3, the Kuromi poster) are drawn sharp: at HD times the scene's
// resolution, in half-pixel boxes of their own (the catalog's hd), on a layer behind the scene
// that shows through where they stand. Everything else stays at the scene's pixel size, which
// is what keeps the frame rate (see HouseScene).
export const HD = 2;

/** The camera looking the same way at HD times the pixels. */
export function hdCamera(cam) {
  return { ...cam, key: `${cam.key}:hd`, project: (x, y, z) => cam.project(x, y, z).map((a) => a * HD) };
}

/** A piece drawn sharp, its canvas and origin in HD pixels; null for a piece without an hd. */
export function hdSprite(item, cam) {
  return CATALOG[item.kind].hd ? pieceSprite(item, cam, null, null, true) : null;
}

/** The world box a piece takes up, for putting it in order with everything else. */
export function pieceBox(item, part = null) {
  const boxes = cutBoxes(item, part);
  return {
    x0: Math.min(...boxes.map((b) => b.x0)), x1: Math.max(...boxes.map((b) => b.x1)),
    y0: Math.min(...boxes.map((b) => b.y0)), y1: Math.max(...boxes.map((b) => b.y1)),
    z0: Math.min(...boxes.map((b) => b.z0)), z1: Math.max(...boxes.map((b) => b.z1)),
  };
}

/**
 * Where a wall piece goes in the drawing order: in the wall itself, not
 * sticking out of it. A window's sill reaches into the room, so ordered by
 * its own box it tied with a dresser against the same wall and was drawn
 * over it; in the wall, everything standing in the room is in front of it.
 */
export function wallPieceBox(item) {
  const b = pieceBox(item);
  const { side, line } = item;
  if (side === "n") return { ...b, y0: line - 0.2, y1: line };
  if (side === "s") return { ...b, y0: line, y1: line + 0.2 };
  if (side === "w") return { ...b, x0: line - 0.2, x1: line };
  return { ...b, x0: line, x1: line + 0.2 };
}

/** A wall as a box beside its line, outside the room it bounds, a little longer to close the corners. */
export function wallBox(wall, height) {
  const { side, line, from, to } = wall;
  const a = from - THICK;
  const b = to + THICK;
  if (side === "n") return { x0: a, x1: b, y0: line - THICK, y1: line, z0: 0, z1: height };
  if (side === "s") return { x0: a, x1: b, y0: line, y1: line + THICK, z0: 0, z1: height };
  if (side === "w") return { x0: line - THICK, x1: line, y0: a, y1: b, z0: 0, z1: height };
  return { x0: line, x1: line + THICK, y0: a, y1: b, z0: 0, z1: height };
}

/**
 * A wall's sprite: wallpaper on the face towards its room, and on the other
 * face the next room's (outside walls are plain).
 */
export function wallSprite(wall, height, paper, cam, nextPaper = null) {
  const key = `${cam.key}|wall|${JSON.stringify(wall)}|${height}|${paper}|${nextPaper}`;
  return cached(key, () => {
    const box = wallBox(wall, height);
    const r = new Raster(...screenBounds([box], cam));
    const inner = { n: "s", s: "n", w: "e", e: "w" }[wall.side];
    drawBoxes(r, [box], cam, (_b, side) => {
      if (side === "top") return WALL_TOP;
      const which = side === inner ? paper : nextPaper;
      if (!which) return OUTSIDE;
      const shade = cam.faces[side];
      // a runs along the wall from its start, b up it.
      const along0 = side === "s" || side === "n" ? box.x0 : box.y0;
      const len = side === "s" || side === "n" ? box.x1 - box.x0 : box.y1 - box.y0;
      return (a, b) => mul(wallColor(which, along0 + a * len, b * height), shade);
    }, { edge: 0 });
    return r.toCanvas();
  });
}

/**
 * A built-in closet (Bedroom 2's), seen as the room's walls show it: thin walls round it (the
 * room's own, drawn with the rest), its doors in the front one, and from above, through the
 * cutaway, the inside -- a rail of hanging clothes. Drawn as a solid block of wall it read as
 * a dark slab from the side.
 */
const CLOTHES = ["#7fa8d8", "#e7a1b6", "#f0c75e", "#55506a", "#a8c99a", "#efeae2", "#ee8f6f", "#c3b3e0"];

export function closetInside(bi) {
  const along = bi.doors === "n" || bi.doors === "s";
  const len = along ? bi.x1 - bi.x0 : bi.y1 - bi.y0;
  const depth = along ? bi.y1 - bi.y0 : bi.x1 - bi.x0;
  const mid = depth / 2;
  const boxes = [];
  const put = (u0, u1, v0, v1, z0, z1, color) => {
    const [x0, x1, y0, y1] = along ? [bi.x0 + u0, bi.x0 + u1, bi.y0 + v0, bi.y0 + v1] : [bi.x0 + v0, bi.x0 + v1, bi.y0 + u0, bi.y0 + u1];
    boxes.push({ x0, x1, y0, y1, z0, z1, color });
  };
  put(0.1, len - 0.1, mid - 0.05, mid + 0.05, 5.4, 5.5, "#b8c0cc");                  // the rail
  let u = 0.3;
  for (let k = 0; u + 0.3 < len - 0.2; k++) {
    const w = 0.28 + ((k * 7) % 3) * 0.06;
    put(u, u + w, mid - 0.8, mid + 0.8, 2.2 + ((k * 5) % 3) * 0.4, 5.3, CLOTHES[k % CLOTHES.length]);
    u += w + 0.12;
  }
  return boxes;
}

/** The closet's doors: shut, two leaves across its front; open, swung out into the room on
 * their hinges at each end (the 3 ft kept clear in front is where they go). */
export function closetDoors(bi, open = false) {
  const along = bi.doors === "n" || bi.doors === "s";
  const a0 = along ? bi.x0 : bi.y0;
  const len = along ? bi.x1 - bi.x0 : bi.y1 - bi.y0;
  const face = { n: bi.y0, s: bi.y1, w: bi.x0, e: bi.x1 }[bi.doors];
  const out = bi.doors === "n" || bi.doors === "w" ? -1 : 1;
  const leaf = (len - 0.3) / 2;
  const boxes = [];
  const part = (u, w, z, h, depth, color) => {
    const [p0, p1] = [face, face + out * depth].sort((m, n) => m - n);
    boxes.push(along
      ? { x0: a0 + u, x1: a0 + u + w, y0: p0, y1: p1, z0: z, z1: z + h, color }
      : { x0: p0, x1: p1, y0: a0 + u, y1: a0 + u + w, z0: z, z1: z + h, color });
  };
  const style = bi.style || "boards";
  if (style === "sliding") {
    // Two six-panel doors on a track (Bedroom 1's): open, one slides behind the other.
    const half = (len - 0.2) / 2;
    const door = (u, inset) => {
      part(u, half, 0, 6.67, 0.04 + inset, "#f4f2ed");
      for (const [z, h] of [[0.4, 1.9], [2.6, 1.2], [4.2, 1.9]]) {
        part(u + 0.2, half / 2 - 0.3, z, h, 0.06 + inset, "#e3e0d8");
        part(u + half / 2 + 0.1, half / 2 - 0.3, z, h, 0.06 + inset, "#e3e0d8");
      }
      part(u + (u < len / 2 ? half - 0.25 : 0.12), 0.12, 3, 0.12, 0.08 + inset, "#9a958a");
    };
    part(0, 0.1, 0, 6.8, 0.1, "#e6e3dc");
    part(len - 0.1, 0.1, 0, 6.8, 0.1, "#e6e3dc");
    if (open) {
      door(len - 0.1 - half, 0);
      door(len - 0.1 - half - 0.05, 0.1);
    } else {
      door(0.1, 0.1);
      door(0.1 + half, 0);
    }
    return boxes;
  }
  if (style === "louvered") {
    // Four bifold panels with slats (the living room's); open, folded back at each end.
    const panel = (len - 0.2) / 4;
    const slats = (u, w, depth, along) => {
      for (let z = 0.6; z < 6.2; z += 0.22) {
        if (along) part(u + 0.1, w - 0.2, z, 0.06, depth + 0.02, "#dcd8cf");
      }
    };
    part(0, 0.1, 0, 6.8, 0.1, "#e6e3dc");
    part(len - 0.1, 0.1, 0, 6.8, 0.1, "#e6e3dc");
    if (open) {
      part(0.1, 0.12, 0, 6.67, panel * 0.9, "#f4f2ed");
      part(len - 0.22, 0.12, 0, 6.67, panel * 0.9, "#f4f2ed");
      return boxes;
    }
    for (let k = 0; k < 4; k++) {
      const u = 0.1 + k * panel;
      part(u, panel - 0.03, 0, 6.67, 0.05, "#f4f2ed");
      slats(u, panel, 0.05, true);
    }
    part(0.1 + panel * 2 - 0.2, 0.08, 3.1, 0.12, 0.09, "#9a958a");
    part(0.1 + panel * 2 + 0.12, 0.08, 3.1, 0.12, 0.09, "#9a958a");
    return boxes;
  }
  if (open) {
    // Jambs at each end, and each leaf standing out from its hinge, square to the wall.
    part(0, 0.1, 0, 6.8, 0.1, "#e6e3dc");
    part(len - 0.1, 0.1, 0, 6.8, 0.1, "#e6e3dc");
    part(0.1, 0.06, 0, 6.67, leaf, "#f4f2ed");
    part(len - 0.16, 0.06, 0, 6.67, leaf, "#f4f2ed");
    return boxes;
  }
  // Each leaf is boards standing side by side (white, as in the photo), the seams between
  // them a shade darker, a small knob each side of where the leaves meet.
  for (const u of [0.1, 0.2 + leaf]) {
    part(u, leaf, 0, 6.67, 0.05, "#f4f2ed");
    const boards = Math.round(leaf / 0.45);
    for (let k = 1; k < boards; k++) part(u + (leaf * k) / boards - 0.02, 0.04, 0.05, 6.55, 0.06, "#d9d5cc");
  }
  part(len / 2 - 0.2, 0.08, 3.2, 0.15, 0.1, "#8a8478");
  part(len / 2 + 0.12, 0.08, 3.2, 0.15, 0.1, "#8a8478");
  return boxes;
}

/** Boxes (with a colour each) drawn as one sprite, cut off at `top`. */
export function boxesSprite(key, boxes, top, cam) {
  return cached(`${cam.key}|${key}|${top}`, () => {
    const cut = boxes.filter((b) => b.z0 < top).map((b) => ({ ...b, z1: Math.min(b.z1, top) }));
    const r = new Raster(...screenBounds(cut.length ? cut : [{ x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 }], cam));
    drawBoxes(r, cut, cam, (b) => rgb(b.color));
    if (cut.length) r.outline();
    return r.toCanvas();
  });
}

/** The floors (and the rugs on them) of some rooms, with the thresholds of their doors: drawn first, once. */
export function floorSprite(rooms, layouts, cam) {
  const key = `${cam.key}|floor|${rooms.join()}|${JSON.stringify(rooms.map((r) => [layouts[r].floor, layouts[r].items.filter((i) => CATALOG[i.kind].layer === "rug")]))}`;
  return cached(key, () => {
    const corners = [];
    for (const room of rooms) for (const a of ROOMS[room].areas) corners.push({ x0: a.x0 - 0.5, x1: a.x1 + 0.5, y0: a.y0 - 0.5, y1: a.y1 + 0.5, z0: 0, z1: 0 });
    const r = new Raster(...screenBounds(corners, cam));
    for (const room of rooms) {
      const floor = layouts[room].floor;
      for (const a of [...ROOMS[room].areas, ...(ROOMS[room].builtins || [])]) {
        const P = cam.project;
        r.face(P(a.x0, a.y0, 0), P(a.x1, a.y0, 0), P(a.x0, a.y1, 0), (u, v) => floorColor(floor, a.x0 + u * (a.x1 - a.x0), a.y0 + v * (a.y1 - a.y0)));
      }
    }
    // Thresholds: the floor goes on through the doorway.
    for (const d of DOORS) {
      if (!d.rooms.some((x) => rooms.includes(x))) continue;
      const box = d.axis === "x"
        ? { x0: d.at - THICK, x1: d.at + THICK, y0: d.from, y1: d.to }
        : { x0: d.from, x1: d.to, y0: d.at - THICK, y1: d.at + THICK };
      const P = cam.project;
      r.face(P(box.x0, box.y0, 0), P(box.x1, box.y0, 0), P(box.x0, box.y1, 0), mul(rgb(MATERIALS.wood), 0.85));
    }
    const boxes = [];
    const owner = new Map();
    for (const room of rooms) {
      for (const it of layouts[room].items) {
        if (CATALOG[it.kind].layer !== "rug") continue;
        for (const b of boxesOf(it)) {
          boxes.push(b);
          owner.set(b, it);
        }
      }
    }
    drawBoxes(r, boxes, cam, (b) => colorOf(b.mat, owner.get(b)), { edge: 0.9 });
    return r.toCanvas();
  });
}


