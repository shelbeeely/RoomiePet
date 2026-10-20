// The shared apartment: every roommate's pet in a 750 sq ft flat -- two
// bedrooms on the left opening onto the kitchen and living room, the
// bathroom and laundry in the back right corner. The whole flat is seen
// front-on like a doll's house; tap a room (or its chip) to see it alone,
// isometric, turned whichever way round, and to arrange it in the room
// builder. Pets walk between rooms round the furniture: to their bed at
// night, to the bowl when their person did a kitchen chore, to the bath
// after a cleaning one, mostly about the living room otherwise. Where they
// walk is decided here, on each phone; how they are comes from the server.
import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, ROOMS, footprint, layoutProblem, wallsOf } from "@shared/home.js";
import { animFor, draw, frameAt, petKey } from "./sprites.js";
import { PX, floorSprite, isoCamera, order, pieceBox, pieceSprite, planCamera, planWalls, wallBox, wallSprite } from "./iso.js";
import { allLayouts, bedroomOf, destination, findPath, gridOf, roomAt } from "./house.js";
import RoomBuilder from "./RoomBuilder.jsx";

const SPRITE = 64;
const BG = "#2a2236";
const rand = (a, b) => a + Math.random() * (b - a);
const snap = (n) => Math.round(n * 2) / 2;

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

