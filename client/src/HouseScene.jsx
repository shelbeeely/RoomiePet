// The shared house: every roommate's pet in a doll's-house cutaway -- two
// bedrooms upstairs, the kitchen-living room and the bathroom-laundry
// downstairs. Pets walk between rooms through the doors: to their bed at
// night, to the bowl when their person did a kitchen chore, to the bath after
// a cleaning one, otherwise mostly about the living room. Where they walk is
// decided here, on each phone; how they are comes from the server's numbers.
import { useEffect, useRef } from "react";
import { animFor, draw, frameAt, petKey } from "./sprites.js";
import { BOWL, DOORS, FURNITURE, H, KITCHEN, ROOMS, T, W, destination, roomAt, route } from "./house.js";

const S = 4; // canvas pixels per room pixel: pets at 1.5x land on whole pixels (6 per art pixel)
const WALL = "#3b3049";

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
    const start = { x: 96 + ((i * 29) % 70), y: 186 + ((i * 17) % 40) };
    w = { ...start, room: roomAt(start.x, start.y), path: [], mode: null, facing: 1, rest: rand(0.5, 3) };
    map.set(id, w);
  }
  return w;
}

function drawRoomShell(ctx, atlas) {
  for (const [id, r] of Object.entries(ROOMS)) {
    const [sprite, frame] = r.paper.includes("/") ? r.paper.split("/") : [r.paper, "paper"];
    for (let x = r.wall.x0; x < r.wall.x1; x += T) {
      draw(ctx, atlas, `${sprite}/${frame}`, x + T / 2, r.wall.y0 + T, 1);
      draw(ctx, atlas, id === "bath" ? `${sprite}/${frame}` : `${sprite}/base`, x + T / 2, r.wall.y0 + 2 * T, 1);
      for (let y = r.floor.y0; y < r.floor.y1; y += T) {
        const tiled = id === "bath" ? "tile@aqua/check" : id === "living" && x < KITCHEN.x1 ? "tile/check" : "floor/wood";
        draw(ctx, atlas, tiled, x + T / 2, y + T, 1);
      }
    }
  }
  // Walls between rooms: the floor between the storeys, and the two inside walls with their gaps.
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 110, W, 3);
  ctx.fillRect(0, 0, W, 2);
  ctx.fillRect(0, H - 2, W, 2);
  ctx.fillRect(0, 0, 2, H);
  ctx.fillRect(W - 2, 0, 2, H);
  for (const d of DOORS) {
    if (d.wall) {
      const top = d.wall.x === 128 ? 0 : 112;
      const bottom = d.wall.x === 128 ? 112 : H;
      ctx.fillRect(d.wall.x - 2, top, 4, d.wall.y0 - top);
      ctx.fillRect(d.wall.x - 2, d.wall.y1, 4, bottom - d.wall.y1);
    }
    if (d.door) draw(ctx, atlas, "door/open", d.door.x, d.door.y, 1);
  }
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

      drawRoomShell(ctx, atlas);
      for (const f of FURNITURE) {
        const name = night ? f.night || f.frame : f.day || f.frame;
        draw(ctx, atlas, name, f.x, f.y, 1, f.flip);
      }
      const feeding = pets.some((p) => effects[p.id]?.kind === "eat" && effects[p.id].until > Date.now());
      draw(ctx, atlas, feeding ? "bowl/full" : "bowl/empty", BOWL.x, BOWL.y, 1);

      // Where each goes now, then everyone drawn back to front.
      const placed = pets.map((p, i) => {
        const w = walkerFor(walkers.current, p.id, i);
        const effect = effects[p.id]?.until > Date.now() ? effects[p.id].kind : null;
        const state = p.cond.state;
        const mode = modeOf(p.cond, effect);
        if (mode !== w.mode) {
          w.mode = mode;
          const dest = mode === "egg" ? null : mode === "wander" ? null : destination(p.cond, effect, i);
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
          const speed = state === "sad" || state === "poorly" ? 16 : 30;
          if (dist < 1.5) {
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
        return { p, w, walking, effect };
      });
      placed.sort((a, b) => a.w.y - b.w.y);
      for (const { p, w, walking, effect } of placed) {
        const size = p.pet.stage === "baby" || p.pet.stage === "egg" ? 1 : 1.5;
        const key = p.pet.stage === "egg" ? "egg" : petKey(p.pet.species, p.pet.color);
        const anim = animFor(p.cond, { walking, effect });
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
        const need = p.cond.state === "asleep" ? "z" : p.cond.flags.hungry ? "🍖" : p.cond.flags.grubby ? "🫧" : null;
        if (need === "z") {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 7px system-ui";
          ctx.fillText("z", w.x + 5, top - ((t * 4 + p.phase * 3) % 8));
        } else if (need && p.cond.state !== "egg") {
          ctx.font = "8px system-ui";
          ctx.fillText(need, w.x + 3, top - 1 - Math.abs(Math.sin(t * 2)) * 2);
        }
        if (effect) {
          ctx.font = "7px system-ui";
          ctx.fillText(effect === "eat" ? "🍖" : effect === "clean" ? "🫧" : "💖", w.x - 4, top - ((t * 14) % 12));
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
