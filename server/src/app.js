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
import { ASSIGNMENTS, RECURRENCES, afterDone, dueStatus, todayIn } from "../../shared/chores.js";

const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // nothing that reads as another letter
const FEED_LIMIT = 40;

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

export function createApp(db, { now = () => Date.now(), codeLimit = { max: 30, windowMs: 15 * 60 * 1000 } } = {}) {
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

  // -- who is asking ------------------------------------------------------

  function signIn(memberId) {
    const token = crypto.randomBytes(32).toString("base64url");
    q("INSERT INTO tokens (hash, member_id, created_at) VALUES (?, ?, ?)").run(hash(token), memberId, now());
    return token;
  }

  function auth(req, _res, next) {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : req.originalUrl.startsWith("/api/events?") ? req.query.token : "";
    if (!token || typeof token !== "string") return next(new HttpError(401, "Not signed in"));
    const me = q(`SELECT m.* FROM tokens t JOIN members m ON m.id = t.member_id
                  WHERE t.hash = ? AND m.left_at IS NULL`).get(hash(token));
    if (!me) return next(new HttpError(401, "Not signed in"));
    req.me = me;
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

  function state(req) {
    const h = req.household;
    tx(db, () => settleAll(h));
    const today = todayIn(h.timezone, new Date(now()));
    const people = members(h.id);
    const chores = q("SELECT * FROM chores WHERE household_id = ? AND archived = 0").all(h.id).map((c) => ({
      id: c.id, title: c.title, category: c.category, effort: c.effort, recurrence: c.recurrence,
      everyDays: c.every_days, assignment: c.assignment, assigneeId: c.assignee_id,
      rotation: JSON.parse(c.rotation), dueDate: c.due_date, ...dueStatus(c, today),
    }));
    const events = q("SELECT * FROM events WHERE household_id = ? ORDER BY at DESC, rowid DESC LIMIT ?").all(h.id, FEED_LIMIT);
    const kudos = q(`SELECT k.event_id, k.from_member FROM kudos k JOIN events e ON e.id = k.event_id
                     WHERE e.household_id = ?`).all(h.id);
    const names = Object.fromEntries(q("SELECT id, name FROM members WHERE household_id = ?").all(h.id).map((m) => [m.id, m.name]));
    return {
      today,
      now: now(),
      household: { id: h.id, name: h.name, inviteCode: h.invite_code, timezone: h.timezone },
      me: req.me.id,
      members: people.map((m) => ({ id: m.id, name: m.name, pet: petView(m) })),
      chores,
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

  app.post("/api/chores", (req, res) => {
    const f = choreFields(req.body || {}, req.household);
    const id = newId();
    q(`INSERT INTO chores (id, household_id, title, category, effort, recurrence, every_days, assignment, assignee_id,
       rotation, due_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, req.household.id, f.title, f.category, f.effort, f.recurrence, f.every_days, f.assignment,
        f.assignee_id, JSON.stringify(f.rotation), f.due_date, req.me.id, now());
    hub.notify(req.household.id);
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

  // Done: whoever did it gets the reward for their pet, even if it was someone else's turn.
  app.post("/api/chores/:id/done", (req, res) => {
    const h = req.household;
    const out = tx(db, () => {
      settleAll(h);
      const c = findChore(req);
      const today = todayIn(h.timezone, new Date(now()));
      const { gain, xp } = choreReward(c.category, c.effort);
      const stages = reward(req.me, gain, xp);
      const coveredFor = c.assignment !== "anyone" && c.assignee_id && c.assignee_id !== req.me.id ? c.assignee_id : null;
      const eventId = event(h.id, "done", req.me.id, {
        choreId: c.id, title: c.title, category: c.category, effort: c.effort, gain, xp, coveredFor,
        late: dueStatus(c, today).overdue,
      });
      const next = afterDone({ ...c, rotation: JSON.parse(c.rotation) }, today, members(h.id).map((m) => m.id));
      q("UPDATE chores SET archived = ?, due_date = ?, assignee_id = ? WHERE id = ?")
        .run(next.archived, next.due_date, next.assignee_id, c.id);
      return { eventId, gain, xp, stage: stages };
    });
    hub.notify(h.id);
    res.json(out);
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
