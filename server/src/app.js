// The RoomiePet API: households, roommates and their pets, chores, and a live
// stream so every phone sees a chore done the moment it is.
import crypto from "node:crypto";
import express from "express";
import { tx } from "./db.js";
import { Hub } from "./hub.js";
import {
  CATEGORIES, PAT_COOLDOWN_MS, KUDOS_GAIN, PAT_GAIN, SPECIES,
  apply, choreReward, settle, stageFor, nextStage,
} from "../../shared/pet.js";
import { ASSIGNMENTS, RECURRENCES, afterDone, dueStatus, sortChores, todayIn } from "../../shared/chores.js";
import { NOTIFY_KINDS, digest, doneLine, hourIn, openFor, petAlerts, prefsOf } from "../../shared/notify.js";
import { matchChore } from "../../shared/match.js";
import { ROOMS, cleanLayout, layoutProblem } from "../../shared/home.js";
import { Pusher, makeSender, vapidKeys } from "./push.js";

const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // nothing that reads as another letter
const FEED_LIMIT = 40;
// A tag tapped twice, or Siri asked twice: a chore done this recently is not done again.
const RECENT_DONE_MS = 30 * 60 * 1000;
// Pet alerts wait for daytime where the household is.
const QUIET = { from: 21, to: 8 };
// What an Apple Shortcuts key may do: the Shortcut-shaped endpoints and NFC tags, nothing else.
const KEY_PATHS = [/^\/api\/shortcuts\//, /^\/api\/tags\/[\w-]+(\/tap)?$/];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const newId = () => crypto.randomUUID();
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const code = (n) => Array.from({ length: n }, () => INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)]).join("");

function text(value, field, max = 60) {
  const v = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!v) throw new HttpError(400, `${field} is needed`);
  if (v.length > max) throw new HttpError(400, `${field} is longer than ${max} characters`);
  return v;
}

function oneOf(value, allowed, field) {
  if (!Object.hasOwn(allowed, value)) throw new HttpError(400, `${field} must be one of ${Object.keys(allowed).join(", ")}`);
  return value;
}

function validDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(new Date(`${value}T12:00:00Z`))) {
    throw new HttpError(400, `${field} must be a date like 2026-01-31`);
  }
  return value;
}

