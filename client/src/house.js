// How pets get about the flat (shared/home.js has the flat itself): where
// each one heads for how it is, and the way there round the furniture and
// through the doors, on a half-foot grid. Rooms are rearranged in the
// builder, so nothing here knows where a bed is -- it looks in the layouts.
// Pure, so it is testable.
import { CATALOG, DOORS, FLAT, ROOMS, doorAt, footprint, layoutOf, roomAt, spotsOf } from "@shared/home.js";

export const CELL = 0.5;
const GW = FLAT.w / CELL;
const GH = FLAT.d / CELL;

export function bedroomOf(index) {
  return index % 2 === 0 ? "bedA" : "bedB";
}

/** Every room's layout: the household's where they made one, how the flat came otherwise. */
export function allLayouts(saved) {
  return Object.fromEntries(Object.keys(ROOMS).map((r) => [r, layoutOf(saved, r)]));
}

/** The walkable grid: which room each cell is in, and whether furniture stands on it. */
export function gridOf(layouts) {
  const room = new Array(GW * GH).fill(null);
  const blocked = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      room[j * GW + i] = roomAt((i + 0.5) * CELL, (j + 0.5) * CELL);
      if (!room[j * GW + i]) blocked[j * GW + i] = 1;
    }
  }
  for (const r of Object.keys(ROOMS)) {
    for (const it of layouts[r].items) {
      if (CATALOG[it.kind].layer !== "solid") continue;
      const f = footprint(it);
      for (let j = Math.floor(f.y0 / CELL); j < Math.ceil(f.y1 / CELL); j++) {
        for (let i = Math.floor(f.x0 / CELL); i < Math.ceil(f.x1 / CELL); i++) {
          if (i >= 0 && j >= 0 && i < GW && j < GH) blocked[j * GW + i] = 1;
        }
      }
    }
  }
  return { room, blocked };
}

const cellOf = (x, y) => [Math.min(GW - 1, Math.max(0, Math.floor(x / CELL))), Math.min(GH - 1, Math.max(0, Math.floor(y / CELL)))];
const centre = (i, j) => ({ x: (i + 0.5) * CELL, y: (j + 0.5) * CELL });
export const free = (g, i, j) => i >= 0 && j >= 0 && i < GW && j < GH && !g.blocked[j * GW + i];

/** Whether a pet can step from one cell to the one beside it: same room, or through a door. */
function step(g, i, j, di, dj) {
  const a = j * GW + i;
  const ni = i + di;
  const nj = j + dj;
  if (!free(g, ni, nj)) return false;
  const b = nj * GW + ni;
  if (di && dj) return step(g, i, j, di, 0) && step(g, i + di, j, 0, dj) && step(g, i, j, 0, dj) && step(g, i, j + dj, di, 0);
  if (g.room[a] === g.room[b]) return true;
  if (di) return !!doorAt("x", Math.max(i, ni) * CELL, (j + 0.5) * CELL);
  return !!doorAt("y", Math.max(j, nj) * CELL, (i + 0.5) * CELL);
}

/** The nearest free cell to a point, keeping to its room when it can. */
export function nearestFree(g, x, y) {
  const [ci, cj] = cellOf(x, y);
  const want = roomAt(x, y);
  let best = null;
  for (let r = 0; r < 12 && !best; r++) {
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !free(g, i, j)) continue;
        const c = centre(i, j);
        const d = Math.hypot(c.x - x, c.y - y) + (g.room[j * GW + i] === want ? 0 : 100);
        if (!best || d < best.d) best = { i, j, d };
      }
    }
  }
  return best ? [best.i, best.j] : [ci, cj];
}

/** A* from one point to another; the points to walk through, ending at the goal itself. */
export function findPath(g, from, to) {
  const [si, sj] = free(g, ...cellOf(from.x, from.y)) ? cellOf(from.x, from.y) : nearestFree(g, from.x, from.y);
  const [gi, gj] = free(g, ...cellOf(to.x, to.y)) ? cellOf(to.x, to.y) : nearestFree(g, to.x, to.y);
  const start = sj * GW + si;
  const goal = gj * GW + gi;
  const cost = new Float32Array(GW * GH).fill(Infinity);
  const prev = new Int32Array(GW * GH).fill(-1);
  const open = [[0, start]];
  cost[start] = 0;
  const h = (k) => Math.hypot((k % GW) - gi, Math.floor(k / GW) - gj);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, cur] = open.splice(bi, 1)[0];
    if (cur === goal) break;
    const ci = cur % GW;
    const cj = Math.floor(cur / GW);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if ((!di && !dj) || !step(g, ci, cj, di, dj)) continue;
        const n = (cj + dj) * GW + ci + di;
        const c = cost[cur] + (di && dj ? Math.SQRT2 : 1);
        if (c < cost[n]) {
          cost[n] = c;
          prev[n] = cur;
          open.push([c + h(n), n]);
        }
      }
    }
  }
  if (prev[goal] === -1 && goal !== start) return [{ x: to.x, y: to.y }];   // no way there: walk straight
  const cells = [];
  for (let k = goal; k !== -1; k = prev[k]) cells.unshift(k);
  const pts = cells.map((k) => centre(k % GW, Math.floor(k / GW)));
  return [...smooth(g, pts), { x: to.x, y: to.y, z: to.z || 0 }];
}

/** Whether a pet can walk straight from a to b: every cell on the way steppable from the last. */
function clear(g, a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 3));
  let [pi, pj] = cellOf(a.x, a.y);
  for (let k = 1; k <= n; k++) {
    const [i, j] = cellOf(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
    if (i !== pi || j !== pj) {
      if (Math.abs(i - pi) > 1 || Math.abs(j - pj) > 1 || !step(g, pi, pj, i - pi, j - pj)) return false;
      [pi, pj] = [i, j];
    }
  }
  return true;
}

