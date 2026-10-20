// The shared apartment: every roommate's pet in a doll's-house view of a
// 750 sq ft flat -- two bedrooms on the left opening onto the kitchen and
// living room, the bathroom and laundry in the back right corner. Pets walk
// between rooms through the doors: to their bed at night, to the bowl when
// their person did a kitchen chore, to the bath after a cleaning one, mostly
// about the living room otherwise. Where they walk is decided here, on each
// phone; how they are comes from the server's numbers.
import { useEffect, useRef } from "react";
import { animFor, draw, frameAt, petKey } from "./sprites.js";
import { BOWL, DOORS, FT, FURNITURE, H, KITCHEN_FLOOR, ROOMS, W, WALL_H, destination, roomAt, route } from "./house.js";

const WALL = "#3b3049";
const SPRITE = 64;

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
    const start = { x: 220 + ((i * 47) % 100), y: 250 + ((i * 31) % 120) };
    w = { ...start, room: roomAt(start.x, start.y), path: [], mode: null, facing: 1, rest: rand(0.5, 3) };
    map.set(id, w);
  }
  return w;
}

function drawShell(ctx, atlas) {
  for (const [id, r] of Object.entries(ROOMS)) {
    const [paperSprite, paperFrame] = r.paper.includes("/") ? r.paper.split("/") : [r.paper, null];
    for (const a of r.areas) {
      for (let x = a.x0; x < a.x1; x += FT) {
        // The back wall: paper, then the skirting (tiles all the way down in the bathroom).
        for (let y = a.y0; y < a.y0 + WALL_H; y += FT) {
          const last = y + FT >= a.y0 + WALL_H;
          const frame = paperFrame ? `${paperSprite}/${paperFrame}` : `${paperSprite}/${last ? "base" : "paper"}`;
          draw(ctx, atlas, frame, x + FT / 2, y + FT, 1);
        }
        for (let y = a.y0 + WALL_H; y < a.y1; y += FT) {
          const kitchen = id === "main" && x >= KITCHEN_FLOOR.x0 && x < KITCHEN_FLOOR.x1 && y < KITCHEN_FLOOR.y1;
          draw(ctx, atlas, kitchen ? "tile/check" : r.floor, x + FT / 2, y + FT, 1);
        }
      }
    }
  }
  // Walls between rooms, seen from above: a dark band, with gaps for doors.
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 0, W, 3);
  ctx.fillRect(0, H - 3, W, 3);
  ctx.fillRect(0, 0, 3, H);
  ctx.fillRect(W - 3, 0, 3, H);
  ctx.fillRect(0, 194, 176, 4);              // between the bedrooms
  ctx.fillRect(334, 0, 4, 152);              // the bathroom's side wall
  ctx.fillRect(336, 150, W - 336, 4);        // and its front wall's top
  const gaps = DOORS.filter((d) => d.gap).map((d) => d.gap).sort((a, b) => a.y0 - b.y0);
  let y = 0;
  for (const g of gaps) {
    ctx.fillRect(g.x - 3, y, 6, g.y0 - y);
    y = g.y1;
  }
  ctx.fillRect(176 - 3, y, 6, H - y);
  for (const d of DOORS) if (d.doorway) draw(ctx, atlas, "door/main", d.doorway.x, d.doorway.y, 1);
}

/** The canvas's pixels per room pixel: enough for the screen it is on, whole numbers so pixels stay square. */
function scaleFor(el) {
  const css = el?.parentElement?.clientWidth || W;
  return Math.max(1, Math.min(4, Math.ceil((css * (window.devicePixelRatio || 1)) / W)));
}

