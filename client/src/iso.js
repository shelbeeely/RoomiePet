// Drawing the flat from its model (shared/home.js): floors, walls and every
// piece of furniture are boxes, rasterised here into pixel art -- flat faces
// lit from above and the left, a darker line where faces meet, a dark
// outline round each piece -- so a bed the builder turns or recolours is
// drawn as crisply as anything in the sprite sheet. Two cameras:
//
//   plan  the whole flat front-on from a little above, like a doll's house;
//         back walls of the flat stand full height, the walls inside are cut
//         down so they hide nothing (the Sims' walls-down)
//   iso   one room, isometric, turned a quarter at a time; the two far walls
//         stand, the near ones are cut to a stub
//
// Everything is in scene pixels, 16 to the foot; the canvas scales them up.
import {
  CATALOG, COLORWAYS, DOORS, FLAT, FLOORS, MATERIALS, ROOMS, WALLPAPERS, boxesOf, bounds, wallsOf,
} from "@shared/home.js";

export const PX = 16;
const PLAN_WALL = 4;      // ft: the flat's back walls in the plan
const PLAN_CUT = 1;       // ft: walls inside the flat, cut down
const ISO_WALL = 4.5;     // ft: a room's far walls
const ISO_CUT = 0.5;      // ft: its near walls
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
  if (w.pattern === "stars") return hash(a >> 2, h >> 2) > 0.97 ? [255, 240, 190] : base;
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

export function planCamera() {
  const top = PLAN_WALL * PX;
  return {
    kind: "plan",
    key: "plan",
    width: FLAT.w * PX,
    height: FLAT.d * PX + top,
    project: (x, y, z) => [x * PX, y * PX + top - z * PX],
    unproject: (sx, sy) => [sx / PX, (sy - top) / PX],
    // The viewer is towards +y (and up): what is further back is drawn first.
    behind: (a, b) => a.y1 <= b.y0 + 1e-6 || a.z1 <= b.z0 + 1e-6,
    depth: (x, y) => y,
    faces: { top: 1.04, s: 0.8 },
    wallHeight: (wall) => (wall.side === "s" && wall.outer ? 0.5 : wall.outer ? PLAN_WALL : PLAN_CUT),
  };
}

export function isoCamera(room, rot) {
  const turn = TURNS[rot];
  const b = bounds(room);
  const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => turn(x, y));
  const sxs = corners.map(([x, y]) => (x - y) * PX);
  const sys = corners.map(([x, y]) => ((x + y) * PX) / 2);
  const margin = 10;
  const ox = -Math.min(...sxs) + margin;
  const oy = -Math.min(...sys) + (ISO_WALL + 0.6) * PX + margin;
  const width = Math.ceil(Math.max(...sxs) - Math.min(...sxs) + margin * 2);
  const height = Math.ceil(Math.max(...sys) - Math.min(...sys) + (ISO_WALL + 0.6) * PX + margin * 2);
  // Which way, in the flat, is towards the viewer: (1, 1) in turned coordinates.
  const toward = [[1, 1], [-1, 1], [-1, -1], [1, -1]][rot];
  const ext = (box) => {
    const [ax, ay] = turn(box.x0, box.y0);
    const [bx, by] = turn(box.x1, box.y1);
    return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) };
  };
  const shade = { top: 1.04 };
  // The two side faces we see: the one whose normal turns to +y is on the left (mid), +x on the right (dark).
  for (const [side, n] of [["n", [0, -1]], ["s", [0, 1]], ["w", [-1, 0]], ["e", [1, 0]]]) {
    const [tx, ty] = turn(n[0], n[1]);
    if (ty > 0.5) shade[side] = 0.88;
    if (tx > 0.5) shade[side] = 0.72;
  }
  return {
    kind: "iso",
    key: `iso:${room}:${rot}`,
    room,
    rot,
    width,
    height,
    toward,
    project: (x, y, z) => {
      const [u, v] = turn(x, y);
      return [ox + (u - v) * PX, oy + ((u + v) * PX) / 2 - z * PX];
    },
    unproject: (sx, sy) => {
      const d = (sx - ox) / PX;          // u - v
      const s = ((sy - oy) * 2) / PX;    // u + v
      const u = (s + d) / 2;
      const v = (s - d) / 2;
      // Turn back.
      return [[u, v], [-v, u], [-u, -v], [v, -u]][rot];
    },
    behind: (a, b) => {
      const ea = ext(a);
      const eb = ext(b);
      return ea.x1 <= eb.x0 + 1e-6 || ea.y1 <= eb.y0 + 1e-6 || a.z1 <= b.z0 + 1e-6;
    },
    depth: (x, y) => {
      const [u, v] = turn(x, y);
      return u + v;
    },
    faces: shade,
    far: (wall) => {
      const n = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[wall.side];
      return n[0] * toward[0] + n[1] * toward[1] < 0;
    },
    wallHeight(wall) {
      return this.far(wall) ? ISO_WALL : ISO_CUT;
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
export function pieceSprite(item, cam, tint = null) {
  const key = `${cam.key}|${JSON.stringify(item)}|${tint || ""}`;
  return cached(key, () => {
    const boxes = boxesOf(item);
    const r = new Raster(...screenBounds(boxes, cam));
    drawBoxes(r, boxes, cam, (box) => {
      const c = colorOf(box.mat, item);
      return tint ? [c[0] * 0.5 + tint[0] * 0.5, c[1] * 0.5 + tint[1] * 0.5, c[2] * 0.5 + tint[2] * 0.5] : c;
    });
    r.outline();
    return r.toCanvas();
  });
}

/** The world box a piece takes up, for putting it in order with everything else. */
export function pieceBox(item) {
  const boxes = boxesOf(item);
  return {
    x0: Math.min(...boxes.map((b) => b.x0)), x1: Math.max(...boxes.map((b) => b.x1)),
    y0: Math.min(...boxes.map((b) => b.y0)), y1: Math.max(...boxes.map((b) => b.y1)),
    z0: Math.min(...boxes.map((b) => b.z0)), z1: Math.max(...boxes.map((b) => b.z1)),
  };
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

/** A wall's sprite: wallpaper on the face towards its room, plain everywhere else. */
export function wallSprite(wall, height, paper, cam) {
  const key = `${cam.key}|wall|${JSON.stringify(wall)}|${height}|${paper}`;
  return cached(key, () => {
    const box = wallBox(wall, height);
    const r = new Raster(...screenBounds([box], cam));
    const inner = { n: "s", s: "n", w: "e", e: "w" }[wall.side];
    drawBoxes(r, [box], cam, (_b, side) => {
      if (side === "top") return WALL_TOP;
      if (side !== inner || !paper) return OUTSIDE;
      const shade = cam.faces[side];
      // a runs along the wall from its start, b up it.
      const along0 = side === "s" || side === "n" ? box.x0 : box.y0;
      const len = side === "s" || side === "n" ? box.x1 - box.x0 : box.y1 - box.y0;
      return (a, b) => mul(wallColor(paper, along0 + a * len, b * height), shade);
    }, { edge: 0 });
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
      for (const a of ROOMS[room].areas) {
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

/** Every wall of the flat once, for the plan: each room's back and left walls, and the flat's front and right. */
export function planWalls() {
  const out = [];
  for (const room of Object.keys(ROOMS)) {
    for (const w of wallsOf(room)) {
      if (w.side === "n" || w.side === "w" || w.outer) out.push({ ...w, room });
    }
  }
  return out;
}