function smooth(g, pts) {
  if (pts.length < 3) return pts.slice(1);
  const out = [];
  let a = pts[0];
  let k = 1;
  while (k < pts.length) {
    let far = k;
    while (far + 1 < pts.length && clear(g, a, pts[far + 1])) far++;
    out.push(pts[far]);
    a = pts[far];
    k = far + 1;
  }
  return out;
}

// -- where pets go -------------------------------------------------------------------------

function itemsIn(layouts, room, test) {
  return layouts[room].items.filter((it) => test(CATALOG[it.kind], it));
}

/** Where pets sleep in a bedroom: pet beds first, then the bed, then a comfy spot. */
export function sleepSpots(layouts, room) {
  const spots = [];
  for (const it of itemsIn(layouts, room, (c) => c.pets)) spots.push(...spotsOf(it));
  for (const it of itemsIn(layouts, room, (c) => c.bed)) spots.push(...spotsOf(it));
  for (const it of itemsIn(layouts, room, (c) => c.spots && !c.pets && !c.bed)) spots.push(...spotsOf(it));
  return spots.map((s) => ({ ...s, room }));
}

export function bedSpot(layouts, g, index) {
  const room = bedroomOf(index);
  const spots = sleepSpots(layouts, room);
  const slot = Math.floor(index / 2);
  if (slot < spots.length) return spots[slot];
  return wanderSpot(g, room, () => ((slot * 0.37) % 1));
}

/** The bowl (wherever someone put it) and a place beside it for each pet. */
export function bowlOf(layouts) {
  for (const room of ["main", ...Object.keys(ROOMS)]) {
    const it = layouts[room].items.find((i) => CATALOG[i.kind].bowl);
    if (it) return { room, item: it, ...centreOf(it) };
  }
  return null;
}

const centreOf = (it) => {
  const f = footprint(it);
  return { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 };
};

/** Free cells round a point, nearest first, in its room. */
function around(g, x, y, room) {
  const out = [];
  const [ci, cj] = cellOf(x, y);
  for (let j = cj - 6; j <= cj + 6; j++) {
    for (let i = ci - 6; i <= ci + 6; i++) {
      if (!free(g, i, j) || g.room[j * GW + i] !== room) continue;
      const c = centre(i, j);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d >= 1) out.push({ ...c, d });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

export function bowlSpot(layouts, g, index) {
  const bowl = bowlOf(layouts);
  if (!bowl) return wanderSpot(g, "main", Math.random);
  const ring = around(g, bowl.x, bowl.y, bowl.room);
  const spot = ring[(index * 3) % Math.max(1, ring.length)] || bowl;
  return { room: bowl.room, x: spot.x, y: spot.y };
}

export function bathSpot(layouts, g, index) {
  const tub = layouts.bath.items.find((i) => i.kind === "bathtub");
  const at = tub ? centreOf(tub) : { x: 25.5, y: 4.5 };
  const ring = around(g, at.x, at.y, "bath");
  const spot = ring[(index * 2) % Math.max(1, ring.length)] || at;
  return { room: "bath", x: spot.x, y: spot.y };
}

/** A random free spot in a room. */
export function wanderSpot(g, room, rand = Math.random) {
  const cells = [];
  for (let k = 0; k < GW * GH; k++) if (g.room[k] === room && !g.blocked[k]) cells.push(k);
  if (!cells.length) return { room, ...centre(0, 0) };
  const k = cells[Math.floor(rand() * cells.length) % cells.length];
  return { room, ...centre(k % GW, Math.floor(k / GW)) };
}

/** Somewhere comfy to sit a while: a sofa, a beanbag, an armchair. */
function comfySpot(layouts, room, rand) {
  const spots = itemsIn(layouts, room, (c) => c.spots && !c.pets && !c.bed).flatMap(spotsOf);
  return spots.length ? { room, ...spots[Math.floor(rand() * spots.length) % spots.length] } : null;
}

/**
 * Where a pet heads, from how it is and what just happened:
 *   asleep -> its bed; a chore that fed it -> the bowl; one that cleaned it ->
 *   the bathroom; hungry -> about the bowl; grubby -> the bathroom;
 *   sad or poorly -> its own room; otherwise mostly the living room, now and
 *   then up on the sofa.
 */
export function destination(layouts, g, cond, effect, index, rand = Math.random) {
  if (cond.state === "egg") return null;
  if (cond.state === "asleep") return bedSpot(layouts, g, index);
  if (effect === "eat") return bowlSpot(layouts, g, index);
  if (effect === "clean") return bathSpot(layouts, g, index);
  if (cond.flags?.hungry && rand() < 0.7) {
    const bowl = bowlOf(layouts);
    if (bowl) {
      const ring = around(g, bowl.x, bowl.y, bowl.room);
      if (ring.length) return { room: bowl.room, ...ring[Math.floor(rand() * Math.min(ring.length, 30))] };
    }
  }
  if (cond.flags?.grubby && rand() < 0.6) return wanderSpot(g, "bath", rand);
  if (cond.state === "sad" || cond.state === "poorly") return wanderSpot(g, bedroomOf(index), rand);
  const r = rand();
  const room = r < 0.6 ? "main" : r < 0.85 ? bedroomOf(index) : r < 0.93 ? bedroomOf(index + 1) : "bath";
  if (rand() < 0.2) {
    const comfy = comfySpot(layouts, room, rand);
    if (comfy) return comfy;
  }
  return wanderSpot(g, room, rand);
}

export { DOORS, roomAt };
