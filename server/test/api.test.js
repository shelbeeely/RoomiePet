// The API end to end over HTTP, against an in-memory database and a clock the
// tests move by hand.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";

const HOUR = 3600000;
const DAY = 24 * HOUR;
let clock, server, base;

beforeEach(async () => {
  clock = Date.parse("2026-03-02T15:00:00Z"); // a Monday afternoon in UTC
  const app = createApp(openDb(), { now: () => clock, codeLimit: { max: 1000, windowMs: 1000 } });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function household() {
  const a = await call("POST", "/api/households", {
    householdName: "Flat 4B", name: "Ana", petName: "Mochi", species: "cat", color: "ginger", timezone: "UTC",
  });
  assert.equal(a.status, 201);
  const ana = a.data.token;
  const { data: s } = await call("GET", "/api/state", undefined, ana);
  const b = await call("POST", "/api/households/join", {
    code: s.household.inviteCode.toLowerCase(), name: "Ben", petName: "Pip", species: "chick", color: "sky",
  });
  assert.equal(b.status, 201);
  return { ana, ben: b.data.token, code: s.household.inviteCode };
}

const st = async (token) => (await call("GET", "/api/state", undefined, token)).data;
const meOf = (s) => s.members.find((m) => m.id === s.me);

test("making a household and joining it with the invite code", async () => {
  const { ana, ben, code } = await household();
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  const s = await st(ben);
  assert.equal(s.household.name, "Flat 4B");
  assert.deepEqual(s.members.map((m) => [m.name, m.pet.name, m.pet.species, m.pet.color, m.pet.stage]),
    [["Ana", "Mochi", "cat", "ginger", "egg"], ["Ben", "Pip", "chick", "sky", "egg"]]);
  assert.deepEqual(s.feed.map((e) => e.kind), ["joined", "joined"]);
  assert.equal((await call("POST", "/api/households/join", { code: "ZZZZZZ", name: "X", petName: "Y", species: "cat" })).status, 404);
  assert.equal((await call("GET", "/api/state")).status, 401);
  assert.equal((await call("GET", "/api/state", undefined, "made-up")).status, 401);
  assert.ok(ana);
});

test("what is checked on the way in", async () => {
  const bad = [
    [{ householdName: "", name: "A", petName: "B", species: "cat" }, /Household name/],
    [{ householdName: "H", name: "A", petName: "B", species: "dragon" }, /species/],
    [{ householdName: "H", name: "A", petName: "B", species: "cat", color: "sky" }, /cat comes in/],
    [{ householdName: "H", name: "A".repeat(31), petName: "B", species: "cat" }, /longer than 30/],
  ];
  for (const [body, why] of bad) {
    const r = await call("POST", "/api/households", body);
    assert.equal(r.status, 400);
    assert.match(r.data.error, why);
  }
  const { ana } = await household();
  for (const [body, why] of [
    [{ title: "Dishes", category: "nope" }, /category/],
    [{ title: "Dishes", effort: 5 }, /effort/],
    [{ title: "Dishes", recurrence: "every_n", everyDays: 0 }, /1 to 365/],
    [{ title: "Dishes", assignment: "fixed", assigneeId: "someone-else" }, /pick who/],
    [{ title: "Dishes", dueDate: "tomorrow" }, /date like/],
  ]) {
    const r = await call("POST", "/api/chores", body, ana);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.data.error, why);
  }
});

test("a chore done hatches the egg, feeds the right need, and comes back on schedule", async () => {
  const { ana } = await household();
  const add = await call("POST", "/api/chores", { title: "Dishes", category: "kitchen", effort: 2, recurrence: "daily" }, ana);
  assert.equal(add.status, 201);
  let s = await st(ana);
  const before = meOf(s).pet.stats;
  assert.equal(s.chores[0].dueToday, true);

  const done = await call("POST", `/api/chores/${add.data.id}/done`, {}, ana);
  assert.equal(done.status, 200);
  assert.deepEqual(done.data.gain, { food: 34, clean: 0, fun: 4 });
  assert.equal(done.data.xp, 20);
  assert.deepEqual(done.data.stage, { before: "egg", after: "baby" });

  s = await st(ana);
  const pet = meOf(s).pet;
  assert.equal(pet.stage, "baby");
  assert.equal(pet.stats.food, Math.min(100, before.food + 34));
  assert.equal(s.chores[0].dueDate, "2026-03-03", "daily: due again tomorrow");
  assert.deepEqual(s.feed.slice(0, 2).map((e) => e.kind).sort(), ["done", "hatched"]);
});

test("needs fade with time, faster with overdue chores, and never below zero", async () => {
  const { ana } = await household();
  const id = (await call("POST", "/api/chores", { title: "Bins", category: "trash", recurrence: "weekly" }, ana)).data.id;
  await call("POST", `/api/chores/${id}/done`, {}, ana); // hatch, so it starts to fade
  let pet = meOf(await st(ana)).pet;
  clock += 10 * HOUR;
  let later = meOf(await st(ana)).pet;
  assert.equal(later.stats.food, pet.stats.food - 20, "2 an hour");
  assert.equal(later.stats.fun, pet.stats.fun - 10, "1 an hour");

  // An overdue chore of mine makes fun fade faster.
  await call("POST", "/api/chores", { title: "Hoover", category: "cleaning", assignment: "fixed",
    assigneeId: (await st(ana)).me, dueDate: "2026-03-01" }, ana);
  pet = meOf(await st(ana)).pet;
  clock += 4 * HOUR;
  later = meOf(await st(ana)).pet;
  assert.equal(pet.stats.fun - later.stats.fun, 7, "1 an hour x 1.75 with one overdue");

  clock += 30 * DAY;
  later = meOf(await st(ana)).pet;
  assert.deepEqual(later.stats, { food: 0, clean: 0, fun: 0 });
});

test("an egg does not fade", async () => {
  const { ana } = await household();
  const pet = meOf(await st(ana)).pet;
  clock += 5 * DAY;
  assert.deepEqual(meOf(await st(ana)).pet.stats, pet.stats);
});

test("taking turns: the next person is up after each time, and leaving skips them", async () => {
  const { ana, ben } = await household();
  const s0 = await st(ana);
  const [anaId, benId] = s0.members.map((m) => m.id);
  const id = (await call("POST", "/api/chores", { title: "Bathroom", category: "bathroom", recurrence: "weekly",
    assignment: "rotate" }, ana)).data.id;
  let c = (await st(ana)).chores[0];
  assert.deepEqual(c.rotation, [anaId, benId]);
  assert.equal(c.assigneeId, anaId);
  await call("POST", `/api/chores/${id}/done`, {}, ana);
  c = (await st(ana)).chores[0];
  assert.equal(c.assigneeId, benId);
  assert.equal(c.dueDate, "2026-03-09");

  // Ana covers Ben's turn: her pet gets it, the feed says so, and it goes back to Ana's turn next.
  const done = await call("POST", `/api/chores/${id}/done`, {}, ana);
  const s = await st(ben);
  assert.equal(s.feed[0].data.coveredFor, benId);
  assert.equal(s.chores[0].assigneeId, anaId);
  assert.ok(done.data.xp > 0);

  // Ben leaves: his turns go; his fixed chores become anyone's.
  await call("POST", "/api/chores", { title: "Plants", category: "plants", assignment: "fixed", assigneeId: benId }, ana);
  assert.equal((await call("DELETE", "/api/me", undefined, ben)).status, 200);
  const after = await st(ana);
  assert.deepEqual(after.members.map((m) => m.name), ["Ana"]);
  const plants = after.chores.find((c) => c.title === "Plants");
  assert.equal(plants.assignment, "anyone");
  assert.deepEqual(after.chores.find((c) => c.title === "Bathroom").rotation, [anaId]);
  assert.equal((await call("GET", "/api/state", undefined, ben)).status, 401, "signed out everywhere");
});

test("a one-off chore is gone once done", async () => {
  const { ana } = await household();
  const id = (await call("POST", "/api/chores", { title: "Return parcel", category: "errands", recurrence: "once" }, ana)).data.id;
  await call("POST", `/api/chores/${id}/done`, {}, ana);
  assert.equal((await st(ana)).chores.length, 0);
  assert.equal((await call("POST", `/api/chores/${id}/done`, {}, ana)).status, 404, "not done twice");
});

test("kudos: once per roommate, not for your own, and it cheers their pet", async () => {
  const { ana, ben } = await household();
  const id = (await call("POST", "/api/chores", { title: "Dishes", category: "kitchen" }, ana)).data.id;
  const eventId = (await call("POST", `/api/chores/${id}/done`, {}, ana)).data.eventId;
  const fun = meOf(await st(ana)).pet.stats.fun;
  assert.equal((await call("POST", `/api/feed/${eventId}/kudos`, {}, ana)).status, 400);
  assert.equal((await call("POST", `/api/feed/${eventId}/kudos`, {}, ben)).status, 200);
  assert.equal((await call("POST", `/api/feed/${eventId}/kudos`, {}, ben)).status, 409);
  const s = await st(ana);
  assert.equal(meOf(s).pet.stats.fun, Math.min(100, fun + 8));
  assert.equal(s.feed.find((e) => e.id === eventId).kudos.length, 1);
});

test("patting: not an egg, and only every ten minutes", async () => {
  const { ana } = await household();
  assert.equal((await call("POST", "/api/pet/pat", {}, ana)).status, 400);
  const id = (await call("POST", "/api/chores", { title: "Dishes", category: "kitchen" }, ana)).data.id;
  await call("POST", `/api/chores/${id}/done`, {}, ana);
  assert.equal((await call("POST", "/api/pet/pat", {}, ana)).status, 200);
  const again = await call("POST", "/api/pet/pat", {}, ana);
  assert.equal(again.status, 429);
  assert.match(again.data.error, /10 min/);
  clock += 11 * 60000;
  assert.equal((await call("POST", "/api/pet/pat", {}, ana)).status, 200);
});

test("a second device signs in with a one-time code", async () => {
  const { ana } = await household();
  const { data } = await call("POST", "/api/me/device-code", {}, ana);
  assert.match(data.code, /^[A-HJ-NP-Z2-9]{8}$/);
  const phone = await call("POST", "/api/device", { code: data.code });
  assert.equal(phone.status, 201);
  assert.equal((await st(phone.data.token)).members[0].name, "Ana");
  assert.equal((await call("POST", "/api/device", { code: data.code })).status, 404, "used up");
  const late = (await call("POST", "/api/me/device-code", {}, ana)).data.code;
  clock += 16 * 60000;
  assert.equal((await call("POST", "/api/device", { code: late })).status, 404, "expired");
});

test("households cannot see each other's chores", async () => {
  const { ana } = await household();
  const other = (await call("POST", "/api/households", { householdName: "Other", name: "Zed", petName: "Z", species: "bunny" })).data.token;
  const id = (await call("POST", "/api/chores", { title: "Secret", category: "other" }, ana)).data.id;
  assert.equal((await st(other)).chores.length, 0);
  assert.equal((await call("POST", `/api/chores/${id}/done`, {}, other)).status, 404);
  assert.equal((await call("PATCH", `/api/chores/${id}`, { title: "Mine" }, other)).status, 404);
  assert.equal((await call("DELETE", `/api/chores/${id}`, undefined, other)).status, 404);
});

test("the live stream says when something changed", async () => {
  const { ana, ben } = await household();
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/events?token=${ben}`, { signal: ctrl.signal });
  assert.match(res.headers.get("content-type"), /^text\/event-stream/);
  const reader = res.body.getReader();
  let seen = "";
  const read = (async () => {
    while (!seen.includes("event: changed")) seen += new TextDecoder().decode((await reader.read()).value);
  })();
  await call("POST", "/api/chores", { title: "Dishes", category: "kitchen" }, ana);
  await read;
  ctrl.abort();
  assert.match(seen, /event: hello[\s\S]*event: changed/);
});

test("a room arranged in the builder is kept for the household, checked as the app checks it", async () => {
  const { ana, ben } = await household();
  assert.deepEqual((await st(ana)).rooms, {});
  const layout = {
    wall: "night", floor: "carpet",
    items: [
      { kind: "bed", color: "pink", x: 0.5, y: 12, rot: 0, extra: "dropped" },
      { kind: "pet_bed", color: "sun", x: 6, y: 13, rot: 1 },
      { kind: "window", color: "oak", side: "s", line: 25, at: 2 },
    ],
  };
  const r = await call("PUT", "/api/rooms/bedB", { layout }, ana);
  assert.equal(r.status, 200);
  const seen = (await st(ben)).rooms.bedB;
  assert.equal(seen.wall, "night");
  assert.deepEqual(seen.items[0], { kind: "bed", color: "pink", x: 0.5, y: 12, rot: 0 });
  assert.equal(seen.items.length, 3);

  const bad = [
    [{ ...layout, items: [{ kind: "bed", color: "pink", x: 9, y: 12, rot: 0 }] }, /doesn't fit/],                // through the wall
    [{ ...layout, items: [{ kind: "sofa", color: "teal", x: 7, y: 18, rot: 1 }] }, /blocks a doorway/],
    [{ ...layout, items: [{ kind: "window", color: "oak", side: "n", line: 12, at: 2 }] }, /outside wall/],  // onto bedroom 1
    [{ ...layout, items: [layout.items[0], { ...layout.items[0], x: 1 }] }, /overlaps/],
    [{ ...layout, items: [{ kind: "__proto__", color: "pink", x: 1, y: 13, rot: 0 }] }, /catalog/],
    [{ ...layout, wall: "plaid" }, /wallpaper/],
  ];
  for (const [l, why] of bad) {
    const res = await call("PUT", "/api/rooms/bedB", { layout: l }, ben);
    assert.equal(res.status, 400, JSON.stringify(l));
    assert.match(res.data.error, why);
  }
  assert.equal((await call("PUT", "/api/rooms/attic", { layout }, ana)).status, 404);
  assert.equal((await st(ana)).rooms.bedB.wall, "night");

  // Another household's flat is its own.
  const other = await call("POST", "/api/households", { householdName: "Next door", name: "Zed", petName: "Z", species: "cat", timezone: "UTC" });
  assert.deepEqual((await st(other.data.token)).rooms, {});

  // Back as it came.
  assert.equal((await call("DELETE", "/api/rooms/bedB", undefined, ana)).status, 200);
  assert.deepEqual((await st(ben)).rooms, {});
});
