// Living on the phone: installing the app, notifications, Siri and Apple
// Shortcuts, and NFC tags -- set up here, explained for iPhone and Android.
import { useEffect, useRef, useState } from "react";
import { NOTIFY_KINDS } from "@shared/notify.js";
import { api, getToken } from "./api.js";
import {
  canPromptInstall, disablePush, enablePush, onInstallable, platform, promptInstall, pushStatus, writeTag,
} from "./pwa.js";

function Copy({ value, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <span className="copy">
      <code>{value}</code>
      <button
        type="button"
        className="ghost small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {
            prompt("Copy this:", value);
          }
        }}
      >
        {done ? "Copied ✓" : label}
      </button>
    </span>
  );
}

const ShareIcon = () => (
  <svg className="inline-icon" viewBox="0 0 24 24" width="16" height="16" aria-label="Share" role="img">
    <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** "Put it on your Home Screen": what that takes on this phone. */
export function InstallCard() {
  const [installable, setInstallable] = useState(canPromptInstall());
  useEffect(() => onInstallable(setInstallable), []);
  if (platform.standalone) return null;
  return (
    <section className="card">
      <h3>📲 Put RoomiePet on your Home Screen</h3>
      {platform.ios ? (
        <>
          <p>It opens like an app, and on iPhone it's needed for notifications.</p>
          <ol className="steps">
            <li>Tap <ShareIcon /> <b>Share</b> in Safari's toolbar.</li>
            <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>Open RoomiePet from your Home Screen and sign in there with a device code (Me → Add another device) -- the Home Screen app keeps its own sign-in.</li>
          </ol>
        </>
      ) : installable ? (
        <>
          <p>It opens like an app, gets notifications, and long-pressing its icon jumps straight to your chores.</p>
          <button onClick={promptInstall}>Install RoomiePet</button>
        </>
      ) : (
        <p>In your browser's menu, choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
      )}
    </section>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });

export function NotificationsCard({ prefs, run, say }) {
  const [status, setStatus] = useState("…");
  const [p, setP] = useState(prefs);
  useEffect(() => setP(prefs), [prefs]);
  useEffect(() => {
    pushStatus().then(setStatus);
  }, []);

  const save = (patch) => {
    setP({ ...p, ...patch });
    run(() => api("PATCH", "/api/me/notify", patch));
  };

  return (
    <section className="card">
      <h3>🔔 Notifications</h3>
      {status === "install-first" && (
        <p>On iPhone and iPad, notifications work once RoomiePet is on your Home Screen (iOS 16.4 or later) -- see above.</p>
      )}
      {status === "unsupported" && <p>This browser can't show notifications. Try Safari on iPhone (from the Home Screen) or Chrome on Android.</p>}
      {status === "denied" && (
        <p>
          Notifications are blocked for RoomiePet.{" "}
          {platform.ios ? "Turn them on in Settings → Notifications → RoomiePet." : "Allow them in the site settings (the icon left of the address), then come back."}
        </p>
      )}
      {status === "off" && (
        <button
          onClick={async () => {
            try {
              await enablePush();
              setStatus("on");
              say("Notifications on 🔔");
            } catch (e) {
              setStatus(await pushStatus());
              say(e.message);
            }
          }}
        >
          Turn on notifications
        </button>
      )}
      {status === "on" && (
        <div className="row">
          <span className="ok">On for this device ✓</span>
          <span className="spacer" />
          <button className="ghost small" onClick={() => run(() => api("POST", "/api/push/test", {}), "Sent -- check your notifications")}>
            Send a test
          </button>
          <button className="ghost small" onClick={async () => { await disablePush(); setStatus("off"); }}>Turn off</button>
        </div>
      )}
      <ul className="toggles">
        {Object.entries(NOTIFY_KINDS).map(([k, info]) => (
          <li key={k}>
            <label className="toggle">
              <input type="checkbox" checked={Boolean(p[k])} onChange={(e) => save({ [k]: e.target.checked })} />
              <span>
                {info.label}
                <small>{info.hint}</small>
              </span>
            </label>
            {k === "digest" && p.digest && (
              <select value={p.digestHour} onChange={(e) => save({ digestHour: Number(e.target.value) })} aria-label="When">
                {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Siri and Apple Shortcuts: a key, and recipes that use it. */
export function ShortcutsCard({ run, origin = location.origin }) {
  const [keys, setKeys] = useState([]);
  const [fresh, setFresh] = useState(null);
  const load = () => api("GET", "/api/me/keys").then(setKeys).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  const key = fresh || "YOUR-KEY";
  const auth = `Bearer ${key}`;
  return (
    <section className="card shortcuts">
      <h3>🗣️ Siri & Shortcuts</h3>
      <p>
        Say <i>"Hey Siri, I did the dishes"</i>, ask what's on today, or tick a chore from the Home Screen, Action button or
        Apple Watch. A <b>key</b> lets the Shortcuts app do chores for you -- and nothing else.
      </p>
      {fresh ? (
        <div className="key-shown">
          <p><b>Your new key</b> -- copy it now, it's only shown once:</p>
          <Copy value={fresh} />
        </div>
      ) : (
        <button onClick={() => run(async () => { const r = await api("POST", "/api/me/keys", { label: platform.ios ? "iPhone Shortcuts" : "Shortcuts" }); setFresh(r.key); load(); })}>
          Make a key
        </button>
      )}
      {keys.length > 0 && (
        <ul className="keys">
          {keys.map((k) => (
            <li key={k.id}>
              <span>
                {k.label}
                <small>{k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "not used yet"}</small>
              </span>
              <button className="ghost small" onClick={() => confirm(`Remove "${k.label}"? Shortcuts using it will stop working.`) &&
                run(async () => { await api("DELETE", `/api/me/keys/${k.id}`); load(); }, "Key removed")}>Remove</button>
            </li>
          ))}
        </ul>
      )}

      <details>
        <summary>“I did the dishes” (Siri)</summary>
        <ol className="steps">
          <li>Shortcuts app → <b>+</b> → name it <b>I did a chore</b> (that's what you'll say to Siri).</li>
          <li>Add <b>Dictate Text</b>.</li>
          <li>Add <b>Get Contents of URL</b>: <Copy value={`${origin}/api/shortcuts/done`} /> Method <b>POST</b>.
            Headers: <b>Authorization</b> = <Copy value={auth} />. Request Body <b>JSON</b>: key <b>chore</b> = <i>Dictated Text</i>.</li>
          <li>Add <b>Get Dictionary Value</b> for key <b>speak</b>, then <b>Speak Text</b> (or Show Result).</li>
        </ol>
        <p className="hint">“Hey Siri, I did a chore” → “Which one?” → “the dishes” → “Done! Mochi got 34 food.”</p>
      </details>
      <details>
        <summary>“What are my chores?”</summary>
        <ol className="steps">
          <li>New shortcut, named <b>My chores</b>.</li>
          <li><b>Get Contents of URL</b>: <Copy value={`${origin}/api/shortcuts/summary`} /> (GET) with the same Authorization header.</li>
          <li><b>Get Dictionary Value</b> <b>speak</b> → <b>Speak Text</b>. Add it to a Focus, a morning automation or a widget.</li>
        </ol>
      </details>
      <details>
        <summary>Pick from a list (Home Screen, Action button, Watch)</summary>
        <ol className="steps">
          <li><b>Get Contents of URL</b>: <Copy value={`${origin}/api/shortcuts/chores`} /> with the header.</li>
          <li><b>Choose from List</b> (the result) → <b>Get Dictionary Value</b> <b>title</b> of the chosen item.</li>
          <li><b>Get Contents of URL</b> <Copy value={`${origin}/api/shortcuts/done`} /> POST, JSON <b>id</b> = the title → <b>Show Result</b> of <b>speak</b>.</li>
        </ol>
      </details>
      <p className="hint">Android: the same links work from Tasker, MacroDroid or Google Assistant routines, with the same header.</p>
    </section>
  );
}

/** Writing a tag: from the phone itself on Android, with a Shortcuts automation (or the NFC Tools app) on iPhone. */
export function TagWriter({ tag, onClose, origin = location.origin }) {
  const url = `${origin}/t/${tag.id}`;
  const [phase, setPhase] = useState(platform.nfcWrite ? "ready" : "manual");
  const [error, setError] = useState("");
  const abort = useRef(null);
  useEffect(() => () => abort.current?.abort(), []);
  const write = async () => {
    setError("");
    setPhase("waiting");
    abort.current = new AbortController();
    try {
      await writeTag(url, { signal: abort.current.signal });
      setPhase("written");
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.name === "NotAllowedError" ? "NFC wasn't allowed. Turn on NFC in Android settings and try again." : e.message);
      }
      setPhase("ready");
    }
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Set up the NFC tag" onClick={onClose}>
      <div className="card form" onClick={(e) => e.stopPropagation()}>
        <h2>📎 {tag.label}</h2>
        <p>Tap this tag with a phone and <b>{tag.choreTitle}</b> is done -- for whoever tapped it.</p>
        {phase === "ready" && <button onClick={write}>Write to a tag now</button>}
        {phase === "waiting" && (
          <div className="nfc-wait">
            <div className="pulse" aria-hidden="true">📶</div>
            <p>Hold a blank NFC tag (NTAG213/215/216 stickers work well) to the back of your phone…</p>
            <button className="ghost" onClick={() => abort.current?.abort()}>Cancel</button>
          </div>
        )}
        {phase === "written" && <p className="ok">Written ✓ Stick it where the chore happens, and tap it next time.</p>}
        {error && <p className="error">{error}</p>}

        <details open={!platform.nfcWrite}>
          <summary>{platform.ios ? "On iPhone" : "Writing it another way"}</summary>
          <p>
            <b>Easiest on iPhone -- no writing needed:</b> Shortcuts app → <b>Automation</b> → <b>+</b> → <b>NFC</b> →
            <b> Scan</b> (any tag or sticker) → <b>Run Immediately</b> → add <b>Get Contents of URL</b>:
          </p>
          <Copy value={`${origin}/api/tags/${tag.id}/tap`} />
          <p>
            Method <b>POST</b>, header <b>Authorization</b> = <code>Bearer</code> + your key (Me → Siri & Shortcuts). Then
            <b> Show Notification</b> with <b>speak</b> from the result. Each person who taps sets it up once on their own phone.
          </p>
          <p><b>Or write the link</b> onto the tag with a free app such as NFC Tools (Write → Add a record → URL):</p>
          <Copy value={url} />
          <p className="hint">Then an iPhone shows a banner when it touches the tag; tap the banner to open it.</p>
        </details>
        <div className="row">
          <span className="spacer" />
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function TagsCard({ state, run }) {
  const [writing, setWriting] = useState(null);
  const chores = state.chores;
  return (
    <section className="card">
      <h3>📎 NFC tags</h3>
      <p>
        Stick a tag on the dishwasher, the bin, the plant -- tapping it marks the chore done. Add one from a chore (Chores → tap a
        chore → <b>Add an NFC tag</b>).
      </p>
      {state.tags.length > 0 && (
        <ul className="tags">
          {state.tags.map((t) => (
            <li key={t.id}>
              <span>
                <b>{t.label}</b>
                <small>{t.choreTitle ? `→ ${t.choreTitle}` : "its chore was removed"}</small>
              </span>
              <select
                value={t.choreId || ""}
                aria-label={`Chore for ${t.label}`}
                onChange={(e) => run(() => api("PATCH", `/api/tags/${t.id}`, { choreId: e.target.value }), "Tag updated")}
              >
                {!t.choreId && <option value="">Pick a chore…</option>}
                {chores.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <button className="ghost small" disabled={!t.choreId} onClick={() => setWriting(t)}>Set up</button>
              <button className="ghost small" onClick={() => confirm(`Remove the ${t.label} tag?`) &&
                run(() => api("DELETE", `/api/tags/${t.id}`), "Tag removed")} aria-label={`Remove ${t.label}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {writing && <TagWriter tag={writing} onClose={() => setWriting(null)} />}
    </section>
  );
}

const AUTO_KEY = "roomiepet.tagAuto";
const autoDone = () => {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
};

/** /t/<id>: a tag was tapped (or its link opened). */
export function TagPage({ id, onOpenApp, onSignIn }) {
  const [tag, setTag] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [auto, setAuto] = useState(autoDone);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const tap = async () => {
    setBusy(true);
    try {
      setResult(await api("POST", `/api/tags/${id}/tap`, {}));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!getToken()) return;
    api("GET", `/api/tags/${id}`)
      .then((t) => {
        setTag(t);
        if (autoDone() && t.chore && !started.current) {
          started.current = true;
          tap();
        }
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (!getToken()) {
    return (
      <main className="welcome">
        <h1>📎 RoomiePet tag</h1>
        <section className="card form">
          <p>This browser isn't signed in to RoomiePet yet, so it doesn't know who tapped.</p>
          {platform.ios && (
            <p className="hint">
              iPhone opens tags in Safari, which keeps its own sign-in apart from the Home Screen app. Sign in here once -- or set up a
              Shortcuts automation for this tag, so a tap ticks the chore without opening anything.
            </p>
          )}
          <button onClick={onSignIn}>Sign in on this browser</button>
        </section>
      </main>
    );
  }

  return (
    <main className="welcome tag-page">
      <h1>📎 {tag?.label || "Tag"}</h1>
      {error && <p className="error">{error}</p>}
      {tag && !tag.chore && <p>This tag's chore was removed. Point it at another one in House → NFC tags.</p>}
      {tag?.chore && !result && (
        <section className="card form">
          <p className="big">{tag.chore.title}</p>
          <button className="huge" onClick={tap} disabled={busy}>{busy ? "…" : "Done ✓"}</button>
          <label className="toggle">
            <input type="checkbox" checked={auto} onChange={(e) => {
              setAuto(e.target.checked);
              try { localStorage.setItem(AUTO_KEY, e.target.checked ? "1" : "0"); } catch { /* fine */ }
            }} />
            <span>On this phone, tick chores as soon as I tap a tag</span>
          </label>
        </section>
      )}
      {result && (
        <section className="card form done-card">
          <p className="big">{result.ok ? "🎉" : "👍"} {result.speak}</p>
        </section>
      )}
      <button className="ghost" onClick={onOpenApp}>Open RoomiePet</button>
    </main>
  );
}
