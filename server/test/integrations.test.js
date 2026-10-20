// Push notifications, Siri / Apple Shortcuts keys, and NFC tags, over real
// HTTP with an in-memory database, a hand-moved clock, and push messages
// caught instead of sent.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";

const HOUR = 3600000;
let clock, server, base, app, pushed, gone;

const SUB = (n) => ({
  endpoint: `https://web.push.apple.com/QG${n}`,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
});

beforeEach(async () => {
  clock = Date.parse("2026-03-02T05:00:00Z"); // 05:00 in London, early on a Monday
  pushed = [];
  gone = new Set();
  const send = async (sub, payload) => {
    if (gone.has(sub.endpoint)) throw Object.assign(new Error("gone"), { statusCode: 410 });
    pushed.push({ to: sub.endpoint, ...payload });
  };
  app = createApp(openDb(), { now: () => clock, codeLimit: { max: 1000, windowMs: 1000 }, send });
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
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function household() {
  const ana = (await call("POST", "/api/households", {
    householdName: "Flat", name: "Ana", petName: "Mochi", species: "cat", timezone: "Europe/London",
  })).data.token;
  const code = (await call("GET", "/api/state", undefined, ana)).data.household.inviteCode;
  const ben = (await call("POST", "/api/households/join", { code, name: "Ben", petName: "Pip", species: "chick" })).data.token;
  const s = (await call("GET", "/api/state", undefined, ana)).data;
  return { ana, ben, anaId: s.members[0].id, benId: s.members[1].id };
}

const chore = async (token, body) => (await call("POST", "/api/chores", { category: "other", ...body }, token)).data.id;

test("push: subscribing, only real push services, and forgetting ones that are gone", async () => {
  const { ana } = await household();
  assert.match((await call("GET", "/api/push/key", undefined, ana)).data.publicKey, /^[A-Za-z0-9_-]{80,}$/);
  assert.equal((await call("POST", "/api/push/subscribe", SUB(1), ana)).status, 201);
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/x", "https://jmt17.google.com/fcm/send/x",
    "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=x"]) {
    assert.equal((await call("POST", "/api/push/subscribe", { ...SUB(9), endpoint }, ana)).status, 201, endpoint);
    await call("POST", "/api/push/unsubscribe", { endpoint }, ana);
  }
  assert.equal((await call("POST", "/api/push/subscribe", { ...SUB(2), endpoint: "https://google.com.evil.example/x" }, ana)).status, 400);
  assert.equal((await call("POST", "/api/push/subscribe", { ...SUB(2), endpoint: "https://evil.example/x" }, ana)).status, 400);
  assert.equal((await call("POST", "/api/push/subscribe", { ...SUB(2), endpoint: "http://web.push.apple.com/x" }, ana)).status, 400);
  assert.equal((await call("POST", "/api/push/subscribe", { endpoint: SUB(3).endpoint }, ana)).status, 400);
  assert.equal((await call("GET", "/api/state", undefined, ana)).data.pushDevices, 1);

  const t = await call("POST", "/api/push/test", {}, ana);
  assert.equal(t.status, 200);
  assert.equal(pushed[0].title, "Mochi says hi 👋");

  gone.add(SUB(1).endpoint);
  await call("POST", "/api/push/test", {}, ana);
  assert.equal((await call("GET", "/api/state", undefined, ana)).data.pushDevices, 0, "410 from the push service: forgotten");
});

test("push: a chore given, a turn come round, covering for someone, and cheers reach the right person", async () => {
  const { ana, ben, benId } = await household();
  await call("POST", "/api/push/subscribe", SUB("ana"), ana);
  await call("POST", "/api/push/subscribe", SUB("ben"), ben);
  const to = (who) => pushed.filter((p) => p.to.endsWith(who));

  const plants = await chore(ana, { title: "Plants", assignment: "fixed", assigneeId: benId });
  assert.equal(to("ben").at(-1).title, "Ana gave you a chore: Plants");
  assert.equal(to("ben").at(-1).badge, 1, "the badge: how many chores are Ben's today");

  const bins = await chore(ana, { title: "Bins", assignment: "rotate" });
  await call("POST", `/api/chores/${bins}/done`, {}, ana);
  assert.equal(to("ben").at(-1).title, "Your turn next: Bins");

  const done = await call("POST", `/api/chores/${plants}/done`, {}, ana);
  assert.equal(to("ben").at(-1).title, "Ana did Plants for you 💪");
  assert.equal(to("ben").at(-1).badge, 0);

  await call("POST", `/api/feed/${done.data.eventId}/kudos`, {}, ben);
  assert.equal(to("ana").at(-1).title, "Ben cheered your Plants 💖");
  assert.equal(to("ana").length, 1, "Ana is not told about her own chores");

  // Turning a kind off stops it; "every chore anyone does" is off unless asked for.
  assert.deepEqual((await call("PATCH", "/api/me/notify", { cheers: false, roommates: true, digestHour: 30 }, ana)).data,
    { digest: true, digestHour: 9, pet: true, assigned: true, covered: true, cheers: false, roommates: true });
  const dishes = await chore(ben, { title: "Dishes" });
  await call("POST", `/api/chores/${dishes}/done`, {}, ben);
  assert.match(to("ana").at(-1).title, /^Ben did Dishes/);
  const ev = (await call("GET", "/api/state", undefined, ana)).data.feed[0].id;
  const before = to("ana").length;
  await call("POST", `/api/feed/${ev}/kudos`, {}, ana);
  await call("POST", `/api/feed/${ev}/kudos`, {}, ben).catch(() => {});
  assert.equal(to("ana").length, before);
});

