// What a roommate is told, and when: a morning list of their chores, their
// pet needing them, someone covering for them or cheering them, a turn
// coming round to them. Each kind can be turned off; the defaults tell you
// about you and your pet, not everything everyone does.
import { CATEGORIES } from "./pet.js";

export const NOTIFY_KINDS = {
  digest: { label: "My chores for the day", hint: "One message in the morning, only when something is due" },
  pet: { label: "My pet needs me", hint: "When it gets hungry, grubby, bored or poorly" },
  assigned: { label: "A chore comes to me", hint: "Someone gives you one, or it's your turn" },
  covered: { label: "Someone covers for me", hint: "A roommate did one of yours" },
  cheers: { label: "Cheers", hint: "Someone sent 💖 for your chore" },
  roommates: { label: "Every chore anyone does", hint: "Chatty -- off unless you like it" },
};

export const NOTIFY_DEFAULTS = {
  digest: true, digestHour: 9, pet: true, assigned: true, covered: true, cheers: true, roommates: false,
};

export function prefsOf(stored) {
  let p = {};
  try {
    p = typeof stored === "string" ? JSON.parse(stored || "{}") : stored || {};
  } catch {
    p = {};
  }
  const out = { ...NOTIFY_DEFAULTS };
  for (const k of Object.keys(NOTIFY_DEFAULTS)) {
    if (k === "digestHour") {
      const h = Number(p.digestHour);
      if (Number.isInteger(h) && h >= 0 && h <= 23) out.digestHour = h;
    } else if (typeof p[k] === "boolean") out[k] = p[k];
  }
  return out;
}

export function hourIn(timeZone, now = new Date()) {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  } catch {
    return now.getUTCHours();
  }
}

const list = (titles) => {
  if (titles.length <= 2) return titles.join(" and ");
  return `${titles.slice(0, 2).join(", ")} and ${titles.length - 2} more`;
};

/** The chores that are this roommate's to do: theirs or their turn, plus anyone's -- due today or late. */
export function openFor(memberId, chores) {
  return chores.filter(
    (c) => (c.overdue || c.dueToday) && (c.assignment === "anyone" || c.assigneeId === memberId),
  );
}

/** The morning message, or null when there is nothing due (no message is better than "nothing today"). */
export function digest(memberId, chores, petLine = "") {
  const mine = openFor(memberId, chores);
  if (!mine.length) return null;
  const late = mine.filter((c) => c.overdue).length;
  const title = mine.length === 1 ? `1 chore today: ${mine[0].title}` : `${mine.length} chores today`;
  const body = [mine.length > 1 ? list(mine.map((c) => c.title)) : "", late ? `${late} late` : "", petLine]
    .filter(Boolean)
    .join(" · ");
  return { title, body: body || "Tap to see it", tag: "digest", url: "/" };
}

const PET_ALERTS = {
  food: { at: 25, rearm: 50, say: (n) => `${n} is hungry 🍖`, hint: "A kitchen or groceries chore would feed it." },
  clean: { at: 25, rearm: 50, say: (n) => `${n} is grubby 🫧`, hint: "Cleaning, laundry or trash would freshen it up." },
  fun: { at: 25, rearm: 50, say: (n) => `${n} is bored 🎈`, hint: "Any chore cheers it up." },
};

/**
 * Pet alerts due now, and the alert state to keep. Each need alerts once when
 * it drops below 25 and is re-armed only when it is back above 50 -- so a pet
 * hovering around the line does not nag. Poorly (two needs under 15) alerts
 * on its own, once.
 */
export function petAlerts(petName, stats, alerted = {}) {
  const next = { ...alerted };
  const out = [];
  for (const [need, a] of Object.entries(PET_ALERTS)) {
    if (stats[need] < a.at && !alerted[need]) {
      out.push({ title: a.say(petName), body: a.hint, tag: `pet-${need}`, url: "/" });
      next[need] = true;
    } else if (stats[need] > a.rearm && alerted[need]) next[need] = false;
  }
  const poorly = Object.keys(PET_ALERTS).filter((n) => stats[n] < 15).length >= 2;
  if (poorly && !alerted.poorly) {
    out.length = 0; // one message saying the important thing, not three
    out.push({ title: `${petName} is feeling poorly 🤒`, body: "A chore or two would help it feel better.", tag: "pet-poorly", url: "/" });
    next.poorly = true;
  } else if (!poorly && alerted.poorly && Object.keys(PET_ALERTS).every((n) => stats[n] > 30)) next.poorly = false;
  return { send: out, alerted: next };
}

export function doneLine(who, title, category) {
  return `${who} did ${title} ${CATEGORIES[category]?.icon || "✨"}`;
}