/** The canvas's pixels per scene pixel: enough for the screen it is on, whole numbers so pixels stay square. */
function scaleFor(el, width) {
  const css = el?.parentElement?.clientWidth || width;
  return Math.max(1, Math.min(6, Math.ceil((css * (window.devicePixelRatio || 1)) / width)));
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
  const labels = useRef(new Map());
  const walkers = useRef(new Map());
  const drawn = useRef([]);
  const drag = useRef(null);
  const [view, setView] = useState({ room: null, rot: 0 });
  const [edit, setEdit] = useState(null); // {room, draft, sel, history}
  const [saving, setSaving] = useState(false);

  const layouts = useMemo(() => {
    const all = allLayouts(saved);
    if (edit) all[edit.room] = edit.draft;
    return all;
  }, [saved, edit]);
  const grid = useMemo(() => gridOf(layouts), [layouts]);
  const cam = useMemo(() => (view.room ? isoCamera(view.room, view.rot) : planCamera()), [view]);

  const latest = useRef({});
  latest.current = { pets, effects, selectedId, hour, layouts, grid, cam, edit };

  // A new layout (saved, or being arranged): pets look again for their way.
  useEffect(() => {
    for (const w of walkers.current.values()) w.mode = null;
  }, [grid]);

  useEffect(() => {
    if (!atlas) return;
    const el = canvas.current;
    const ctx = el.getContext("2d");
    let S = 0;
    let size = "";
    const fit = () => {
      const c = latest.current.cam;
      const s = scaleFor(el, c.width);
      if (s !== S || size !== c.key) {
        S = s;
        size = c.key;
        el.width = c.width * S;
        el.height = c.height * S;
      }
    };
    window.addEventListener("resize", fit);
    let raf;
    let last = performance.now();

    const frame = (nowMs) => {
      const dt = Math.min(0.1, (nowMs - last) / 1000);
      last = nowMs;
      const t = nowMs / 1000;
      const { pets, effects, selectedId, hour, layouts, grid, cam, edit } = latest.current;
      fit();
      const night = hour >= 20 || hour < 7;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, el.width, el.height);
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(S, 0, 0, S, 0, 0);
      const blit = (sp) => ctx.drawImage(sp.canvas, sp.ox, sp.oy);

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

      // The room(s) on show.
      const rooms = cam.kind === "plan" ? Object.keys(ROOMS) : [cam.room];
      blit(floorSprite(rooms, layouts, cam));
      const units = [];
      const glows = [];
      const wallHits = [];
      if (cam.kind === "plan") {
        for (const wall of planWalls()) {
          const h = cam.wallHeight(wall);
          const paper = wall.side === "n" ? layouts[wall.room].wall : null;
          units.push({ kind: "wall", box: wallBox(wall, h), sprite: wallSprite(wall, h, paper, cam) });
          if (wall.side !== "n" || h < 3) continue;
          for (const it of layouts[wall.room].items) {
            if (CATALOG[it.kind].layer === "wall" && it.side === "n" && it.line === wall.line && it.at >= wall.from - 0.01 && it.at < wall.to) {
              units.push({ kind: "piece", room: wall.room, item: it, box: pieceBox(it), sprite: pieceSprite(it, cam) });
            }
          }
        }
      } else {
        // Far walls stand behind everything; near ones are stubs, in with the rest.
        for (const wall of wallsOf(cam.room)) {
          const h = cam.wallHeight(wall);
          const sprite = wallSprite(wall, h, layouts[cam.room].wall, cam);
          if (cam.far(wall)) blit(sprite);
          else units.push({ kind: "wall", box: wallBox(wall, h), sprite });
        }
        const farWall = (it) => wallsOf(cam.room).some((wl) => cam.far(wl) && wl.side === it.side && wl.line === it.line && it.at >= wl.from - 0.01 && it.at < wl.to);
        for (const it of layouts[cam.room].items) {
          if (CATALOG[it.kind].layer === "wall" && farWall(it)) {
            const sp = pieceSprite(it, cam);
            blit(sp);
            wallHits.unshift({ room: cam.room, item: it, sprite: sp });
          }
        }
      }
      for (const room of rooms) {
        for (const it of layouts[room].items) {
          const c = CATALOG[it.kind];
          if (c.layer === "rug" || c.layer === "wall") continue;
          units.push({ kind: "piece", room, item: it, box: pieceBox(it), sprite: pieceSprite(it, cam) });
          if (c.glow && night) glows.push(it);
        }
      }
      const seen = cam.kind === "plan" ? placed : placed.filter((u) => u.w.room === cam.room);
      units.push(...seen);

      // Picking up: the piece being dragged where it would go, red if it can't.
      const held = drag.current?.ghost && !drag.current.ok ? drag.current : null;

      const list = order(units, cam, (u) => u.box);
      const hits = [];
      for (const u of list) {
        if (u.kind !== "pet") {
          if (u.sprite) blit(u.sprite);
          if (u.kind === "piece") hits.push(u);
          continue;
        }
        const { p, w, walking, effect } = u;
        const size = p.pet.stage === "baby" || p.pet.stage === "egg" ? 0.75 : 1;
        const key = p.pet.stage === "egg" ? "egg" : petKey(p.pet.species, p.pet.color);
        const anim = animFor(p.cond, { walking, effect });
        const [sx, sy] = cam.project(w.x, w.y, w.z);
        ctx.fillStyle = "rgba(40,25,20,.28)";
        ctx.beginPath();
        ctx.ellipse(sx, sy - 2, 18 * size, (cam.kind === "iso" ? 8 : 5) * size, 0, 0, Math.PI * 2);
        ctx.fill();
        if (p.id === selectedId && !edit) {
          ctx.strokeStyle = "#ffd166";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(sx, sy - 2, 24 * size, (cam.kind === "iso" ? 11 : 7) * size, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(size, size);
        draw(ctx, atlas, frameAt(atlas, key, anim, t + p.phase), 0, 0, 1, w.flip);
        if (p.pet.stage === "star") draw(ctx, atlas, "crown/crown", 0, -SPRITE + 14, 1);
        ctx.restore();
        const top = sy - SPRITE * size;
        const need = p.cond.state === "asleep" ? "z" : p.cond.flags.hungry ? "🍖" : p.cond.flags.grubby ? "🫧" : null;
        if (need === "z") {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 14px system-ui";
          ctx.fillText("z", sx + 14, top + 12 - ((t * 8 + p.phase * 6) % 16));
        } else if (need && p.cond.state !== "egg") {
          ctx.font = "16px system-ui";
          ctx.fillText(need, sx + 12, top + 8 - Math.abs(Math.sin(t * 2)) * 4);
        }
        if (effect) {
          ctx.font = "14px system-ui";
          ctx.fillText(effect === "eat" ? "🍖" : effect === "clean" ? "🫧" : "💖", sx - 8, top + 4 - ((t * 24) % 20));
        }
        const label = labels.current.get(p.id);
        if (label) {
          label.style.display = "";
          label.style.left = `${(sx / cam.width) * 100}%`;
          label.style.top = `${((sy + 2) / cam.height) * 100}%`;
        }
      }
      for (const p of pets) {
        if (!seen.some((u) => u.p.id === p.id)) {
          const label = labels.current.get(p.id);
          if (label) label.style.display = "none";
        }
      }
      // What a tap picks, top first: the pieces as drawn, and the wall pieces behind them.
      const rugs = cam.kind === "iso"
        ? layouts[cam.room].items.filter((it) => CATALOG[it.kind].layer === "rug").reverse().map((it) => ({ room: cam.room, item: it, sprite: pieceSprite(it, cam) }))
        : [];
      drawn.current = [...hits.reverse(), ...wallHits, ...rugs];

      if (edit && cam.kind === "iso") {
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
        for (const it of glows) {
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
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
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
    // Wall pieces slide along the far walls, at the height they hang.
    const zMid = c.boxes[0][2] + c.boxes[0][5] / 2;
    const [x, y] = cam.unproject(sx, sy + zMid * PX);
    let best = null;
    for (const wl of wallsOf(view.room)) {
      if (!cam.far(wl) || (c.outer && !wl.outer)) continue;
      const along = wl.side === "n" || wl.side === "s" ? x : y;
      const across = wl.side === "n" || wl.side === "s" ? y : x;
      const at = Math.max(wl.from, Math.min(wl.to - c.w, snap(along - c.w / 2)));
      const d = Math.abs(across - wl.line) + Math.max(0, wl.from - along, along - wl.to);
      if (!best || d < best.d) best = { d, at, side: wl.side, line: wl.line };
    }
    return best ? { ...item, side: best.side, line: best.line, at: best.at } : item;
  };

  const down = (e) => {
    const [sx, sy] = scenePoint(e);
    if (edit) {
      const item = pieceAt(sx, sy);
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
      <div className="scene" style={{ aspectRatio: `${cam.width} / ${cam.height}` }}>
        <canvas
          ref={canvas}
          className={edit ? "editing" : ""}
          width={cam.width * 2}
          height={cam.height * 2}
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
        {view.room && (
          <div className="scene-tools">
            <button aria-label="Turn the room left" onClick={() => setView({ ...view, rot: (view.rot + 3) % 4 })}>⟲</button>
            <button aria-label="Turn the room right" onClick={() => setView({ ...view, rot: (view.rot + 1) % 4 })}>⟳</button>
          </div>
        )}
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
