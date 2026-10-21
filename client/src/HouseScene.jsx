// The shared apartment: every roommate's pet in a 750 sq ft flat -- two
// bedrooms on the left opening onto the kitchen and living room, the
// bathroom and laundry in the back right corner. It's a dollhouse: the
// whole flat front-on from a little above, turned to see it from any side;
// tap a room (or its chip) to see it alone, and to arrange it in the room
// builder. Pets walk between rooms round the furniture: to their bed at
// night, to the bowl when their person did a kitchen chore, to the bath
// after a cleaning one, mostly about the living room otherwise. Where they
// walk is decided here, on each phone; how they are comes from the server.
import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, ROOMS, footprint, layoutProblem, postBox, snap, wallSpotNear, wallsOf } from "@shared/home.js";
import { animFor, draw, frameAt, petKey } from "./sprites.js";
import { HD, PX, boxesSprite, closetDoors, closetInside, dollCamera, floorSprite, hdSprite, order, pieceBox, pieceSprite, wallBox, wallPieceBox, wallSprite } from "./dollhouse.js";
import { allLayouts, bedroomOf, destination, findPath, gridOf, roomAt } from "./house.js";
import RoomBuilder from "./RoomBuilder.jsx";
import Blueprint from "./Blueprint.jsx";

const SPRITE = 64;
const BG = "#2a2236";
const rand = (a, b) => a + Math.random() * (b - a);

// What a pet is doing decides where it goes; when that changes, it sets off.
function modeOf(cond, effect) {
  if (cond.state === "egg") return "egg";
  if (cond.state === "asleep") return "sleep";
  if (effect === "eat" || effect === "clean") return effect;
  return "wander";
}

function walkerFor(map, id, i) {
  let w = map.get(id);
  if (!w) {
    const start = { x: 13 + ((i * 3.1) % 6), y: 15 + ((i * 2.3) % 7) };
    w = { ...start, z: 0, room: roomAt(start.x, start.y), path: [], mode: null, flip: false, rest: rand(0.5, 3) };
    map.set(id, w);
  }
  return w;
}

/** The room on the other side of a wall, if any. */
function beyond(wall) {
  const mid = (wall.from + wall.to) / 2;
  const [x, y] = { n: [mid, wall.line - 0.5], s: [mid, wall.line + 0.5], w: [wall.line - 0.5, mid], e: [wall.line + 0.5, mid] }[wall.side];
  return roomAt(x, y);
}

/**
 * The part of the scene that doesn't move -- floors, walls, furniture -- put
 * together once for a layout and a view: a canvas, the pieces in drawing
 * order with where each lands on the screen (so a pet can have what stands
 * in front of it drawn over it again), what a tap can pick, and the lamps.
 *
 * A piece drawn sharp (the catalog's hd: the iMac G3) is cut out of the
 * canvas where it lands in the drawing order instead of drawn on it, and drawn at HD times the
 * pixels on a canvas of its own (hd) that the scene's is laid over: whatever stands in front of
 * it is drawn after, over the hole, so it still hides what it should, pets included.
 */
