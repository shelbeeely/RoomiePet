// Web Push: the server's VAPID keys (from the environment, or made once and
// kept in the database), and sending a message to every app a roommate has
// turned notifications on in. Works for installed apps on iOS 16.4+ and
// Android, and for desktop browsers.
import webpush from "web-push";

export function vapidKeys(db, env = process.env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  }
  const row = db.prepare("SELECT value FROM settings WHERE key = 'vapid'").get();
  if (row) return JSON.parse(row.value);
  const keys = webpush.generateVAPIDKeys();
  db.prepare("INSERT INTO settings (key, value) VALUES ('vapid', ?)").run(JSON.stringify(keys));
  return keys;
}

/**
 * send(subscription, payload) -> Promise. The default goes out through the
 * push services (Apple, Google, Mozilla); tests pass their own.
 */
export function makeSender(keys, subject) {
  // Apple requires the subject to be a real mailto: or https: contact.
  const contact = subject || "mailto:roomiepet@example.com";
  return (sub, payload) =>
    webpush.sendNotification(sub, JSON.stringify(payload), {
      vapidDetails: { subject: contact, publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 12 * 3600, // a reminder older than half a day is no use
      urgency: payload.urgency || "normal",
      topic: payload.tag ? payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : undefined,
    });
}

export class Pusher {
  constructor(db, send) {
    this.db = db;
    this.send = send;
  }

  subscriptions(memberId) {
    return this.db.prepare("SELECT * FROM push_subscriptions WHERE member_id = ?").all(memberId);
  }

  /** Send to all of a member's subscriptions; ones the push service says are gone are forgotten. */
  async toMember(memberId, payload) {
    const subs = this.subscriptions(memberId);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await this.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(s.endpoint);
          } else {
            console.warn(`push to ${new URL(s.endpoint).host} failed: ${e.statusCode || ""} ${e.message}`);
          }
        }
      }),
    );
    return subs.length;
  }
}
