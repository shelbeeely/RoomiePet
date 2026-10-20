// The shared house: every roommate's pet in one room, wandering about, going
// to bed at night, running to the bowl when its person did a kitchen chore.
// Where they walk is decided here, on each phone; how they are (hungry,
// happy, asleep) comes from the server's numbers.
import { useEffect, useRef } from "react";
import { animFor, draw, frameAt, petKey } from "./sprites.js";

const T = 16; // room pixels per tile
// A small room, so on a phone each pet is a good size: 12 x 9 tiles.
const W = 12 * T;
const H = 9 * T;
const S = 4; // canvas pixels per room pixel
const FLOOR = { x0: 14, x1: W - 14, y0: 2 * T + 10, y1: H - 6 };
const BED = { x: 26, y: H - 16 };
const BOWL = { x: W - 26, y: H - 18 };

const rand = (a, b) => a + Math.random() * (b - a);

function walkerFor(map, id, i) {
  let w = map.get(id);
  if (!w) {
    w = { x: 50 + ((i * 41) % 100), y: FLOOR.y0 + 24 + ((i * 23) % 50), tx: null, ty: null, facing: 1, rest: rand(1, 4) };
    map.set(id, w);
  }
  return w;
}

function nearBed(i) {
  return { x: BED.x - 14 + (i % 3) * 16, y: BED.y + 2 + Math.floor(i / 3) * 6 };
}

export default function HouseScene({ atlas, pets, effects, selectedId, onSelect, hour }) {
  const canvas = useRef(null);
  const labels = useRef(new Map());
  const walkers = useRef(new Map());
  const latest = useRef({ pets, effects, selectedId, hour });
  latest.current = { pets, effects, selectedId, hour };

  useEffect(() => {
    if (!atlas) return;
    const ctx = canvas.current.getContext("2d");
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

      // The room: wallpaper, skirting, floorboards, windows, a plant, the bed and bowl.
      for (let x = 0; x < W; x += T) {
        draw(ctx, atlas, "wall/paper", x + T / 2, T, 1);
        draw(ctx, atlas, "wall/base", x + T / 2, 2 * T, 1);
        for (let y = 2 * T; y < H; y += T) draw(ctx, atlas, "floor/wood", x + T / 2, y + T, 1);
      }
      for (const wx of [48, 144]) draw(ctx, atlas, `window/${night ? "night" : "day"}`, wx, 2 * T - 1, 1);
      draw(ctx, atlas, "plant/plant", W - 12, 2 * T + 10, 1);
      draw(ctx, atlas, "bed/bed", BED.x, BED.y + 6, 1);
      const feeding = pets.some((p) => effects[p.id]?.kind === "eat");
      draw(ctx, atlas, feeding ? "bowl/full" : "bowl/empty", BOWL.x, BOWL.y + 8, 1);

      // Where each goes now, then everyone drawn back to front.
      const placed = pets.map((p, i) => {
        const w = walkerFor(walkers.current, p.id, i);
        const effect = effects[p.id]?.until > Date.now() ? effects[p.id].kind : null;
        const state = p.cond.state;
        if (state === "asleep") {
          const b = nearBed(i);
          [w.tx, w.ty] = [b.x, b.y];
        } else if (effect === "eat") {
          [w.tx, w.ty] = [BOWL.x - 14 - (i % 2) * 10, BOWL.y];
        } else if (state === "egg") {
          [w.tx, w.ty] = [null, null];
        } else if (w.tx === null) {
          w.rest -= dt * (state === "sad" || state === "poorly" ? 0.4 : 1);
          if (w.rest <= 0) {
            w.tx = rand(FLOOR.x0, FLOOR.x1);
            w.ty = rand(FLOOR.y0, FLOOR.y1);
          }
        }
        let walking = false;
        if (w.tx !== null) {
          const dx = w.tx - w.x;
          const dy = w.ty - w.y;
          const dist = Math.hypot(dx, dy);
          const speed = state === "sad" || state === "poorly" ? 14 : 26;
          if (dist < 1.5) {
            if (state !== "asleep" && effect !== "eat") {
              w.tx = w.ty = null;
              w.rest = rand(2, 7);
            }
          } else {
            const step = Math.min(dist, speed * dt);
            w.x += (dx / dist) * step;
            w.y += (dy / dist) * step;
            if (Math.abs(dx) > 0.5) w.facing = dx > 0 ? 1 : -1;
            walking = true;
          }
        }
        return { p, w, walking, effect };
      });
      placed.sort((a, b) => a.w.y - b.w.y);
      for (const { p, w, walking, effect } of placed) {
        const baby = p.pet.stage === "baby" || p.pet.stage === "egg";
        const key = p.pet.stage === "egg" ? "egg" : petKey(p.pet.species, p.pet.color);
        const anim = animFor(p.cond, { walking, effect });
        // Characters are drawn bigger than the room, as in most pixel games: grown 1.5x,
        // a baby at room size -- both whole canvas pixels (6 and 4), so pixels stay square.
        const size = baby ? 1 : 1.5;
        // Shadow, the selection ring, then the pet (a baby is drawn smaller).
        ctx.fillStyle = "rgba(60,35,20,.35)";
        ctx.beginPath();
        ctx.ellipse(w.x, w.y, 6 * size, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (p.id === selectedId) {
          ctx.strokeStyle = "#ffd166";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(w.x, w.y, 9 * size, 3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.scale(size, size);
        draw(ctx, atlas, frameAt(atlas, key, anim, t + p.phase), 0, 0, 1, w.facing < 0);
        if (p.pet.stage === "star") draw(ctx, atlas, "crown/crown", 0, -15, 1);
        ctx.restore();
        const top = w.y - 16 * size;
        // What it needs, above its head: a bubble only when it really needs it.
        const need = p.cond.state === "asleep" ? "z" : p.cond.flags.hungry ? "🍖" : p.cond.flags.grubby ? "🫧" : null;
        if (need === "z") {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 7px system-ui";
          const drift = (t * 4 + p.phase * 3) % 8;
          ctx.fillText("z", w.x + 5, top - drift);
        } else if (need && p.cond.state !== "egg") {
          ctx.font = "8px system-ui";
          ctx.fillText(need, w.x + 3, top - 1 - Math.abs(Math.sin(t * 2)) * 2);
        }
        if (effect) {
          ctx.font = "7px system-ui";
          const rise = ((t * 14) % 12);
          ctx.fillText(effect === "eat" ? "🍖" : "💖", w.x - 4, top - rise);
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
    return () => cancelAnimationFrame(raf);
  }, [atlas]);

  const click = (e) => {
    const r = canvas.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    let best = null;
    let dist = 22;
    for (const p of latest.current.pets) {
      const w = walkers.current.get(p.id);
      if (!w) continue;
      const d = Math.hypot(x - w.x, y - (w.y - 10));
      if (d < dist) [best, dist] = [p.id, d];
    }
    if (best) onSelect(best);
  };

  return (
    <div className="scene">
      <canvas ref={canvas} width={W * S} height={H * S} onClick={click} aria-label="Your household's pets in their house" />
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