export default function HouseScene({ atlas, pets, effects, selectedId, onSelect, hour }) {
  const canvas = useRef(null);
  const labels = useRef(new Map());
  const walkers = useRef(new Map());
  const latest = useRef({ pets, effects, selectedId, hour });
  latest.current = { pets, effects, selectedId, hour };

  useEffect(() => {
    if (!atlas) return;
    const el = canvas.current;
    const ctx = el.getContext("2d");
    let S = 0;
    const fit = () => {
      const s = scaleFor(el);
      if (s !== S) {
        S = s;
        el.width = W * S;
        el.height = H * S;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    let raf;
    let last = performance.now();

    const frame = (nowMs) => {
      const dt = Math.min(0.1, (nowMs - last) / 1000);
      last = nowMs;
      const t = nowMs / 1000;
      const { pets, effects, selectedId, hour } = latest.current;
      const night = hour >= 20 || hour < 7;
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(S, 0, 0, S, 0, 0);

      drawShell(ctx, atlas);
      const pick = (f) => (night ? f.night || f.frame : f.day || f.frame);
      for (const f of FURNITURE) if (f.wall || f.flat) draw(ctx, atlas, pick(f), f.x, f.y, 1, f.flip);
      const feeding = pets.some((p) => effects[p.id]?.kind === "eat" && effects[p.id].until > Date.now());
      draw(ctx, atlas, feeding ? "bowl/full" : "bowl/empty", BOWL.x, BOWL.y, 1);

      // Where each pet goes now.
      const placed = pets.map((p, i) => {
        const w = walkerFor(walkers.current, p.id, i);
        const effect = effects[p.id]?.until > Date.now() ? effects[p.id].kind : null;
        const state = p.cond.state;
        const mode = modeOf(p.cond, effect);
        if (mode !== w.mode) {
          w.mode = mode;
          const dest = mode === "egg" || mode === "wander" ? null : destination(p.cond, effect, i);
          w.path = dest ? route(w.room, dest) : [];
          w.rest = mode === "wander" ? rand(0.5, 2) : 0;
        } else if (mode === "wander" && !w.path.length) {
          w.rest -= dt * (state === "sad" || state === "poorly" ? 0.4 : 1);
          if (w.rest <= 0) {
            const dest = destination(p.cond, null, i);
            if (dest) w.path = route(w.room, dest);
            w.rest = rand(2, 7);
          }
        }
        let walking = false;
        if (w.path.length) {
          const goal = w.path[0];
          const dx = goal.x - w.x;
          const dy = goal.y - w.y;
          const dist = Math.hypot(dx, dy);
          const speed = state === "sad" || state === "poorly" ? 28 : 54;
          if (dist < 2) {
            w.room = goal.room;
            w.path.shift();
          } else {
            const step = Math.min(dist, speed * dt);
            w.x += (dx / dist) * step;
            w.y += (dy / dist) * step;
            if (Math.abs(dx) > 0.5) w.facing = dx > 0 ? 1 : -1;
            walking = true;
          }
        }
        return { kind: "pet", y: w.y, p, w, walking, effect };
      });

      // Furniture that stands on the floor and the pets, back to front.
      const things = [
        ...FURNITURE.filter((f) => !f.wall && !f.flat).map((f) => ({ kind: "thing", y: f.y, f })),
        ...placed,
      ].sort((a, b) => a.y - b.y);
      for (const thing of things) {
        if (thing.kind === "thing") {
          draw(ctx, atlas, pick(thing.f), thing.f.x, thing.f.y, 1, thing.f.flip);
          continue;
        }
        const { p, w, walking, effect } = thing;
        const size = p.pet.stage === "baby" || p.pet.stage === "egg" ? 0.75 : 1;
        const key = p.pet.stage === "egg" ? "egg" : petKey(p.pet.species, p.pet.color);
        const anim = animFor(p.cond, { walking, effect });
        ctx.fillStyle = "rgba(60,35,20,.3)";
        ctx.beginPath();
        ctx.ellipse(w.x, w.y - 3, 20 * size, 5 * size, 0, 0, Math.PI * 2);
        ctx.fill();
        if (p.id === selectedId) {
          ctx.strokeStyle = "#ffd166";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(w.x, w.y - 3, 26 * size, 7 * size, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.scale(size, size);
        draw(ctx, atlas, frameAt(atlas, key, anim, t + p.phase), 0, 0, 1, w.facing < 0);
        if (p.pet.stage === "star") draw(ctx, atlas, "crown/crown", 0, -SPRITE + 14, 1);
        ctx.restore();
        const top = w.y - SPRITE * size;
        const need = p.cond.state === "asleep" ? "z" : p.cond.flags.hungry ? "🍖" : p.cond.flags.grubby ? "🫧" : null;
        if (need === "z") {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 14px system-ui";
          ctx.fillText("z", w.x + 14, top + 12 - ((t * 8 + p.phase * 6) % 16));
        } else if (need && p.cond.state !== "egg") {
          ctx.font = "16px system-ui";
          ctx.fillText(need, w.x + 12, top + 8 - Math.abs(Math.sin(t * 2)) * 4);
        }
        if (effect) {
          ctx.font = "14px system-ui";
          ctx.fillText(effect === "eat" ? "🍖" : effect === "clean" ? "🫧" : "💖", w.x - 8, top + 4 - ((t * 24) % 20));
        }
        const label = labels.current.get(p.id);
        if (label) {
          label.style.left = `${(w.x / W) * 100}%`;
          label.style.top = `${((w.y + 2) / H) * 100}%`;
        }
      }
      if (night) {
        ctx.fillStyle = "rgba(20,24,60,.28)";
        ctx.fillRect(0, 0, W, H);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, [atlas]);

  const click = (e) => {
    const r = canvas.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    let best = null;
    let dist = 40;
    for (const p of latest.current.pets) {
      const w = walkers.current.get(p.id);
      if (!w) continue;
      const d = Math.hypot(x - w.x, y - (w.y - 30));
      if (d < dist) [best, dist] = [p.id, d];
    }
    if (best) onSelect(best);
  };

  return (
    <div className="scene">
      <canvas ref={canvas} width={W * 2} height={H * 2} onClick={click} aria-label="Your household's pets in their apartment" />
      {pets.map((p) => (
        <button
          key={p.id}
          className={`pet-label${p.id === selectedId ? " sel" : ""}`}
          ref={(el) => (el ? labels.current.set(p.id, el) : labels.current.delete(p.id))}
          onClick={() => onSelect(p.id)}
        >
          {p.pet.name}
        </button>
      ))}
    </div>
  );
}