function stillScene(layouts, cam, open) {
  const canvas = document.createElement("canvas");
  canvas.width = cam.width;
  canvas.height = cam.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cam.width, cam.height);
  const blit = (sp) => ctx.drawImage(sp.canvas, sp.ox, sp.oy);
  const sharp = [];
  const punch = (sp) => {
    ctx.globalCompositeOperation = "destination-out";
    blit(sp);
    ctx.globalCompositeOperation = "source-over";
  };
  const rooms = cam.room ? [cam.room] : Object.keys(ROOMS);
  blit(floorSprite(rooms, layouts, cam));
  const units = [];
  const glows = [];
  const wallHits = [];
  const closets = [];   // closet doors, for a tap to open or shut
  for (const room of rooms) {
    for (const wall of wallsOf(room)) {
      // An open closet's front is its doorway, not a wall: the doors stand open in it.
      const closet = wall.builtin && !wall.inside && (ROOMS[room].builtins || []).find((bi) => bi.kind === wall.builtin);
      if (closet && open.includes(`${room}:${closet.kind}`) && wall.side === { n: "s", s: "n", w: "e", e: "w" }[closet.doors]) continue;
      const h = cam.wallHeight(wall);
      // A closet's walls are the room's own on both faces; others show the next room beyond.
      const next = wall.builtin ? (wall.inside ? null : room) : wall.outer ? null : beyond(wall);
      const sprite = wallSprite(wall, h, layouts[room].wall, cam, next && layouts[next].wall);
      // One room alone: its back and side walls are behind everything in it.
      const back = cam.room && !(h < 1);
      if (back) blit(sprite);
      else units.push({ kind: "wall", box: wallBox(wall, h), sprite });
      if (!cam.far(wall) || h < 3) continue;
      // Pictures, windows and clocks on the walls that stand.
      for (const it of layouts[room].items) {
        if (CATALOG[it.kind].layer !== "wall" || it.side !== wall.side || it.line !== wall.line || it.at < wall.from - 0.01 || it.at >= wall.to) continue;
        const sp = pieceSprite(it, cam);
        const hd = !!CATALOG[it.kind].hd;
        if (back) {
          if (hd) {
            punch(sp);
            sharp.push({ item: it, sprite: sp });
          } else blit(sp);
          wallHits.unshift({ room, item: it, sprite: sp });
        } else units.push({ kind: "piece", room, item: it, box: wallPieceBox(it), sprite: sp, hd });
      }
    }
  }
  // Built-in closets (Bedroom 2's): the walls round them are the room's, above; the doors in
  // the front wall, cut where that wall is cut; and only with the doors open, the clothes
  // on their rail inside.
  for (const room of rooms) {
    for (const bi of ROOMS[room].builtins || []) {
      const front = wallsOf(room).find((w) => w.builtin && w.side === { n: "s", s: "n", w: "e", e: "w" }[bi.doors]);
      const h = cam.wallHeight(front);
      const id = `${room}:${bi.kind}`;
      const isOpen = open.includes(id);
      // Like a wardrobe built into the wall: shut, it is closed over at the top and nothing
      // inside shows -- its doors have to be opened to see the clothes.
      const top = cam.room ? 4 : 1;
      const inside = isOpen
        ? closetInside(bi)
        : [{ x0: bi.x0, x1: bi.x1, y0: bi.y0, y1: bi.y1, z0: top - 0.12, z1: top, color: "#e8e5df" }];
      units.push({ kind: "wall", box: { x0: bi.x0 + 0.1, x1: bi.x1 - 0.1, y0: bi.y0 + 0.1, y1: bi.y1 - 0.1, z0: 0, z1: top }, sprite: boxesSprite(`closet-in|${JSON.stringify(bi)}|${isOpen}`, inside, top, cam) });
      const doors = closetDoors(bi, isOpen);
      const box = { x0: Math.min(...doors.map((d) => d.x0)), x1: Math.max(...doors.map((d) => d.x1)), y0: Math.min(...doors.map((d) => d.y0)), y1: Math.max(...doors.map((d) => d.y1)), z0: 0, z1: h };
      const sprite = boxesSprite(`closet-doors|${JSON.stringify(bi)}|${isOpen}`, doors, h, cam);
      units.push({ kind: "wall", box, sprite });
      closets.push({ id, sprite });
    }
  }
  // The posts holding the beam up across the living room, white, cut where the walls are.
  for (const room of rooms) {
    for (const p of ROOMS[room].posts || []) {
      const f = postBox(p);
      const top = cam.room ? 4 : 1;
      const box = { ...f, z0: 0, z1: top };
      units.push({ kind: "wall", box, sprite: boxesSprite(`post|${p.x},${p.y}`, [{ ...box, color: "#f1efea" }, { ...f, x0: f.x0 - 0.05, x1: f.x1 + 0.05, y0: f.y0 - 0.05, y1: f.y1 + 0.05, z0: 0, z1: 0.3, color: "#dedad2" }], top, cam) });
    }
  }
  for (const room of rooms) {
    for (const it of layouts[room].items) {
      const c = CATALOG[it.kind];
      if (c.layer === "rug" || c.layer === "wall") continue;
      if (c.parts) c.parts.forEach((_, k) => units.push({ kind: "piece", room, item: it, box: pieceBox(it, k), sprite: pieceSprite(it, cam, null, k) }));
      else units.push({ kind: "piece", room, item: it, box: pieceBox(it), sprite: pieceSprite(it, cam), hd: !!c.hd });
      if (c.glow) glows.push(it);
    }
  }
  const list = order(units, cam, (u) => u.box);
  for (const u of list) {
    if (u.hd) {
      punch(u.sprite);
      sharp.push(u);
    } else blit(u.sprite);
    Object.assign(u, { x0: u.sprite.ox, y0: u.sprite.oy, x1: u.sprite.ox + u.sprite.w, y1: u.sprite.oy + u.sprite.h });
  }
  // What a tap picks, top first: the pieces as drawn, the wall pieces behind them, then the rugs.
  const rugs = cam.room
    ? layouts[cam.room].items.filter((it) => CATALOG[it.kind].layer === "rug").reverse().map((it) => ({ room: cam.room, item: it, sprite: pieceSprite(it, cam) }))
    : [];
  const hits = [...list.filter((u) => u.kind === "piece").reverse(), ...wallHits, ...rugs];
  // The sharp layer: each piece first as the scene draws it, doubled, so no seam shows round
  // its edge, then sharp over that.
  let hd = null;
  if (sharp.length) {
    hd = document.createElement("canvas");
    hd.width = cam.width * HD;
    hd.height = cam.height * HD;
    const h = hd.getContext("2d");
    h.imageSmoothingEnabled = false;
    for (const { item, sprite } of sharp) {
      h.drawImage(sprite.canvas, sprite.ox * HD, sprite.oy * HD, sprite.w * HD, sprite.h * HD);
      const fine = hdSprite(item, cam);
      h.drawImage(fine.canvas, fine.ox, fine.oy);
    }
  }
  return { layouts, cam, open, canvas, units: list, hits, glows, closets, hd };
}