test("the morning list comes once, at their hour, only with something due; pet alerts wait for daytime", async () => {
  const { ana, ben, anaId } = await household();
  await call("POST", "/api/push/subscribe", SUB("ana"), ana);
  await call("POST", "/api/push/subscribe", SUB("ben"), ben);
  const hatch = await chore(ana, { title: "Hatch", recurrence: "once" });
  await call("POST", `/api/chores/${hatch}/done`, {}, ana);
  await chore(ana, { title: "Dishes", assignment: "fixed", assigneeId: anaId, category: "kitchen" });
  pushed = [];

  await app.locals.tick(); // 05:00 London
  assert.equal(pushed.length, 0, "not yet");
  clock = Date.parse("2026-03-02T09:10:00Z"); // 09:10
  await app.locals.tick();
  await app.locals.tick();
  const morning = pushed.filter((p) => p.kind === "digest");
  assert.deepEqual(morning.map((p) => [p.to.slice(-3), p.title]), [["ana", "1 chore today: Dishes"]], "once, and none for Ben: nothing of his is due");

  // Two days on, Mochi is hungry: told once, in the daytime only.
  pushed = [];
  clock = Date.parse("2026-03-04T23:00:00Z");
  await app.locals.tick();
  assert.equal(pushed.filter((p) => p.kind === "pet").length, 0, "11pm: quiet");
  clock = Date.parse("2026-03-05T08:30:00Z");
  await app.locals.tick();
  await app.locals.tick();
  const pet = pushed.filter((p) => p.kind === "pet");
  assert.ok(pet.length >= 1 && pet.every((p) => p.to.endsWith("ana")), JSON.stringify(pet.map((p) => p.title)));
  assert.equal(new Set(pet.map((p) => p.tag)).size, pet.length, "each alert once");
  assert.ok(!pushed.some((p) => p.kind === "pet" && p.to.endsWith("ben")), "Pip is still an egg: no alerts");
});

test("Shortcuts keys: made from the app, limited to chores and tags, listed and revoked", async () => {
  const { ana } = await household();
  const made = await call("POST", "/api/me/keys", { label: "Ana's iPhone" }, ana);
  assert.equal(made.status, 201);
  const key = made.data.key;
  assert.equal((await call("GET", "/api/state", undefined, key)).status, 403);
  assert.equal((await call("POST", "/api/me/keys", {}, key)).status, 403, "a key cannot make keys");
  assert.equal((await call("DELETE", "/api/me", undefined, key)).status, 403);
  assert.equal((await call("GET", "/api/shortcuts/summary", undefined, key)).status, 200);

  const keys = (await call("GET", "/api/me/keys", undefined, ana)).data;
  assert.equal(keys.length, 1);
  assert.equal(keys[0].label, "Ana's iPhone");
  assert.ok(keys[0].lastUsedAt, "last used is kept");
  assert.equal((await call("DELETE", `/api/me/keys/${keys[0].id}`, undefined, ana)).status, 200);
  assert.equal((await call("GET", "/api/shortcuts/summary", undefined, key)).status, 401, "revoked");
});

