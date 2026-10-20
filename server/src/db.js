// The household's data, in SQLite through Node's built-in driver (no native
// modules to build). One file holds every household on this server.
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  pet_name TEXT NOT NULL,
  species TEXT NOT NULL,
  color TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  food REAL NOT NULL DEFAULT 80,
  clean REAL NOT NULL DEFAULT 80,
  fun REAL NOT NULL DEFAULT 80,
  stats_at INTEGER NOT NULL,
  joy_at INTEGER NOT NULL DEFAULT 0,
  pat_at INTEGER NOT NULL DEFAULT 0,
  left_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS members_household ON members(household_id);
-- A roommate can be signed in on several devices: a token per device, kept hashed.
CREATE TABLE IF NOT EXISTS tokens (
  hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS device_codes (
  code TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chores (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  effort INTEGER NOT NULL,
  recurrence TEXT NOT NULL,
  every_days INTEGER,
  assignment TEXT NOT NULL,
  assignee_id TEXT,
  rotation TEXT NOT NULL DEFAULT '[]',
  due_date TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chores_household ON chores(household_id, archived);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  kind TEXT NOT NULL,
  member_id TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_household ON events(household_id, at);
CREATE TABLE IF NOT EXISTS kudos (
  event_id TEXT NOT NULL REFERENCES events(id),
  from_member TEXT NOT NULL REFERENCES members(id),
  at INTEGER NOT NULL,
  PRIMARY KEY (event_id, from_member)
);
-- Where to send a roommate's push notifications: one row per installed app / browser.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_member ON push_subscriptions(member_id);
-- An NFC tag stuck somewhere in the flat: its URL carries only this id, never a key.
CREATE TABLE IF NOT EXISTS nfc_tags (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  chore_id TEXT NOT NULL REFERENCES chores(id),
  label TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  last_tap_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS nfc_household ON nfc_tags(household_id);
-- How a household has arranged a room in the room builder; rooms without a row are as the flat came.
CREATE TABLE IF NOT EXISTS room_layouts (
  household_id TEXT NOT NULL REFERENCES households(id),
  room TEXT NOT NULL,
  layout TEXT NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (household_id, room)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Columns added after the first release, for databases made before them.
const COLUMNS = [
  // A token is a device's sign-in, or a key for Apple Shortcuts and the like.
  ["tokens", "kind", "TEXT NOT NULL DEFAULT 'device'"],
  ["tokens", "label", "TEXT"],
  ["tokens", "last_used_at", "INTEGER"],
  // What each roommate wants to be told, and what they were last told.
  ["members", "notify", "TEXT NOT NULL DEFAULT '{}'"],
  ["members", "digest_on", "TEXT"],
  ["members", "alerted", "TEXT NOT NULL DEFAULT '{}'"],
];

export function openDb(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  for (const [table, column, type] of COLUMNS) {
    const has = db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  return db;
}

/** Run fn inside one transaction; any throw rolls it all back. */
export function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