/** Round the piece that's picked up: its footprint on the floor, or for a wall piece where it hangs. */
function outlinePath(ctx, cam, item) {
  const P = cam.project;
  let pts;
  if (CATALOG[item.kind].layer === "wall") {
    const b = pieceBox(item);
    const ns = item.side === "n" || item.side === "s";
    const y = item.side === "n" ? b.y0 : b.y1;
    const x = item.side === "w" ? b.x0 : b.x1;
    pts = ns
      ? [P(b.x0, y, b.z0), P(b.x1, y, b.z0), P(b.x1, y, b.z1), P(b.x0, y, b.z1)]
      : [P(x, b.y0, b.z0), P(x, b.y1, b.z0), P(x, b.y1, b.z1), P(x, b.y0, b.z1)];
  } else {
    const f = footprint(item);
    pts = [P(f.x0, f.y0, 0), P(f.x1, f.y0, 0), P(f.x1, f.y1, 0), P(f.x0, f.y1, 0)];
  }
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

export default function HouseScene({ atlas, pets, effects, selectedId, onSelect, hour, layouts: saved, onSaveRoom }) {
  const canvas = useRef(null);
  const sharpLayer = useRef(null);
  const labels = useRef(new Map());
  const bubbles = useRef(new Map());
  const walkers = useRef(new Map());
  const drawn = useRef([]);
  const drag = useRef(null);
  const stillRef = useRef(null);
  const [view, setView] = useState({ room: null, rot: 0 });
  const [edit, setEdit] = useState(null); // {room, draft, sel, history}
  const [saving, setSaving] = useState(false);

  const layouts = useMemo(() => {
    const all = allLayouts(saved);
    if (edit) all[edit.room] = edit.draft;
    return all;
  }, [saved, edit]);
  // Closet doors opened with a tap (on this phone): "bedB:closet".
  const [open, setOpen] = useState([]);
  const toggleCloset = (id) => setOpen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const grid = useMemo(() => gridOf(layouts, open), [layouts, open]);
  const cam = useMemo(() => dollCamera(view.room, view.rot), [view]);

  const latest = useRef({});
  latest.current = { pets, effects, selectedId, hour, layouts, grid, cam, edit, open };

  // A new layout (saved, or being arranged): pets look again for their way.
  useEffect(() => {
    for (const w of walkers.current.values()) w.mode = null;
  }, [grid]);

  useEffect(() => {
    if (!atlas) return;
    const el = canvas.current;
    // The canvas is the scene at its own pixel-art size; the browser scales it up to the
    // screen (pixelated, in the compositor), so a frame only fills the scene's pixels.
    // Drawn at the screen's size (1440 x 1400 on a phone) a frame went on filling pixels:
    // a CPU slowed to a cheap phone's managed 13 frames a second, then 24 once the scene
    // was drawn small and copied up -- the copy alone cost that much.
    const ctx = el.getContext("2d");
    let size = "";
    const fit = () => {
      const c = latest.current.cam;
      if (size !== c.key) {
        size = c.key;
        el.width = c.width;
        el.height = c.height;
      }
    };
    let raf;
    let last = performance.now();
    let still = null;

    const frame = (nowMs) => {
      const dt = Math.min(0.1, (nowMs - last) / 1000);
      last = nowMs;
      const t = nowMs / 1000;
      const { pets, effects, selectedId, hour, layouts, grid, cam, edit, open } = latest.current;
      fit();
      const night = hour >= 20 || hour < 7;
      ctx.imageSmoothingEnabled = false;
      const blit = (sp) => ctx.drawImage(sp.canvas, sp.ox, sp.oy);
      // A sharp piece in front of a pet: cut out over it again, so the sharp layer shows there.
      const cover = (u) => {
        if (!u.hd) return blit(u.sprite);
        ctx.globalCompositeOperation = "destination-out";
        blit(u.sprite);
        ctx.globalCompositeOperation = "source-over";
      };

      // Where each pet goes now (all of them, seen or not, so they are where they should be).
      const placed = pets.map((p, i) => {
        const w = walkerFor(walkers.current, p.id, i);
        const effect = effects[p.id]?.until > Date.now() ? effects[p.id].kind : null;
        const state = p.cond.state;
        const mode = modeOf(p.cond, effect);
        if (mode !== w.mode) {
          w.mode = mode;
          const dest = mode === "egg" || mode === "wander" ? null : destination(layouts, grid, p.cond, effect, i);
          w.path = dest ? findPath(grid, w, dest) : [];
          w.rest = mode === "wander" ? rand(0.5, 2) : 0;
        } else if (mode === "wander" && !w.path.length) {
          w.rest -= dt * (state === "sad" || state === "poorly" ? 0.4 : 1);
          if (w.rest <= 0) {
            const dest = destination(layouts, grid, p.cond, null, i);
            if (dest) w.path = findPath(grid, w, dest);
            w.rest = rand(3, 9);
          }
        }
        let walking = false;
        const goalZ = w.path.length === 1 ? w.path[0].z || 0 : w.path.length ? 0 : w.z;
        w.z += Math.sign(goalZ - w.z) * Math.min(Math.abs(goalZ - w.z), dt * 4);
        if (w.path.length) {
          const goal = w.path[0];
          const dx = goal.x - w.x;
          const dy = goal.y - w.y;
          const dist = Math.hypot(dx, dy);
          const speed = state === "sad" || state === "poorly" ? 1.8 : 3.4;
          if (dist < 0.08) {
            w.path.shift();
          } else {
            const stepLen = Math.min(dist, speed * dt);
            const [ax, ay] = cam.project(w.x, w.y, 0);
            w.x += (dx / dist) * stepLen;
            w.y += (dy / dist) * stepLen;
            const [bx, by] = cam.project(w.x, w.y, 0);
            // Pets always face us: drawn facing left, mirrored when they head right on the screen.
            if (Math.abs(bx - ax) > 0.02) w.flip = bx > ax;
            walking = true;
          }
          w.room = roomAt(w.x, w.y) || w.room;
        }
        return { kind: "pet", p, w, walking, effect, box: { x0: w.x - 0.4, x1: w.x + 0.4, y0: w.y - 0.4, y1: w.y + 0.4, z0: w.z, z1: w.z + 2.5 } };
      });

      // The room(s) on show: kept, and only put together again for a new layout or view.
      if (!still || still.layouts !== layouts || still.cam !== cam || still.open !== open) {
        still = stillScene(layouts, cam, open);
        const sl = sharpLayer.current;
        if (sl) {
          sl.width = still.hd ? still.hd.width : 1;
          sl.height = still.hd ? still.hd.height : 1;
          if (still.hd) sl.getContext("2d").drawImage(still.hd, 0, 0);
        }
      }
      stillRef.current = still;
      // Cleared first: the holes the sharp pieces leave must stay holes, frame after frame.
      ctx.clearRect(0, 0, cam.width, cam.height);
      ctx.drawImage(still.canvas, 0, 0);
      const seen = cam.room ? placed.filter((u) => u.w.room === cam.room) : placed;
      // Labels and bubbles move by transform (no layout each frame): screen pixels per scene pixel.
      const k = el.clientWidth / cam.width;

      // Picking up: the piece being dragged where it would go, red if it can't.
      const held = drag.current?.ghost && !drag.current.ok ? drag.current : null;

      // Pets back to front; after each, whatever stands in front of it is drawn over it again.
      for (const u of order(seen, cam, (x) => x.box)) {
        const { p, w, walking, effect } = u;
        const size = p.pet.stage === "baby" || p.pet.stage === "egg" ? 0.75 : 1;
        const key = p.pet.stage === "egg" ? "egg" : petKey(p.pet.species, p.pet.color);
        const anim = animFor(p.cond, { walking, effect });
        const [sx, sy] = cam.project(w.x, w.y, w.z);
        ctx.fillStyle = "rgba(40,25,20,.28)";
        ctx.beginPath();
        ctx.ellipse(sx, sy - 2, 18 * size, 5 * size, 0, 0, Math.PI * 2);
        ctx.fill();
        if (p.id === selectedId && !edit) {
          ctx.strokeStyle = "#ffd166";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(sx, sy - 2, 24 * size, 7 * size, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(size, size);
        draw(ctx, atlas, frameAt(atlas, key, anim, t + p.phase), 0, 0, 1, w.flip);
        if (p.pet.stage === "star") draw(ctx, atlas, "crown/crown", 0, -SPRITE + 14, 1);
        ctx.restore();
        const reach = (SPRITE / 2) * size;
        const rect = { x0: sx - reach, x1: sx + reach, y0: sy - SPRITE * size - 14, y1: sy + 4 };
        const near = still.units.filter((s) => s.x0 < rect.x1 && rect.x0 < s.x1 && s.y0 < rect.y1 && rect.y0 < s.y1);
        if (near.length) {
          const mine = order([u, ...near], cam, (x) => x.box);
          for (const s of mine.slice(mine.indexOf(u) + 1)) cover(s);
        }
        // What it needs, or what just happened, in a bubble over its head (sharp text, not canvas pixels).
        const top = sy - SPRITE * size;
        const need = p.cond.state === "asleep" ? "z" : p.cond.flags.hungry ? "🍖" : p.cond.flags.grubby ? "🫧" : null;
        const bubble = bubbles.current.get(p.id);
        if (bubble) {
          const shown = effect ? (effect === "eat" ? "🍖" : effect === "clean" ? "🫧" : "💖") : p.cond.state === "egg" ? "" : need || "";
          if (bubble.textContent !== shown) bubble.textContent = shown;
          const rise = effect ? (t * 24) % 20 : need === "z" ? (t * 8 + p.phase * 6) % 16 : Math.abs(Math.sin(t * 2)) * 4;
          const cls = `pet-bubble${need === "z" && !effect ? " z" : ""}`;
          if (bubble.className !== cls) bubble.className = cls;
          bubble.style.display = shown ? "" : "none";
          bubble.style.transform = `translate(${(sx + (effect ? -6 : 14)) * k}px, ${(top + 6 - rise) * k}px) translate(-50%, -100%)`;
        }
        const label = labels.current.get(p.id);
        if (label) {
          label.style.display = "";
          label.style.transform = `translate(${sx * k}px, ${(sy + 2) * k}px) translate(-50%, 2px)`;
        }
      }
      for (const p of pets) {
        if (!seen.some((u) => u.p.id === p.id)) {
          const label = labels.current.get(p.id);
          if (label) label.style.display = "none";
          const bubble = bubbles.current.get(p.id);
          if (bubble) bubble.style.display = "none";
        }
      }
      drawn.current = still.hits;

      if (edit && cam.room) {
        const sel = edit.sel != null ? edit.draft.items[edit.sel] : null;
        if (held) {
          const sp = pieceSprite(held.ghost, cam, [230, 70, 90]);
          ctx.globalAlpha = 0.85;
          blit(sp);
          ctx.globalAlpha = 1;
        }
        if (sel) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = held ? "#e64a5a" : "#ffd166";
          ctx.setLineDash([4, 3]);
          outlinePath(ctx, cam, held ? held.ghost : sel);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      if (night) {
        ctx.fillStyle = "rgba(20,24,60,.3)";
        ctx.fillRect(0, 0, cam.width, cam.height);
        ctx.globalCompositeOperation = "lighter";
        for (const it of still.glows) {
          const box = pieceBox(it);
          const [gx, gy] = cam.project((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, box.z1 - 0.3);
          const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, 56);
          g.addColorStop(0, "rgba(255,200,120,.35)");
          g.addColorStop(1, "rgba(255,200,120,0)");
          ctx.fillStyle = g;
          ctx.fillRect(gx - 56, gy - 56, 112, 112);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [atlas]);

  // -- taps and drags -----------------------------------------------------------------

  const scenePoint = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * cam.width, ((e.clientY - r.top) / r.height) * cam.height];
  };

  const pieceAt = (sx, sy) => {
    for (const d of drawn.current) {
      const sp = d.sprite;
      if (!sp) continue;
      const x = Math.floor(sx - sp.ox);
      const y = Math.floor(sy - sp.oy);
      if (x < 0 || y < 0 || x >= sp.w || y >= sp.h) continue;
      if (sp.data[(y * sp.w + x) * 4 + 3]) return d.item;
    }
    return null;
  };

  const petAt = (sx, sy) => {
    let best = null;
    let dist = 34;
    for (const p of pets) {
      const w = walkers.current.get(p.id);
      if (!w || (view.room && w.room !== view.room)) continue;
      const [px, py] = cam.project(w.x, w.y, w.z);
      const d = Math.hypot(sx - px, sy - (py - 28));
      if (d < dist) [best, dist] = [p.id, d];
    }
    return best;
  };

  /** Where a piece being dragged would go, from where the pointer is. */
  const movedTo = (item, sx, sy, grab) => {
    const c = CATALOG[item.kind];
    if (c.layer !== "wall") {
      const [x, y] = cam.unproject(sx, sy);
      return { ...item, x: snap(x - grab[0]), y: snap(y - grab[1]) };
    }
    // Wall pieces slide along the walls that stand, at the height they hang.
    const zMid = c.boxes[0][2] + c.boxes[0][5] / 2;
    const [x, y] = cam.unproject(sx, sy + zMid * PX);
    return wallSpotNear(view.room, item, x, y, (wl) => cam.far(wl));
  };

  /** Closet doors under a tap, to open or shut them. */
  const closetAt = (sx, sy) => {
    for (const c of stillRef.current?.closets || []) {
      const sp = c.sprite;
      const x = Math.floor(sx - sp.ox);
      const y = Math.floor(sy - sp.oy);
      if (x >= 0 && y >= 0 && x < sp.w && y < sp.h && sp.data[(y * sp.w + x) * 4 + 3]) return c.id;
    }
    return null;
  };

  const down = (e) => {
    const [sx, sy] = scenePoint(e);
    if (edit) {
      const item = pieceAt(sx, sy);
      if (!item && closetAt(sx, sy)) {
        toggleCloset(closetAt(sx, sy));
        return;
      }
      const sel = item ? edit.draft.items.indexOf(item) : null;
      setEdit({ ...edit, sel: sel >= 0 ? sel : null });
      if (item && sel >= 0) {
        const [x, y] = cam.unproject(sx, sy);
        drag.current = { index: sel, grab: CATALOG[item.kind].layer === "wall" ? [0, 0] : [x - item.x, y - item.y], start: item, ghost: null, ok: true, moved: false };
        canvas.current.setPointerCapture?.(e.pointerId);
      }
      return;
    }
    const pet = petAt(sx, sy);
    if (pet) {
      onSelect(pet);
      return;
    }
    const closet = closetAt(sx, sy);
    if (closet) {
      toggleCloset(closet);
      return;
    }
    if (!view.room) {
      const [x, y] = cam.unproject(sx, sy);
      const room = roomAt(x, y);
      if (room) setView({ room, rot: view.rot });
    }
  };

  const move = (e) => {
    const d = drag.current;
    if (!d || !edit) return;
    const [sx, sy] = scenePoint(e);
    const item = edit.draft.items[d.index];
    const next = movedTo(item, sx, sy, d.grab);
    if (JSON.stringify(next) === JSON.stringify(d.ghost || item)) return;
    const items = edit.draft.items.map((it, k) => (k === d.index ? next : it));
    const ok = !layoutProblem(edit.room, { ...edit.draft, items });
    d.moved = true;
    if (ok) {
      d.ghost = null;
      d.ok = true;
      setEdit((cur) => ({ ...cur, draft: { ...cur.draft, items } }));
    } else {
      d.ghost = next;
      d.ok = false;
    }
  };

  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && edit) {
      setEdit((cur) => {
        const now = cur.draft.items[d.index];
        if (JSON.stringify(now) === JSON.stringify(d.start)) return cur;
        const before = cur.draft.items.map((it, k) => (k === d.index ? d.start : it));
        return { ...cur, history: [...cur.history, { ...cur.draft, items: before }] };
      });
    }
  };

  // -- the room builder ---------------------------------------------------------------

  const startEditing = () => {
    const room = view.room;
    setEdit({ room, draft: structuredClone(layouts[room]), sel: null, history: [] });
  };

  const change = (draft, sel = edit.sel) => setEdit({ ...edit, draft, sel, history: [...edit.history, edit.draft] });

  const save = async () => {
    setSaving(true);
    try {
      await onSaveRoom(edit.room, edit.draft);
      setEdit(null);
    } catch {
      /* said */
    } finally {
      setSaving(false);
    }
  };

  const sleepers = (room) => pets.filter((_, i) => bedroomOf(i) === room).map((p) => p.name).filter(Boolean);
  const chips = [[null, "🏠 Whole flat"], ...Object.entries(ROOMS).map(([id, r]) => {
    const who = id.startsWith("bed") ? sleepers(id) : [];
    return [id, `${r.label}${who.length ? ` · ${who.join(", ")}` : ""}`];
  })];

  return (
    <div className="house-view">
      <div className="room-chips" role="tablist" aria-label="Rooms">
        {chips.map(([id, label]) => (
          <button key={id || "flat"} role="tab" className={view.room === id ? "on" : ""} aria-selected={view.room === id}
            disabled={!!edit && id !== edit.room} onClick={() => setView({ room: id, rot: view.rot })}>
            {label}
          </button>
        ))}
      </div>
      {edit && (
        <div className="seg view-seg" role="tablist" aria-label="How to see the room">
          <button role="tab" aria-selected={!edit.plan} className={!edit.plan ? "on" : ""} onClick={() => setEdit({ ...edit, plan: false })}>🏠 Dollhouse</button>
          <button role="tab" aria-selected={!!edit.plan} className={edit.plan ? "on" : ""} onClick={() => setEdit({ ...edit, plan: true })}>📐 Blueprint</button>
        </div>
      )}
      {edit?.plan && (
        <Blueprint room={edit.room} draft={edit.draft} sel={edit.sel} open={open}
          onSelect={(sel) => setEdit((cur) => ({ ...cur, sel }))}
          onMove={(index, next) => setEdit((cur) => ({ ...cur, draft: { ...cur.draft, items: cur.draft.items.map((it, k) => (k === index ? next : it)) } }))}
          onMoveEnd={(index, start) => setEdit((cur) => {
            if (JSON.stringify(cur.draft.items[index]) === JSON.stringify(start)) return cur;
            return { ...cur, history: [...cur.history, { ...cur.draft, items: cur.draft.items.map((it, k) => (k === index ? start : it)) }] };
          })}
          onToggleCloset={toggleCloset} />
      )}
      <div className="scene" style={{ aspectRatio: `${cam.width} / ${cam.height}`, display: edit?.plan ? "none" : undefined }}>
        <canvas ref={sharpLayer} className="sharp-layer" width="1" height="1" aria-hidden="true" />
        <canvas
          ref={canvas}
          className={edit ? "editing" : ""}
          width={cam.width}
          height={cam.height}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label={view.room ? `${ROOMS[view.room].label}, seen from one side` : "Your household's pets in their apartment"}
        />
        {pets.map((p) => (
          <button
            key={p.id}
            className={`pet-label${p.id === selectedId ? " sel" : ""}`}
            ref={(el) => (el ? labels.current.set(p.id, el) : labels.current.delete(p.id))}
            onClick={() => onSelect(p.id)}
            tabIndex={edit ? -1 : 0}
          >
            {p.pet.name}
          </button>
        ))}
        {pets.map((p) => (
          <span key={`b${p.id}`} className="pet-bubble" aria-hidden="true" style={{ display: "none" }}
            ref={(el) => (el ? bubbles.current.set(p.id, el) : bubbles.current.delete(p.id))} />
        ))}
        <div className="scene-tools">
          <button aria-label="Turn the view left" onClick={() => setView({ ...view, rot: (view.rot + 3) % 4 })}>⟲</button>
          <button aria-label="Turn the view right" onClick={() => setView({ ...view, rot: (view.rot + 1) % 4 })}>⟳</button>
        </div>
      </div>
      {view.room && !edit && (
        <div className="row room-row">
          <button className="ghost" onClick={() => setView({ room: null, rot: view.rot })}>← Whole flat</button>
          {onSaveRoom && <button onClick={startEditing}>✏️ Arrange {ROOMS[view.room].label.toLowerCase()}</button>}
        </div>
      )}
      {edit && (
        <RoomBuilder
          edit={edit}
          saving={saving}
          onChange={change}
          onSelect={(sel) => setEdit({ ...edit, sel })}
          onUndo={() => edit.history.length && setEdit({ ...edit, draft: edit.history[edit.history.length - 1], history: edit.history.slice(0, -1), sel: null })}
          onCancel={() => setEdit(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