test("Siri: what's on today, and 'I did the dishes' -- once, even if asked twice", async () => {
  const { ana, ben } = await household();
  const key = (await call("POST", "/api/me/keys", { label: "Siri" }, ana)).data.key;
  let r = (await call("GET", "/api/shortcuts/summary", undefined, key)).data;
  assert.equal(r.speak, "Nothing due for you today. Mochi is still an egg -- do a chore to hatch it.");

  await chore(ana, { title: "Do the dishes", category: "kitchen", effort: 2 });
  await chore(ana, { title: "Take out bins", category: "trash" });
  await chore(ana, { title: "Take out recycling", category: "trash" });
  r = (await call("GET", "/api/shortcuts/summary", undefined, key)).data;
  assert.equal(r.speak, "You have 3 chores today: Do the dishes, Take out bins and Take out recycling. Mochi is still an egg -- do a chore to hatch it.");
  assert.equal((await call("GET", "/api/shortcuts/chores", undefined, key)).data.length, 3);

  r = (await call("POST", "/api/shortcuts/done", { chore: "I did the dishes" }, key)).data;
  assert.deepEqual([r.ok, r.speak], [true, "Done! Mochi hatched!"]);
  r = (await call("POST", "/api/shortcuts/done", { chore: "dishes" }, key)).data;
  assert.deepEqual([r.ok, r.speak], [false, "Do the dishes was already done 1 minute ago by you."]);

  r = (await call("POST", "/api/shortcuts/done", { chore: "take out" }, key)).data;
  assert.equal(r.ok, false);
  assert.match(r.speak, /^Which one: Take out (bins|recycling) and Take out (bins|recycling)\?$/);
  r = (await call("POST", "/api/shortcuts/done", { chore: "walk the dog" }, key)).data;
  assert.match(r.speak, /^I couldn't find "walk the dog"/);
  r = (await call("POST", "/api/shortcuts/done", { id: "Take out bins" }, key)).data;
  assert.equal(r.speak, "Done! Mochi got 20 clean and 4 fun.");

  const feed = (await call("GET", "/api/state", undefined, ben)).data.feed;
  assert.equal(feed.filter((e) => e.kind === "done").length, 2);
  assert.equal(feed[0].data.via, "siri");
});

test("NFC tags: made for a chore, tapped from the app or a Shortcuts automation, never twice in half an hour", async () => {
  const { ana, ben } = await household();
  const dishes = await chore(ana, { title: "Dishes", category: "kitchen" });
  const made = await call("POST", "/api/tags", { choreId: dishes, label: "Dishwasher" }, ana);
  assert.equal(made.status, 201);
  const { id, path } = made.data;
  assert.match(id, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(path, `/t/${id}`);
  assert.deepEqual((await call("GET", "/api/state", undefined, ben)).data.tags, [{ id, label: "Dishwasher", choreId: dishes, choreTitle: "Dishes" }]);

  assert.equal((await call("GET", `/api/tags/${id}`)).status, 401, "a tag alone does nothing");
  assert.equal((await call("GET", `/api/tags/${id}`, undefined, ben)).data.chore.title, "Dishes");

  let tap = (await call("POST", `/api/tags/${id}/tap`, {}, ben)).data;
  assert.deepEqual([tap.ok, tap.speak], [true, "Done! Pip hatched!"]);
  const key = (await call("POST", "/api/me/keys", { label: "NFC" }, ana)).data.key;
  tap = (await call("POST", `/api/tags/${id}/tap`, {}, key)).data;
  assert.deepEqual([tap.ok, tap.already, tap.speak], [false, true, "Dishes was already done 1 minute ago by Ben."]);
  clock += 31 * 60000;
  tap = (await call("POST", `/api/tags/${id}/tap`, {}, key)).data;
  assert.equal(tap.ok, true, "half an hour later it counts again");

  // Another household's phone can't use it; a removed chore says so; tags can be re-pointed and removed.
  const other = (await call("POST", "/api/households", { householdName: "B", name: "Zed", petName: "Z", species: "bunny" })).data.token;
  assert.equal((await call("POST", `/api/tags/${id}/tap`, {}, other)).status, 404);
  await call("DELETE", `/api/chores/${dishes}`, undefined, ana);
  tap = (await call("POST", `/api/tags/${id}/tap`, {}, ben)).data;
  assert.deepEqual([tap.ok, tap.speak], [false, "The Dishwasher tag's chore was removed. Set the tag up again in RoomiePet."]);
  const bins = await chore(ana, { title: "Bins", category: "trash" });
  assert.equal((await call("PATCH", `/api/tags/${id}`, { choreId: bins }, ana)).status, 200);
  assert.equal((await call("POST", `/api/tags/${id}/tap`, {}, ben)).data.chore, "Bins");
  assert.equal((await call("POST", "/api/tags", { choreId: "nope" }, ana)).status, 400);
  assert.equal((await call("DELETE", `/api/tags/${id}`, undefined, ana)).status, 200);
  assert.equal((await call("GET", "/api/state", undefined, ana)).data.tags.length, 0);
});
