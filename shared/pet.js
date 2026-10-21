// How a roommate's pet lives: three needs that fade over time and are met by
// doing chores, a mood made of them, and growing up with every chore done.
// Shared by the server (which keeps the real numbers) and the app (which
// shows them), so both agree.
//
// A pet never dies. Left alone it gets hungry, grubby and bored, then sad,
// then poorly -- and one chore starts bringing it back. The point is a nudge,
// not guilt.

export const NEEDS = ["food", "clean", "fun"];

// Points lost per hour, out of 100. From full: hungry in about two days,
// grubby in three, bored in four -- so a pet looked after a few times a week
// stays well.
export const DECAY_PER_HOUR = { food: 2.0, clean: 1.25, fun: 1.0 };

// Which need a kind of chore meets. Anything else is fun: a pet likes to see
// its person get things done.
export const CATEGORIES = {
  kitchen: { label: "Kitchen", need: "food", icon: "🍽️" },
  groceries: { label: "Groceries", need: "food", icon: "🛒" },
  cleaning: { label: "Cleaning", need: "clean", icon: "🧽" },
  bathroom: { label: "Bathroom", need: "clean", icon: "🛁" },
  laundry: { label: "Laundry", need: "clean", icon: "🧺" },
  trash: { label: "Trash", need: "clean", icon: "🗑️" },
  plants: { label: "Plants & pets", need: "fun", icon: "🪴" },
  errands: { label: "Errands", need: "fun", icon: "📦" },
  other: { label: "Other", need: "fun", icon: "✨" },
};

export const EFFORTS = { 1: "Quick", 2: "Medium", 3: "Big" };

// Growing up, by chores done (xp). The egg hatches with the first chore.
export const STAGES = [
  { id: "egg", xp: 0, label: "Egg" },
  { id: "baby", xp: 10, label: "Baby" },
  { id: "grown", xp: 200, label: "Grown" },
  { id: "star", xp: 600, label: "Star" },
];

export const SPECIES = {
  cat: { label: "Cat", colors: ["cream", "ginger", "charcoal", "mint"] },
  bunny: { label: "Bunny", colors: ["snow", "cocoa", "pebble", "blush"] },
  chick: { label: "Chick", colors: ["sunny", "sky", "rose", "sprout"] },
  lop: { label: "Lop bunny", colors: ["honey", "snow", "smoke", "choc"] },
  stitched: { label: "Stitched bunny", colors: ["lilac", "mint", "bubblegum", "bone"] },
  raccoon: { label: "Raccoon", colors: ["grey", "cinnamon", "silver", "midnight"] },
  ferret: { label: "Ferret", colors: ["sable", "albino", "cinnamon", "silver"] },
  possum: { label: "Possum", colors: ["grey", "smoky", "cream", "blossom"] },
  kuromi: { label: "Kuromi", colors: ["black", "violet", "pink", "midnight"] },
};

export const PAT_COOLDOWN_MS = 10 * 60 * 1000;
export const JOY_MS = 10 * 60 * 1000; // how long "just did a chore / got kudos" shows as happy

const clamp = (v) => Math.max(0, Math.min(100, v));

export function stageFor(xp) {
  let stage = STAGES[0];
  for (const s of STAGES) if (xp >= s.xp) stage = s;
  return stage;
}

export function nextStage(xp) {
  return STAGES.find((s) => s.xp > xp) || null;
}

/**
 * The needs as they are `now`, from what they were at `since`. Overdue chores
 * of its person make a pet's fun fade faster (it notices); overdue chores
 * anyone could do make every pet's home grubbier a little faster.
 * An egg does not fade -- nothing to look after yet.
 */
export function settle(stats, since, now, { xp = 0, overdueMine = 0, overdueShared = 0 } = {}) {
  if (stageFor(xp).id === "egg") return { ...stats };
  const hours = Math.max(0, (now - since) / 3600000);
  const speed = {
    food: 1,
    clean: 1 + 0.25 * Math.min(overdueShared, 4),
    fun: 1 + 0.75 * Math.min(overdueMine, 4),
  };
  const out = {};
  for (const need of NEEDS) out[need] = clamp(stats[need] - DECAY_PER_HOUR[need] * speed[need] * hours);
  return out;
}

/** What doing a chore gives the doer's pet: its need, a little fun, and xp. */
export function choreReward(category, effort) {
  const e = Math.max(1, Math.min(3, Number(effort) || 1));
  const need = (CATEGORIES[category] || CATEGORIES.other).need;
  const gain = { food: 0, clean: 0, fun: 4 };
  gain[need] += 14 * e + 6;
  return { gain, xp: 10 * e };
}

export const KUDOS_GAIN = { food: 0, clean: 0, fun: 8 };
export const PAT_GAIN = { food: 0, clean: 0, fun: 3 };

export function apply(stats, gain) {
  const out = {};
  for (const need of NEEDS) out[need] = clamp(stats[need] + (gain[need] || 0));
  return out;
}

export function moodOf(stats) {
  return Math.round((stats.food + stats.clean + stats.fun) / 3);
}

/**
 * How the pet is, for what it looks like and what the app says about it.
 * `joyAt` is when it last had a chore done or kudos; `hour` the local hour
 * on the viewer's clock (pets sleep at night).
 */
export function conditionOf(stats, { xp = 0, joyAt = 0, now = Date.now(), hour = 12 } = {}) {
  const stage = stageFor(xp).id;
  const low = (n) => stats[n] < 25;
  const flags = { hungry: low("food"), grubby: low("clean"), bored: low("fun") };
  const mood = moodOf(stats);
  let state = "ok";
  if (stage === "egg") state = "egg";
  else if (NEEDS.filter((n) => stats[n] < 15).length >= 2) state = "poorly";
  else if (now - joyAt < JOY_MS) state = "happy";
  else if (hour >= 23 || hour < 7) state = "asleep";
  else if (mood < 35) state = "sad";
  else if (mood >= 75) state = "happy";
  return { state, mood, flags, stage };
}

/** One line on how it is, in its person's words. */
export function sayHow(petName, cond) {
  if (cond.state === "egg") return `${petName} is still an egg. Do a chore to hatch it!`;
  if (cond.state === "poorly") return `${petName} is feeling poorly. A chore or two would help.`;
  if (cond.state === "asleep") return `${petName} is asleep.`;
  const wants = [];
  if (cond.flags.hungry) wants.push("hungry (kitchen or groceries)");
  if (cond.flags.grubby) wants.push("grubby (cleaning, laundry, trash)");
  if (cond.flags.bored) wants.push("bored (any chore)");
  if (wants.length) return `${petName} is ${wants.join(", ")}.`;
  if (cond.state === "happy") return `${petName} is happy!`;
  if (cond.state === "sad") return `${petName} is a bit down.`;
  return `${petName} is doing fine.`;
}
