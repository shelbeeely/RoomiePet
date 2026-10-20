// The rules both the server and the app go by: pets' needs and growing up, and chores' schedules.
import { describe, expect, test } from "vitest";
import { SPECIES, apply, choreReward, conditionOf, settle, stageFor, nextStage, sayHow } from "./pet.js";
import { addDays, afterDone, daysBetween, dueStatus, nextInRotation, sortChores, todayIn } from "./chores.js";

const HOUR = 3600000;

import { readFileSync } from "node:fs";

describe("pets", () => {
  test("every species and colour the app offers has its art", () => {
    const atlas = JSON.parse(readFileSync(new URL("../client/public/sprites/sheet.json", import.meta.url)));
    for (const [species, { colors }] of Object.entries(SPECIES)) {
      colors.forEach((color, i) => {
        const key = i === 0 ? species : `${species}@${color}`;
        for (const anim of ["idle", "walk", "happy", "sad", "sleep", "eat", "poorly"]) {
          expect(atlas.animations[`${key}/${anim}`], `${key}/${anim}`).toBeTruthy();
        }
      });
    }
  });

  test("growing up by xp", () => {
    expect([0, 9, 10, 199, 200, 600, 5000].map((x) => stageFor(x).id)).toEqual(["egg", "egg", "baby", "baby", "grown", "star", "star"]);
    expect(nextStage(0).id).toBe("baby");
    expect(nextStage(600)).toBeNull();
  });

  test("needs fade by the hour, faster with overdue chores, capped at four", () => {
    const full = { food: 100, clean: 100, fun: 100 };
    expect(settle(full, 0, 10 * HOUR, { xp: 50 })).toEqual({ food: 80, clean: 87.5, fun: 90 });
    expect(settle(full, 0, 10 * HOUR, { xp: 50, overdueMine: 2 }).fun).toBe(75);
    expect(settle(full, 0, 10 * HOUR, { xp: 50, overdueMine: 99 })).toEqual(settle(full, 0, 10 * HOUR, { xp: 50, overdueMine: 4 }));
    expect(settle(full, 0, 10 * HOUR, { xp: 0 })).toEqual(full);
    expect(settle(full, 0, 1000 * HOUR, { xp: 50 })).toEqual({ food: 0, clean: 0, fun: 0 });
    expect(settle(full, 5 * HOUR, 0, { xp: 50 })).toEqual(full);
  });

  test("a chore meets its need, by effort, and kudos never pass 100", () => {
    expect(choreReward("laundry", 3)).toEqual({ gain: { food: 0, clean: 48, fun: 4 }, xp: 30 });
    expect(choreReward("whatever", 9)).toEqual({ gain: { food: 0, clean: 0, fun: 52 }, xp: 30 });
    expect(apply({ food: 90, clean: 10, fun: 0 }, { food: 34, clean: 0, fun: 4 })).toEqual({ food: 100, clean: 10, fun: 4 });
  });

  test("how it is: egg, poorly, just cheered, asleep at night, sad, happy", () => {
    const at = (stats, o = {}) => conditionOf(stats, { xp: 50, now: 100 * HOUR, hour: 14, ...o }).state;
    expect(at({ food: 90, clean: 90, fun: 90 }, { xp: 0 })).toBe("egg");
    expect(at({ food: 10, clean: 10, fun: 90 })).toBe("poorly");
    expect(at({ food: 40, clean: 30, fun: 20 }, { joyAt: 100 * HOUR - 60000 })).toBe("happy");
    expect(at({ food: 60, clean: 60, fun: 60 }, { hour: 2 })).toBe("asleep");
    expect(at({ food: 30, clean: 30, fun: 30 })).toBe("sad");
    expect(at({ food: 90, clean: 80, fun: 70 })).toBe("happy");
    expect(at({ food: 60, clean: 60, fun: 60 })).toBe("ok");
    const c = conditionOf({ food: 20, clean: 80, fun: 80 }, { xp: 50, hour: 14 });
    expect(c.flags).toEqual({ hungry: true, grubby: false, bored: false });
    expect(sayHow("Mochi", c)).toMatch(/hungry/);
  });
});

