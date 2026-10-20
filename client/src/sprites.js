// The pixel art: one sprite sheet and its atlas, made from art/sprites.json
// with the pixel-art skill (npm run art). Everything is drawn with smoothing
// off so pixels stay square.
import { SPECIES } from "@shared/pet.js";

let loading = null;

export function loadAtlas() {
  if (!loading) {
    loading = (async () => {
      const [json, image] = await Promise.all([
        fetch("/sprites/sheet.json").then((r) => r.json()),
        new Promise((ok, fail) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = fail;
          img.src = "/sprites/sheet.png";
        }),
      ]);
      return { image, frames: json.frames, animations: json.animations, fps: json.meta.fps };
    })();
  }
  return loading;
}

/** The atlas name of a pet's look: the first colour of each species is its plain name. */
export function petKey(species, color) {
  return color === SPECIES[species]?.colors[0] ? species : `${species}@${color}`;
}

/** Which frame of an animation shows at time t (seconds). */
export function frameAt(atlas, key, anim, t) {
  const names = atlas.animations[`${key}/${anim}`];
  if (!names) return `${key}/idle_0`;
  const fps = atlas.fps[`${key}/${anim}`] || 4;
  return names[Math.floor(t * fps) % names.length];
}

/** Draw a frame with its bottom-centre at (x, y). */
export function draw(ctx, atlas, frame, x, y, scale, flip = false) {
  const f = atlas.frames[frame];
  if (!f) return;
  const { x: sx, y: sy, w, h } = f.frame;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(atlas.image, sx, sy, w, h, Math.round((-w * scale) / 2), -h * scale, w * scale, h * scale);
  ctx.restore();
}

/**
 * Which animation shows how a pet is. Pets are drawn facing us (and to the
 * left) or walking away (to the right), mirrored for the other two ways;
 * away only shows while it idles or walks.
 */
export function animFor(cond, { walking = false, effect = null, away = false } = {}) {
  const anim = moodAnim(cond, walking, effect);
  if (away && anim === "walk") return "walk_back";
  if (away && anim === "idle") return "idle_back";
  return anim;
}

function moodAnim(cond, walking, effect) {
  if (cond.state === "egg") return "wobble";
  if (effect === "eat") return "eat";
  if (effect === "happy" || effect === "clean") return "happy";
  if (cond.state === "asleep") return "sleep";
  if (cond.state === "poorly") return "poorly";
  if (walking) return "walk";
  if (cond.state === "happy") return "happy";
  if (cond.state === "sad") return "sad";
  return "idle";
}