function validTimezone(tz) {
  if (typeof tz !== "string" || !tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function pet(body, current = {}) {
  const species = body.species ?? current.species;
  oneOf(species, SPECIES, "species");
  const color = body.color ?? current.color ?? SPECIES[species].colors[0];
  if (!SPECIES[species].colors.includes(color)) throw new HttpError(400, `a ${species} comes in ${SPECIES[species].colors.join(", ")}`);
  const petName = body.petName !== undefined ? text(body.petName, "Pet name", 24) : current.pet_name;
  return { species, color, petName };
}

/** A small per-address limit on the endpoints that guess at codes. */
function limiter({ max, windowMs }) {
  const hits = new Map();
  return (req, _res, next) => {
    const now = Date.now();
    const key = req.ip;
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return next(new HttpError(429, "Too many tries, wait a few minutes"));
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10000) hits.clear();
    next();
  };
}

export function createApp(db, { now = () => Date.now(), codeLimit = { max: 30, windowMs: 15 * 60 * 1000 }, send = null } = {}) {
  const app = express();
  const hub = new Hub();
  app.locals.hub = hub;
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    });
    next();
  });

  const q = (sql) => db.prepare(sql);
  const guard = limiter(codeLimit);
  const vapid = vapidKeys(db);
  const pusher = new Pusher(db, send || makeSender(vapid, process.env.VAPID_SUBJECT));
  app.locals.pusher = pusher;

  // -- who is asking ------------------------------------------------------

  function signIn(memberId, kind = "device", label = null) {
    const token = crypto.randomBytes(32).toString("base64url");
    q("INSERT INTO tokens (hash, member_id, created_at, kind, label) VALUES (?, ?, ?, ?, ?)")
      .run(hash(token), memberId, now(), kind, label);
    return token;
  }

  function auth(req, _res, next) {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : req.originalUrl.startsWith("/api/events?") ? req.query.token : "";
    if (!token || typeof token !== "string") return next(new HttpError(401, "Not signed in"));
    const row = q(`SELECT m.*, t.kind AS token_kind, t.hash AS token_hash FROM tokens t JOIN members m ON m.id = t.member_id
                  WHERE t.hash = ? AND m.left_at IS NULL`).get(hash(token));
    if (!row) return next(new HttpError(401, "Not signed in"));
    const { token_kind: kind, token_hash: tokenHash, ...me } = row;
    if (kind === "shortcut") {
      if (!KEY_PATHS.some((re) => re.test(req.originalUrl.split("?")[0]))) {
        return next(new HttpError(403, "A Shortcuts key can only do chores and tags -- open the app for the rest"));
      }
      q("UPDATE tokens SET last_used_at = ? WHERE hash = ?").run(now(), tokenHash);
    }
    req.me = me;
    req.tokenKind = kind;
    req.tokenHash = tokenHash;
    req.household = q("SELECT * FROM households WHERE id = ?").get(me.household_id);
    next();
  }

  const event = (hid, kind, memberId, data = {}) => {
    const id = newId();
    q("INSERT INTO events (id, household_id, kind, member_id, data, at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, hid, kind, memberId, JSON.stringify(data), now());
    return id;
  };

  const members = (hid) => q("SELECT * FROM members WHERE household_id = ? AND left_at IS NULL ORDER BY created_at").all(hid);

  // -- pets ---------------------------------------------------------------

  /** Bring every pet's needs up to now (they fade between visits) and keep the result. */
  function settleAll(household) {
    const today = todayIn(household.timezone, new Date(now()));
    const chores = q("SELECT * FROM chores WHERE household_id = ? AND archived = 0").all(household.id);
    const overdue = chores.filter((c) => dueStatus(c, today).overdue);
    const shared = overdue.filter((c) => c.assignment === "anyone").length;
    const t = now();
    for (const m of members(household.id)) {
      const mine = overdue.filter((c) => c.assignment !== "anyone" && c.assignee_id === m.id).length;
      const s = settle({ food: m.food, clean: m.clean, fun: m.fun }, m.stats_at, t,
        { xp: m.xp, overdueMine: mine, overdueShared: shared });
      q("UPDATE members SET food = ?, clean = ?, fun = ?, stats_at = ? WHERE id = ?").run(s.food, s.clean, s.fun, t, m.id);
    }
  }

  /** Give a pet something: its needs (settled first), xp, joy; a hatch or growing up goes in the feed. */
  function reward(member, gain, xp = 0, { joy = true } = {}) {
    const m = q("SELECT * FROM members WHERE id = ?").get(member.id);
    const s = apply({ food: m.food, clean: m.clean, fun: m.fun }, gain);
    const before = stageFor(m.xp);
    const after = stageFor(m.xp + xp);
    q("UPDATE members SET food = ?, clean = ?, fun = ?, xp = xp + ?, joy_at = CASE WHEN ? THEN ? ELSE joy_at END WHERE id = ?")
      .run(s.food, s.clean, s.fun, xp, joy ? 1 : 0, now(), m.id);
    if (after.id !== before.id) {
      event(m.household_id, after.id === "baby" ? "hatched" : "grew", m.id, { stage: after.id, petName: m.pet_name });
    }
    return { before: before.id, after: after.id };
  }

  function petView(m) {
    const stage = stageFor(m.xp);
    const next = nextStage(m.xp);
    return {
      name: m.pet_name, species: m.species, color: m.color, xp: m.xp, stage: stage.id,
      next: next && { stage: next.id, xp: next.xp },
      stats: { food: Math.round(m.food), clean: Math.round(m.clean), fun: Math.round(m.fun) },
      joyAt: m.joy_at, patAt: m.pat_at,
    };
  }

  function choresView(h) {
    const today = todayIn(h.timezone, new Date(now()));
    return q("SELECT * FROM chores WHERE household_id = ? AND archived = 0").all(h.id).map((c) => ({
      id: c.id, title: c.title, category: c.category, effort: c.effort, recurrence: c.recurrence,
      everyDays: c.every_days, assignment: c.assignment, assigneeId: c.assignee_id,
      rotation: JSON.parse(c.rotation), dueDate: c.due_date, ...dueStatus(c, today),
    }));
  }

  function tagsView(h) {
    return q(`SELECT t.id, t.label, t.chore_id, c.title FROM nfc_tags t LEFT JOIN chores c ON c.id = t.chore_id AND c.archived = 0
              WHERE t.household_id = ? ORDER BY t.created_at`).all(h.id)
      .map((t) => ({ id: t.id, label: t.label, choreId: t.title ? t.chore_id : null, choreTitle: t.title || null }));
  }

  function state(req) {
    const h = req.household;
    tx(db, () => settleAll(h));
    const today = todayIn(h.timezone, new Date(now()));
    const people = members(h.id);
    const chores = choresView(h);
    const events = q("SELECT * FROM events WHERE household_id = ? ORDER BY at DESC, rowid DESC LIMIT ?").all(h.id, FEED_LIMIT);
    const kudos = q(`SELECT k.event_id, k.from_member FROM kudos k JOIN events e ON e.id = k.event_id
                     WHERE e.household_id = ?`).all(h.id);
    const names = Object.fromEntries(q("SELECT id, name FROM members WHERE household_id = ?").all(h.id).map((m) => [m.id, m.name]));
    return {
      today,
      now: now(),
      household: { id: h.id, name: h.name, inviteCode: h.invite_code, timezone: h.timezone },
      me: req.me.id,
      notify: prefsOf(people.find((m) => m.id === req.me.id)?.notify),
      pushDevices: q("SELECT COUNT(*) AS n FROM push_subscriptions WHERE member_id = ?").get(req.me.id).n,
      members: people.map((m) => ({ id: m.id, name: m.name, pet: petView(m) })),
      chores,
      tags: tagsView(h),
      rooms: Object.fromEntries(q("SELECT room, layout FROM room_layouts WHERE household_id = ?").all(h.id)
        .filter((r) => ROOMS[r.room]).map((r) => [r.room, JSON.parse(r.layout)])),
      feed: events.map((e) => ({
        id: e.id, kind: e.kind, memberId: e.member_id, who: names[e.member_id] || "Someone",
        at: e.at, data: JSON.parse(e.data),
        kudos: kudos.filter((k) => k.event_id === e.id).map((k) => k.from_member),
      })),
    };
  }

  // -- chores -------------------------------------------------------------

  function choreFields(body, household, current = null) {
    const people = members(household.id).map((m) => m.id);
    const pick = (key, fallback) => (body[key] !== undefined ? body[key] : fallback);
    const out = {
      title: text(pick("title", current?.title), "Chore", 80),
      category: oneOf(pick("category", current?.category ?? "other"), CATEGORIES, "category"),
      effort: Number(pick("effort", current?.effort ?? 1)),
      recurrence: oneOf(pick("recurrence", current?.recurrence ?? "weekly"), RECURRENCES, "recurrence"),
      every_days: null,
      assignment: oneOf(pick("assignment", current?.assignment ?? "anyone"), ASSIGNMENTS, "assignment"),
      assignee_id: null,
      rotation: [],
      due_date: validDate(pick("dueDate", current?.due_date ?? todayIn(household.timezone, new Date(now()))), "Due date"),
    };
    if (![1, 2, 3].includes(out.effort)) throw new HttpError(400, "effort must be 1, 2 or 3");
    if (out.recurrence === "every_n") {
      out.every_days = Number(pick("everyDays", current?.every_days ?? 3));
      if (!Number.isInteger(out.every_days) || out.every_days < 1 || out.every_days > 365) {
        throw new HttpError(400, "every how many days must be 1 to 365");
      }
    }
    const assignee = pick("assigneeId", current?.assignee_id);
    if (out.assignment === "fixed") {
      if (!people.includes(assignee)) throw new HttpError(400, "pick who does it");
      out.assignee_id = assignee;
    } else if (out.assignment === "rotate") {
      const given = pick("rotation", current ? JSON.parse(current.rotation) : people);
      if (!Array.isArray(given)) throw new HttpError(400, "rotation must be a list of roommates");
      out.rotation = [...new Set(given)].filter((id) => people.includes(id));
      if (out.rotation.length < 1) throw new HttpError(400, "pick who takes turns");
      out.assignee_id = out.rotation.includes(assignee) ? assignee : out.rotation[0];
    }
    return out;
  }

  // -- routes -------------------------------------------------------------

  app.post("/api/households", guard, (req, res) => {
    const b = req.body || {};
    const householdName = text(b.householdName, "Household name", 40);
    const name = text(b.name, "Your name", 30);
    const p = pet(b);
    const hid = newId();
    const mid = newId();
    const token = tx(db, () => {
      let invite;
      do invite = code(6); while (q("SELECT 1 FROM households WHERE invite_code = ?").get(invite));
      q("INSERT INTO households (id, name, invite_code, timezone, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(hid, householdName, invite, validTimezone(b.timezone), now());
      q(`INSERT INTO members (id, household_id, name, pet_name, species, color, stats_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(mid, hid, name, p.petName, p.species, p.color, now(), now());
      event(hid, "joined", mid, { petName: p.petName, species: p.species });
      return signIn(mid);
    });
    res.status(201).json({ token });
  });

  app.post("/api/households/join", guard, (req, res) => {
    const b = req.body || {};
    const invite = typeof b.code === "string" ? b.code.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    const h = q("SELECT * FROM households WHERE invite_code = ?").get(invite);
    if (!h) throw new HttpError(404, "No household has that invite code");
    const name = text(b.name, "Your name", 30);
    const p = pet(b);
    const mid = newId();
    const token = tx(db, () => {
      q(`INSERT INTO members (id, household_id, name, pet_name, species, color, stats_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(mid, h.id, name, p.petName, p.species, p.color, now(), now());
      event(h.id, "joined", mid, { petName: p.petName, species: p.species });
      return signIn(mid);
    });
    hub.notify(h.id);
    res.status(201).json({ token });
  });

  // A one-time code to sign in on another device (a new phone).
  app.post("/api/device", guard, (req, res) => {
    const c = typeof req.body?.code === "string" ? req.body.code.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    const row = q("SELECT * FROM device_codes WHERE code = ?").get(c);
    if (!row || row.expires_at < now()) throw new HttpError(404, "That code is wrong or has expired");
    const token = tx(db, () => {
      q("DELETE FROM device_codes WHERE code = ?").run(c);
      return signIn(row.member_id);
    });
    res.status(201).json({ token });
  });

  app.use("/api", auth);

  app.get("/api/state", (req, res) => res.json(state(req)));

  app.get("/api/events", (req, res) => hub.subscribe(req.household.id, req, res));

  app.patch("/api/household", (req, res) => {
    q("UPDATE households SET name = ? WHERE id = ?").run(text(req.body?.name, "Household name", 40), req.household.id);
    hub.notify(req.household.id);
    res.json({ ok: true });
  });

  app.post("/api/household/invite", (req, res) => {
    let invite;
    do invite = code(6); while (q("SELECT 1 FROM households WHERE invite_code = ?").get(invite));
    q("UPDATE households SET invite_code = ? WHERE id = ?").run(invite, req.household.id);
    hub.notify(req.household.id);
    res.json({ inviteCode: invite });
  });

  app.patch("/api/me", (req, res) => {
    const b = req.body || {};
    const name = b.name !== undefined ? text(b.name, "Your name", 30) : req.me.name;
    const p = pet(b, req.me);
    q("UPDATE members SET name = ?, pet_name = ?, species = ?, color = ? WHERE id = ?")
      .run(name, p.petName, p.species, p.color, req.me.id);
    hub.notify(req.household.id);
    res.json({ ok: true });
  });

  app.post("/api/me/device-code", (req, res) => {
    const c = code(8);
    const expiresAt = now() + 15 * 60 * 1000;
    q("DELETE FROM device_codes WHERE member_id = ? OR expires_at < ?").run(req.me.id, now());
    q("INSERT INTO device_codes (code, member_id, expires_at) VALUES (?, ?, ?)").run(c, req.me.id, expiresAt);
    res.json({ code: c, expiresAt });
  });

  // Leaving: their own chores go to anyone, and turns skip them from now on.
  app.delete("/api/me", (req, res) => {
    const hid = req.household.id;
    tx(db, () => {
      q("UPDATE members SET left_at = ? WHERE id = ?").run(now(), req.me.id);
      q("DELETE FROM tokens WHERE member_id = ?").run(req.me.id);
      q("DELETE FROM push_subscriptions WHERE member_id = ?").run(req.me.id);
      q("UPDATE chores SET assignment = 'anyone', assignee_id = NULL WHERE household_id = ? AND assignment = 'fixed' AND assignee_id = ?")
        .run(hid, req.me.id);
      const ids = members(hid).map((m) => m.id);
      for (const c of q("SELECT * FROM chores WHERE household_id = ? AND assignment = 'rotate'").all(hid)) {
        const rotation = JSON.parse(c.rotation).filter((id) => ids.includes(id));
        const assignee = rotation.includes(c.assignee_id) ? c.assignee_id : rotation[0] ?? null;
        q("UPDATE chores SET rotation = ?, assignee_id = ?, assignment = ? WHERE id = ?")
          .run(JSON.stringify(rotation), assignee, rotation.length ? "rotate" : "anyone", c.id);
      }
      event(hid, "left", req.me.id, { petName: req.me.pet_name });
    });
    hub.notify(hid);
    res.json({ ok: true });
  });

  // A room arranged in the room builder: checked as the app checks it, kept whole.
  app.put("/api/rooms/:room", (req, res) => {
    const room = req.params.room;
    const layout = req.body?.layout;
    const problem = layoutProblem(room, layout);
    if (problem) throw new HttpError(Object.hasOwn(ROOMS, room) ? 400 : 404, problem);
    const clean = cleanLayout(layout);
    q(`INSERT INTO room_layouts (household_id, room, layout, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (household_id, room) DO UPDATE SET layout = excluded.layout, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .run(req.household.id, room, JSON.stringify(clean), req.me.id, now());
    hub.notify(req.household.id);
    res.json({ ok: true, layout: clean });
  });

  app.delete("/api/rooms/:room", (req, res) => {
    q("DELETE FROM room_layouts WHERE household_id = ? AND room = ?").run(req.household.id, req.params.room);
    hub.notify(req.household.id);
    res.json({ ok: true });
  });

  app.post("/api/chores", (req, res) => {
    const f = choreFields(req.body || {}, req.household);
    const id = newId();
    q(`INSERT INTO chores (id, household_id, title, category, effort, recurrence, every_days, assignment, assignee_id,
       rotation, due_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, req.household.id, f.title, f.category, f.effort, f.recurrence, f.every_days, f.assignment,
        f.assignee_id, JSON.stringify(f.rotation), f.due_date, req.me.id, now());
    hub.notify(req.household.id);
    if (f.assignee_id && f.assignee_id !== req.me.id) {
      tell(req.household, f.assignee_id, "assigned", {
        title: f.assignment === "rotate" ? `Your turn first: ${f.title}` : `${req.me.name} gave you a chore: ${f.title}`,
        body: `Due ${f.due_date}`, tag: `assigned-${id}`,
      });
    }
    res.status(201).json({ id });
  });

  const findChore = (req) => {
    const c = q("SELECT * FROM chores WHERE id = ? AND household_id = ? AND archived = 0").get(req.params.id, req.household.id);
    if (!c) throw new HttpError(404, "No such chore");
    return c;
  };

  app.patch("/api/chores/:id", (req, res) => {
    const c = findChore(req);
    const f = choreFields(req.body || {}, req.household, c);
    q(`UPDATE chores SET title = ?, category = ?, effort = ?, recurrence = ?, every_days = ?, assignment = ?,
       assignee_id = ?, rotation = ?, due_date = ? WHERE id = ?`)
      .run(f.title, f.category, f.effort, f.recurrence, f.every_days, f.assignment, f.assignee_id,
        JSON.stringify(f.rotation), f.due_date, c.id);
    hub.notify(req.household.id);
    res.json({ ok: true });
  });

  app.delete("/api/chores/:id", (req, res) => {
    const c = findChore(req);
    q("UPDATE chores SET archived = 1 WHERE id = ?").run(c.id);
    hub.notify(req.household.id);
    res.json({ ok: true });
  });

  /**
   * Whoever did it gets the reward for their pet, even if it was someone else's
   * turn. `via` says how (app, siri, tag). With `recentGuard`, a chore someone
   * already did in the last half hour is not done again -- a tag tapped twice.
   */
  function completeChore(me, h, choreId, { via = "app", recentGuard = false } = {}) {
    const out = tx(db, () => {
      settleAll(h);
      const c = q("SELECT * FROM chores WHERE id = ? AND household_id = ? AND archived = 0").get(choreId, h.id);
      if (!c) throw new HttpError(404, "No such chore");
      if (recentGuard) {
        const recent = q(`SELECT e.at, m.name FROM events e LEFT JOIN members m ON m.id = e.member_id
                          WHERE e.household_id = ? AND e.kind = 'done' AND json_extract(e.data, '$.choreId') = ? AND e.at > ?
                          ORDER BY e.at DESC LIMIT 1`).get(h.id, c.id, now() - RECENT_DONE_MS);
        if (recent) return { already: { at: recent.at, who: recent.name }, chore: c };
      }
      const today = todayIn(h.timezone, new Date(now()));
      const { gain, xp } = choreReward(c.category, c.effort);
      const stages = reward(me, gain, xp);
      const coveredFor = c.assignment !== "anyone" && c.assignee_id && c.assignee_id !== me.id ? c.assignee_id : null;
      const eventId = event(h.id, "done", me.id, {
        choreId: c.id, title: c.title, category: c.category, effort: c.effort, gain, xp, coveredFor,
        late: dueStatus(c, today).overdue, via,
      });
      const next = afterDone({ ...c, rotation: JSON.parse(c.rotation) }, today, members(h.id).map((m) => m.id));
      q("UPDATE chores SET archived = ?, due_date = ?, assignee_id = ? WHERE id = ?")
        .run(next.archived, next.due_date, next.assignee_id, c.id);
      return { eventId, gain, xp, stage: stages, chore: c, coveredFor, next };
    });
    if (out.already) return out;
    hub.notify(h.id);
    const c = out.chore;
    // Who to tell: the one covered for, the one whose turn it is now, and anyone who wants to hear it all.
    if (out.coveredFor) tell(h, out.coveredFor, "covered", { title: `${me.name} did ${c.title} for you 💪`, body: "Send them a 💖?", tag: `covered-${c.id}` });
    if (c.assignment === "rotate" && !out.next.archived && out.next.assignee_id && out.next.assignee_id !== me.id) {
      tell(h, out.next.assignee_id, "assigned", { title: `Your turn next: ${c.title}`, body: `Due ${out.next.due_date}`, tag: `turn-${c.id}` });
    }
    for (const m of members(h.id)) {
      if (m.id !== me.id && m.id !== out.coveredFor) {
        tell(h, m.id, "roommates", { title: doneLine(me.name, c.title, c.category), body: "Send a 💖?", tag: `done-${c.id}` });
      }
    }
    return out;
  }

  function petName(memberId) {
    return q("SELECT pet_name FROM members WHERE id = ?").get(memberId)?.pet_name || "Your pet";
  }

  /** What a chore done gives, said for Siri and notifications. */
  function doneSpeech(me, out) {
    const name = petName(me.id);
    if (out.already) {
      const mins = Math.max(1, Math.round((now() - out.already.at) / 60000));
      const who = out.already.who === me.name ? "you" : out.already.who || "someone";
      return `${out.chore.title} was already done ${mins} minute${mins === 1 ? "" : "s"} ago by ${who}.`;
    }
    if (out.stage.after !== out.stage.before) {
      return out.stage.after === "baby" ? `Done! ${name} hatched!` : `Done! ${name} grew up!`;
    }
    const bits = Object.entries(out.gain).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`);
    return `Done! ${name} got ${bits.join(" and ")}.`;
  }

  app.post("/api/chores/:id/done", (req, res) => {
    const out = completeChore(req.me, req.household, req.params.id);
    res.json({ eventId: out.eventId, gain: out.gain, xp: out.xp, stage: out.stage });
  });

  // Kudos for a roommate's chore: a little fun for their pet, once from each roommate.
  app.post("/api/feed/:id/kudos", (req, res) => {
    const e = q("SELECT * FROM events WHERE id = ? AND household_id = ?").get(req.params.id, req.household.id);
    if (!e || e.kind !== "done") throw new HttpError(404, "Nothing to cheer there");
    if (e.member_id === req.me.id) throw new HttpError(400, "That one is yours -- someone else can cheer it");
    tx(db, () => {
      if (q("SELECT 1 FROM kudos WHERE event_id = ? AND from_member = ?").get(e.id, req.me.id)) {
        throw new HttpError(409, "You already cheered that one");
      }
      q("INSERT INTO kudos (event_id, from_member, at) VALUES (?, ?, ?)").run(e.id, req.me.id, now());
      const doer = q("SELECT * FROM members WHERE id = ? AND left_at IS NULL").get(e.member_id);
      if (doer) {
        settleAll(req.household);
        reward(doer, KUDOS_GAIN);
      }
    });
    hub.notify(req.household.id);
    tell(req.household, e.member_id, "cheers", {
      title: `${req.me.name} cheered your ${JSON.parse(e.data).title} 💖`, body: `${petName(e.member_id)} is chuffed.`, tag: `cheer-${e.id}`,
    });
    res.json({ ok: true });
  });

  app.post("/api/pet/pat", (req, res) => {
    if (stageFor(req.me.xp).id === "egg") throw new HttpError(400, "Eggs can't be patted yet -- do a chore to hatch it");
    const wait = req.me.pat_at + PAT_COOLDOWN_MS - now();
    if (wait > 0) throw new HttpError(429, `${req.me.pet_name} was just patted -- try again in ${Math.ceil(wait / 60000)} min`);
    tx(db, () => {
      settleAll(req.household);
      reward(req.me, PAT_GAIN, 0, { joy: false });
      q("UPDATE members SET pat_at = ? WHERE id = ?").run(now(), req.me.id);
    });
    hub.notify(req.household.id);
    res.json({ ok: true });
  });

  // -- notifications -------------------------------------------------------

  /** Push a message to a roommate if they want this kind; the app badge shows how many chores are theirs. */
  function tell(h, memberId, kind, msg) {
    const m = q("SELECT * FROM members WHERE id = ? AND left_at IS NULL").get(memberId);
    if (!m || !prefsOf(m.notify)[kind]) return Promise.resolve(0);
    const badge = openFor(memberId, choresView(h)).length;
    return pusher.toMember(memberId, { url: "/", ...msg, badge, kind }).catch((e) => console.warn(`push: ${e.message}`));
  }
  app.locals.tell = tell;

  /**
   * Run every minute: each roommate's morning list at their hour, and pet
   * alerts (in the daytime only). Only households with someone who has
   * notifications on are looked at.
   */
  async function tick() {
    const sends = [];
    const households = q(`SELECT DISTINCT h.* FROM households h JOIN members m ON m.household_id = h.id
                          JOIN push_subscriptions s ON s.member_id = m.id WHERE m.left_at IS NULL`).all();
    for (const h of households) {
      tx(db, () => settleAll(h));
      const today = todayIn(h.timezone, new Date(now()));
      const hour = hourIn(h.timezone, new Date(now()));
      const quiet = hour >= QUIET.from || hour < QUIET.to;
      const chores = sortChores(choresView(h), today);
      for (const m of members(h.id)) {
        const prefs = prefsOf(m.notify);
        const stats = { food: m.food, clean: m.clean, fun: m.fun };
        const egg = stageFor(m.xp).id === "egg";
        if (prefs.digest && hour === prefs.digestHour && m.digest_on !== today) {
          q("UPDATE members SET digest_on = ? WHERE id = ?").run(today, m.id);
          const low = egg ? null : petAlerts(m.pet_name, stats, {}).send[0];
          const msg = digest(m.id, chores, low ? low.title : "");
          if (msg) sends.push(tell(h, m.id, "digest", msg));
        }
        if (prefs.pet && !egg && !quiet) {
          const r = petAlerts(m.pet_name, stats, JSON.parse(m.alerted || "{}"));
          q("UPDATE members SET alerted = ? WHERE id = ?").run(JSON.stringify(r.alerted), m.id);
          for (const msg of r.send) sends.push(tell(h, m.id, "pet", msg));
        }
      }
    }
    await Promise.all(sends);
    return sends.length;
  }
  app.locals.tick = tick;

  app.get("/api/push/key", (_req, res) => res.json({ publicKey: vapid.publicKey }));

  app.post("/api/push/subscribe", (req, res) => {
    const b = req.body || {};
    const endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      throw new HttpError(400, "Not a push subscription");
    }
    // Only real push services: the server makes requests to this address. Apple (Safari, iOS), Google (Chrome:
    // fcm.googleapis.com; Chromium: *.google.com), Mozilla (Firefox), Microsoft (Edge on Windows).
    if (url.protocol !== "https:" || !/(^|\.)(push\.apple\.com|googleapis\.com|google\.com|mozilla\.com|mozaws\.net|notify\.windows\.com)$/.test(url.hostname)) {
      throw new HttpError(400, "That push service is not one RoomiePet sends to");
    }
    const keys = b.keys || {};
    if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || keys.p256dh.length > 200 || keys.auth.length > 100) {
      throw new HttpError(400, "Not a push subscription");
    }
    q(`INSERT INTO push_subscriptions (endpoint, member_id, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .run(endpoint, req.me.id, keys.p256dh, keys.auth, String(req.get("user-agent") || "").slice(0, 200), now());
    res.status(201).json({ ok: true });
  });

  app.post("/api/push/unsubscribe", (req, res) => {
    q("DELETE FROM push_subscriptions WHERE endpoint = ? AND member_id = ?").run(String(req.body?.endpoint || ""), req.me.id);
    res.json({ ok: true });
  });

  app.post("/api/push/test", async (req, res) => {
    const n = await pusher.toMember(req.me.id, {
      title: `${req.me.pet_name} says hi 👋`, body: "Notifications are working.", tag: "test", url: "/",
      badge: openFor(req.me.id, choresView(req.household)).length,
    });
    if (!n) throw new HttpError(400, "Turn notifications on first");
    res.json({ ok: true, devices: n });
  });

  app.patch("/api/me/notify", (req, res) => {
    const given = req.body || {};
    const current = prefsOf(req.me.notify);
    for (const k of [...Object.keys(NOTIFY_KINDS), "digestHour"]) if (given[k] !== undefined) current[k] = given[k];
    const clean = prefsOf(current);
    q("UPDATE members SET notify = ? WHERE id = ?").run(JSON.stringify(clean), req.me.id);
    res.json(clean);
  });

  // -- keys for Apple Shortcuts ----------------------------------------------

  app.get("/api/me/keys", (req, res) => {
    const rows = q("SELECT hash, label, created_at, last_used_at FROM tokens WHERE member_id = ? AND kind = 'shortcut' ORDER BY created_at")
      .all(req.me.id);
    res.json(rows.map((r) => ({ id: r.hash.slice(0, 16), label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at })));
  });

  app.post("/api/me/keys", (req, res) => {
    if (req.tokenKind !== "device") throw new HttpError(403, "Make keys from the app");
    const n = q("SELECT COUNT(*) AS n FROM tokens WHERE member_id = ? AND kind = 'shortcut'").get(req.me.id).n;
    if (n >= 10) throw new HttpError(400, "That's 10 keys already -- remove one first");
    const label = text(req.body?.label || "Shortcuts", "Name", 40);
    res.status(201).json({ key: signIn(req.me.id, "shortcut", label) });
  });

  app.delete("/api/me/keys/:id", (req, res) => {
    const id = String(req.params.id);
    if (!/^[0-9a-f]{16}$/.test(id)) throw new HttpError(404, "No such key");
    const r = q("DELETE FROM tokens WHERE member_id = ? AND kind = 'shortcut' AND substr(hash, 1, 16) = ?").run(req.me.id, id);
    if (!r.changes) throw new HttpError(404, "No such key");
    res.json({ ok: true });
  });

  // -- Siri and Apple Shortcuts ------------------------------------------------
  // Shaped for "Get Contents of URL": always 200 with {ok, speak}, so a
  // Shortcut can just speak or show `speak` whatever happened.

  const speakList = (titles) => (titles.length <= 1 ? titles.join("") : `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}`);

  app.get("/api/shortcuts/summary", (req, res) => {
    const h = req.household;
    tx(db, () => settleAll(h));
    const chores = sortChores(choresView(h), todayIn(h.timezone, new Date(now())));
    const mine = openFor(req.me.id, chores);
    const m = q("SELECT * FROM members WHERE id = ?").get(req.me.id);
    const low = stageFor(m.xp).id === "egg" ? [] : petAlerts(m.pet_name, { food: m.food, clean: m.clean, fun: m.fun }, {}).send;
    const parts = [
      mine.length ? `You have ${mine.length} chore${mine.length === 1 ? "" : "s"} today: ${speakList(mine.map((c) => c.title))}.` : "Nothing due for you today.",
      stageFor(m.xp).id === "egg" ? `${m.pet_name} is still an egg -- do a chore to hatch it.` : low.length ? low.map((x) => x.title.replace(/ \S+$/u, ".")).join(" ") : `${m.pet_name} is doing fine.`,
    ];
    res.json({
      ok: true, speak: parts.join(" "), count: mine.length,
      chores: mine.map((c) => ({ id: c.id, title: c.title, late: c.overdue })),
      pet: { name: m.pet_name, food: Math.round(m.food), clean: Math.round(m.clean), fun: Math.round(m.fun) },
    });
  });

  // For "Choose from List": every open chore, yours first.
  app.get("/api/shortcuts/chores", (req, res) => {
    const h = req.household;
    const chores = sortChores(choresView(h), todayIn(h.timezone, new Date(now())));
    const mine = (c) => c.assignment === "anyone" || c.assigneeId === req.me.id;
    res.json([...chores.filter(mine), ...chores.filter((c) => !mine(c))].map((c) => ({ id: c.id, title: c.title })));
  });

  app.post("/api/shortcuts/done", (req, res) => {
    const h = req.household;
    const said = String(req.body?.chore ?? req.body?.text ?? "").slice(0, 200);
    const id = typeof req.body?.id === "string" ? req.body.id : null;
    const chores = choresView(h);
    let chore = id ? chores.find((c) => c.id === id || c.title.toLowerCase() === id.toLowerCase()) : null;
    if (!chore) {
      const m = matchChore(said, chores, req.me.id);
      if (!m.chore) {
        const options = (m.candidates.length ? m.candidates : chores).slice(0, 4).map((c) => c.title);
        return res.json({
          ok: false,
          speak: m.candidates.length
            ? `Which one: ${speakList(options)}?`
            : options.length ? `I couldn't find "${said}". Your chores are ${speakList(options)}.` : "There are no chores yet.",
          options,
        });
      }
      chore = m.chore;
    }
    const out = completeChore(req.me, h, chore.id, { via: "siri", recentGuard: true });
    res.json({ ok: !out.already, speak: doneSpeech(req.me, out), chore: chore.title });
  });

  // -- NFC tags --------------------------------------------------------------
  // A tag holds https://<server>/t/<id>. The id names the tag, not a person:
  // tapping only works for someone signed in (the app, or a Shortcuts key).

  const findTag = (req) => {
    const t = q("SELECT * FROM nfc_tags WHERE id = ? AND household_id = ?").get(String(req.params.id), req.household.id);
    if (!t) throw new HttpError(404, "That tag isn't one of your household's");
    return t;
  };

  app.post("/api/tags", (req, res) => {
    const choreId = String(req.body?.choreId || "");
    const c = q("SELECT * FROM chores WHERE id = ? AND household_id = ? AND archived = 0").get(choreId, req.household.id);
    if (!c) throw new HttpError(400, "Pick a chore for the tag");
    const id = crypto.randomBytes(12).toString("base64url");
    const label = req.body?.label ? text(req.body.label, "Where it is", 40) : c.title;
    q("INSERT INTO nfc_tags (id, household_id, chore_id, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, req.household.id, c.id, label, req.me.id, now());
    hub.notify(req.household.id);
    res.status(201).json({ id, path: `/t/${id}` });
  });

  app.patch("/api/tags/:id", (req, res) => {
    const t = findTag(req);
    const choreId = req.body?.choreId !== undefined ? String(req.body.choreId) : t.chore_id;
    if (!q("SELECT 1 FROM chores WHERE id = ? AND household_id = ? AND archived = 0").get(choreId, req.household.id)) {
      throw new HttpError(400, "Pick a chore for the tag");
    }
    const label = req.body?.label !== undefined ? text(req.body.label, "Where it is", 40) : t.label;
    q("UPDATE nfc_tags SET chore_id = ?, label = ? WHERE id = ?").run(choreId, label, t.id);
    hub.notify(req.household.id);
    res.json({ ok: true });
  });

  app.delete("/api/tags/:id", (req, res) => {
    const t = findTag(req);
    q("DELETE FROM nfc_tags WHERE id = ?").run(t.id);
    hub.notify(req.household.id);
    res.json({ ok: true });
  });

  app.get("/api/tags/:id", (req, res) => {
    const t = findTag(req);
    const c = choresView(req.household).find((x) => x.id === t.chore_id) || null;
    res.json({ id: t.id, label: t.label, chore: c });
  });

  // Tapped: the chore is done (unless someone did it in the last half hour).
  app.post("/api/tags/:id/tap", (req, res) => {
    const t = findTag(req);
    if (!q("SELECT 1 FROM chores WHERE id = ? AND archived = 0").get(t.chore_id)) {
      return res.json({ ok: false, speak: `The ${t.label} tag's chore was removed. Set the tag up again in RoomiePet.` });
    }
    q("UPDATE nfc_tags SET last_tap_at = ? WHERE id = ?").run(now(), t.id);
    const out = completeChore(req.me, req.household, t.chore_id, { via: "tag", recentGuard: true });
    res.json({
      ok: !out.already, already: Boolean(out.already), speak: doneSpeech(req.me, out), chore: out.chore.title,
      gain: out.gain, stage: out.stage, eventId: out.eventId,
    });
  });

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "No such endpoint")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") err = new HttpError(400, "That was not valid JSON");
    if (err.type === "entity.too.large") err = new HttpError(413, "That is too long");
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? "Something went wrong" : err.message });
  });

  return app;
}