describe("chores", () => {
  test("dates", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-03-01", "2026-03-08")).toBe(7);
    // 01:00 UTC is still the day before in Los Angeles.
    expect(todayIn("America/Los_Angeles", new Date("2026-03-02T01:00:00Z"))).toBe("2026-03-01");
    expect(todayIn("Not/AZone", new Date("2026-03-02T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("due, late, or in a few days", () => {
    expect(dueStatus({ due_date: "2026-03-01" }, "2026-03-03")).toEqual({ overdue: true, dueToday: false, daysLeft: -2 });
    expect(dueStatus({ due_date: "2026-03-03" }, "2026-03-03").dueToday).toBe(true);
  });

  test("done: one-offs end; repeats restart from the day done; turns move on", () => {
    expect(afterDone({ recurrence: "once", due_date: "2026-03-01" }, "2026-03-05", []).archived).toBe(1);
    expect(afterDone({ recurrence: "weekly", due_date: "2026-03-01" }, "2026-03-05", []).due_date).toBe("2026-03-12");
    expect(afterDone({ recurrence: "every_n", every_days: 3, due_date: "2026-03-09" }, "2026-03-05", []).due_date).toBe("2026-03-08");
    const turn = { recurrence: "daily", assignment: "rotate", rotation: ["a", "b", "c"], assignee_id: "c" };
    expect(afterDone(turn, "2026-03-05", ["a", "b", "c"]).assignee_id).toBe("a");
    expect(nextInRotation(["a", "b", "c"], "a", ["a", "c"])).toBe("c");
    expect(nextInRotation(["a", "b"], "b", [])).toBeNull();
  });

  test("the list: latest first, then soonest, then by name", () => {
    const list = sortChores([
      { title: "b", due_date: "2026-03-05" }, { title: "a", due_date: "2026-03-05" },
      { title: "late", due_date: "2026-03-01" }, { title: "soon", due_date: "2026-03-04" },
    ], "2026-03-03");
    expect(list.map((c) => c.title)).toEqual(["late", "soon", "a", "b"]);
  });
});

import { digest, hourIn, openFor, petAlerts, prefsOf } from "./notify.js";
import { matchChore } from "./match.js";

describe("notifications", () => {
  const chores = [
    { id: "1", title: "Dishes", assignment: "anyone", dueToday: true, overdue: false },
    { id: "2", title: "Bins", assignment: "rotate", assigneeId: "ben", dueToday: true, overdue: false },
    { id: "3", title: "Plants", assignment: "fixed", assigneeId: "ana", overdue: true },
    { id: "4", title: "Hoover", assignment: "fixed", assigneeId: "ana", daysLeft: 3 },
  ];

  test("prefs: defaults, and only sensible values kept", () => {
    expect(prefsOf("")).toMatchObject({ digest: true, digestHour: 9, roommates: false });
    expect(prefsOf('{"digest":false,"digestHour":7,"roommates":"yes"}')).toMatchObject({ digest: false, digestHour: 7, roommates: false });
    expect(prefsOf({ digestHour: 25 }).digestHour).toBe(9);
    expect(prefsOf("not json").pet).toBe(true);
  });

  test("the morning list: yours and anyone's, due or late; nothing when nothing is due", () => {
    expect(openFor("ana", chores).map((c) => c.id)).toEqual(["1", "3"]);
    expect(digest("ana", chores, "Mochi is hungry")).toEqual({
      title: "2 chores today", body: "Dishes and Plants · 1 late · Mochi is hungry", tag: "digest", url: "/",
    });
    expect(digest("ben", [chores[1]]).title).toBe("1 chore today: Bins");
    expect(digest("cleo", [chores[3]])).toBeNull();
  });

  test("pet alerts: once under 25, again only after it was back over 50; poorly says it alone", () => {
    let r = petAlerts("Mochi", { food: 20, clean: 80, fun: 80 });
    expect(r.send.map((m) => m.tag)).toEqual(["pet-food"]);
    r = petAlerts("Mochi", { food: 10, clean: 80, fun: 80 }, r.alerted);
    expect(r.send).toEqual([]);
    r = petAlerts("Mochi", { food: 40, clean: 80, fun: 80 }, r.alerted);
    r = petAlerts("Mochi", { food: 20, clean: 80, fun: 80 }, r.alerted);
    expect(r.send).toEqual([]);
    r = petAlerts("Mochi", { food: 60, clean: 80, fun: 80 }, r.alerted);
    expect(petAlerts("Mochi", { food: 20, clean: 80, fun: 80 }, r.alerted).send.length).toBe(1);
    const p = petAlerts("Mochi", { food: 5, clean: 10, fun: 50 });
    expect(p.send.map((m) => m.tag)).toEqual(["pet-poorly"]);
  });

  test("the hour where the household is", () => {
    expect(hourIn("Asia/Tokyo", new Date("2026-03-02T00:30:00Z"))).toBe(9);
    expect(hourIn("Europe/London", new Date("2026-03-02T23:30:00Z"))).toBe(23);
  });
});

describe("finding the chore someone said", () => {
  const chores = [
    { id: "1", title: "Do the dishes", assignment: "anyone" },
    { id: "2", title: "Take out bins", assignment: "rotate", assigneeId: "ben" },
    { id: "3", title: "Take out recycling", assignment: "fixed", assigneeId: "ana" },
    { id: "4", title: "Water plants", assignment: "fixed", assigneeId: "ana" },
  ];
  test("by words, forgiving of how it was said", () => {
    expect(matchChore("I did the dishes", chores, "ana").chore.id).toBe("1");
    expect(matchChore("dishes", chores, "ana").chore.id).toBe("1");
    expect(matchChore("watered the plant", chores, "ana").chore.id).toBe("4");
    expect(matchChore("the bins", chores, "ben").chore.id).toBe("2");
  });
  test("ambiguous or unknown says so, with what there is", () => {
    const amb = matchChore("take out", chores, "cleo");
    expect(amb.chore).toBeNull();
    expect(amb.candidates.map((c) => c.id).sort()).toEqual(["2", "3"]);
    expect(matchChore("walk the dog", chores, "ana").chore).toBeNull();
    // Yours wins a tie.
    expect(matchChore("take out", chores, "ana").chore.id).toBe("3");
  });
});
