// Chores: when they are due, who is up next, what happens when one is done.
// Dates are plain "YYYY-MM-DD" strings in the household's time zone, so
// "due today" means the same thing on every roommate's phone.

export const RECURRENCES = {
  once: "Once",
  daily: "Every day",
  weekly: "Every week",
  every_n: "Every few days",
};

export const ASSIGNMENTS = {
  anyone: "Anyone",
  fixed: "One person",
  rotate: "Take turns",
};

export function todayIn(timeZone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
}

export function intervalDays(chore) {
  if (chore.recurrence === "daily") return 1;
  if (chore.recurrence === "weekly") return 7;
  if (chore.recurrence === "every_n") return Math.max(1, Math.min(365, Number(chore.every_days) || 1));
  return null;
}

/** Where a chore stands today: overdue by how many days, due today, or days left. */
export function dueStatus(chore, today) {
  const left = daysBetween(today, chore.due_date);
  return { overdue: left < 0, dueToday: left === 0, daysLeft: left };
}

/** Who is up after `current` in a rotation, skipping anyone who has left. */
export function nextInRotation(rotation, current, memberIds) {
  const present = rotation.filter((id) => memberIds.includes(id));
  if (!present.length) return null;
  const i = present.indexOf(current);
  return present[(i + 1) % present.length];
}

/**
 * The chore after it is done today: archived if it was a one-off, otherwise
 * due again an interval from today (done early or late, the clock restarts
 * from when it was actually done), and with the next person if they take turns.
 */
export function afterDone(chore, today, memberIds) {
  const days = intervalDays(chore);
  if (days === null) return { archived: 1, due_date: chore.due_date, assignee_id: chore.assignee_id };
  let assignee = chore.assignee_id;
  if (chore.assignment === "rotate") {
    assignee = nextInRotation(chore.rotation || [], chore.assignee_id, memberIds) ?? chore.assignee_id;
  }
  return { archived: 0, due_date: addDays(today, days), assignee_id: assignee };
}

/** Today's list order: overdue first (most overdue on top), then by due date, then title. */
export function sortChores(chores, today) {
  return [...chores].sort(
    (a, b) => daysBetween(today, a.due_date) - daysBetween(today, b.due_date) || a.title.localeCompare(b.title),
  );
}
