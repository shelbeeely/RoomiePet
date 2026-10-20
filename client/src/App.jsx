import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, conditionOf, SPECIES } from "@shared/pet.js";
import { sortChores } from "@shared/chores.js";
import { api, ApiError, getToken, listen, setToken } from "./api.js";
import { loadAtlas } from "./sprites.js";
import HouseScene from "./HouseScene.jsx";
import Welcome from "./Welcome.jsx";
import { ChoreForm, ChoreList, Feed, PetCard, PetPicker } from "./components.jsx";
import { InstallCard, NotificationsCard, ShortcutsCard, TagPage, TagsCard, TagWriter } from "./integrations.jsx";
import { resyncPush, setBadge } from "./pwa.js";

// A chore done plays on the doer's pet for a few seconds: a kitchen chore sends
// it to the bowl, a cleaning one to the bath, anything else is a happy hop.
const EFFECT_MS = 9000;
const effectFor = (category) => ({ food: "eat", clean: "clean" })[CATEGORIES[category]?.need] || "happy";

const TABS = ["home", "chores", "house", "me"];

export default function App() {
  const params = new URLSearchParams(location.search);
  // /t/<id>: an NFC tag was tapped.
  const tagId = location.pathname.match(/^\/t\/([\w-]{8,64})$/)?.[1] || null;
  const [atlas, setAtlas] = useState(null);
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));
  const [onTag, setOnTag] = useState(Boolean(tagId));
  const [state, setState] = useState(null);
  // The app's long-press shortcuts open a tab directly (?tab=chores, &add=1).
  const [tab, setTab] = useState(() => (TABS.includes(params.get("tab")) ? params.get("tab") : "home"));
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(() => (params.get("add") ? "new" : null)); // a chore, "new", or null
  const [writingTag, setWritingTag] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(null);
  const [effects, setEffects] = useState({});
  const [clock, setClock] = useState(Date.now());
  const seen = useRef(null); // feed events already shown, so a roommate's chore plays once
  const toastTimer = useRef(null);

  useEffect(() => {
    loadAtlas().then(setAtlas).catch(() => say("The pet pictures did not load"));
  }, []);

  const say = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const refresh = useCallback(async () => {
    try {
      setState(await api("GET", "/api/state"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setToken(null);
        setSignedIn(false);
      }
    }
  }, []);

  // Fetch now, whenever anything changes, every minute (needs fade), and on coming back to the tab.
  useEffect(() => {
    if (!signedIn || onTag) return;
    refresh();
    resyncPush();
    if (params.get("tab") || params.get("add") || params.get("source")) history.replaceState(null, "", "/");
    const stop = listen(refresh);
    const every = setInterval(refresh, 60000);
    const tick = setInterval(() => setClock(Date.now()), 15000);
    const back = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", back);
    return () => {
      stop();
      clearInterval(every);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", back);
    };
  }, [signedIn, onTag, refresh]);

  // A chore done by anyone plays on their pet: to the bowl for kitchen chores, a happy hop otherwise.
  useEffect(() => {
    if (!state) return;
    const fresh = state.feed.filter((e) => e.kind === "done" && Date.now() - e.at < 60000);
    if (seen.current === null) {
      seen.current = new Set(state.feed.map((e) => e.id));
      return;
    }
    const add = {};
    for (const e of fresh) {
      if (seen.current.has(e.id)) continue;
      add[e.memberId] = { kind: effectFor(e.data.category), until: Date.now() + EFFECT_MS };
      if (e.memberId !== state.me) say(`${e.who} did ${e.data.title}! Send a 💖?`);
    }
    state.feed.forEach((e) => seen.current.add(e.id));
    if (Object.keys(add).length) setEffects((cur) => ({ ...cur, ...add }));
  }, [state]);

  const hour = new Date(clock).getHours();
  const members = useMemo(
    () =>
      (state?.members || []).map((m, i) => ({
        ...m,
        phase: i * 0.37,
        cond: conditionOf(m.pet.stats, { xp: m.pet.xp, joyAt: m.pet.joyAt, now: clock, hour }),
      })),
    [state, clock, hour],
  );
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));

  const myOpen = state
    ? sortChores(state.chores, state.today).filter((c) => (c.overdue || c.dueToday) && (c.assignment === "anyone" || c.assigneeId === state.me))
    : [];
  // The number on the app icon: how many chores are yours today.
  useEffect(() => {
    if (state) setBadge(myOpen.length);
  }, [state, myOpen.length]);

  const openApp = () => {
    history.replaceState(null, "", "/");
    setOnTag(false);
  };
  if (onTag && tagId && (signedIn || !getToken())) {
    if (!signedIn && onTag === "signing-in") {
      return <Welcome atlas={atlas} initialMode="device" keepPath onIn={() => { setSignedIn(true); setOnTag(true); }} />;
    }
    return <TagPage id={tagId} onOpenApp={openApp} onSignIn={() => setOnTag("signing-in")} />;
  }
  if (!signedIn) return <Welcome atlas={atlas} onIn={() => setSignedIn(true)} />;
  if (!state) return <main className="loading">Loading your house…</main>;

  const me = members.find((m) => m.id === state.me);
  const shown = members.find((m) => m.id === selected) || me;
  const chores = sortChores(state.chores, state.today);

  const run = async (fn, okText) => {
    try {
      const out = await fn();
      if (okText) say(typeof okText === "function" ? okText(out) : okText);
      await refresh();
      return out;
    } catch (e) {
      say(e.message);
      throw e;
    }
  };

  const done = async (c) => {
    setBusy(c.id);
    try {
      const out = await run(() => api("POST", `/api/chores/${c.id}/done`, {}));
      seen.current?.add(out.eventId);
      setEffects((cur) => ({ ...cur, [state.me]: { kind: effectFor(c.category), until: Date.now() + EFFECT_MS } }));
      const bits = Object.entries(out.gain).filter(([, v]) => v > 0).map(([k, v]) => `+${v} ${k}`);
      if (out.stage.after !== out.stage.before) {
        say(out.stage.after === "baby" ? `🐣 ${me.pet.name} hatched!` : `✨ ${me.pet.name} grew up!`);
      } else say(`Nice! ${me.pet.name}: ${bits.join(", ")}`);
    } catch {
      /* said */
    } finally {
      setBusy(null);
    }
  };

  const saveChore = async (fields) => {
    if (editing === "new") await run(() => api("POST", "/api/chores", fields), "Chore added");
    else await run(() => api("PATCH", `/api/chores/${editing.id}`, fields), "Saved");
    setEditing(null);
  };

  return (
    <div className="app">
      <header>
        <h1>🏠 {state.household.name}</h1>
        {myOpen.length > 0 && <span className="badge">{myOpen.length} for you today</span>}
      </header>

      <main>
        {tab === "home" && (
          <>
            <HouseScene atlas={atlas} pets={members} effects={effects} selectedId={shown.id} onSelect={setSelected} hour={hour} />
            <PetCard
              atlas={atlas}
              member={shown}
              mine={shown.id === state.me}
              now={clock}
              onPat={() => run(() => api("POST", "/api/pet/pat", {}), `${me.pet.name} loved that 💖`)}
            />
            {myOpen.length > 0 && (
              <section className="card">
                <h3>Yours today</h3>
                <ChoreList chores={myOpen} names={names} me={state.me} onDone={done} onEdit={setEditing} busy={busy} flat />
              </section>
            )}
            <Feed feed={state.feed} me={state.me} names={names} now={clock}
              onKudos={(e) => run(() => api("POST", `/api/feed/${e.id}/kudos`, {}), `💖 sent to ${e.who}`)} />
          </>
        )}

        {tab === "chores" && (
          <>
            <div className="row">
              <h2>Chores</h2>
              <span className="spacer" />
              <button onClick={() => setEditing("new")}>+ Add</button>
            </div>
            <ChoreList chores={chores} names={names} me={state.me} onDone={done} onEdit={setEditing} busy={busy} />
          </>
        )}

        {tab === "house" && <House state={state} members={members} run={run} />}
        {tab === "me" && <Me atlas={atlas} state={state} members={members} run={run} say={say}
          onLeave={() => { setToken(null); setSignedIn(false); setState(null); }} />}
      </main>

      {editing && (
        <ChoreForm
          chore={editing === "new" ? null : editing}
          members={members}
          me={state.me}
          today={state.today}
          onSave={saveChore}
          onDelete={async () => { await run(() => api("DELETE", `/api/chores/${editing.id}`), "Removed"); setEditing(null); }}
          onClose={() => setEditing(null)}
          tags={editing === "new" ? [] : state.tags.filter((t) => t.choreId === editing.id)}
          onAddTag={async () => {
            const label = prompt(`Where will the tag go? (e.g. "Dishwasher")`, editing.title);
            if (label === null) return;
            const t = await run(() => api("POST", "/api/tags", { choreId: editing.id, label: label || editing.title }));
            setEditing(null);
            setWritingTag({ id: t.id, label: label || editing.title, choreTitle: editing.title });
          }}
          onSetUpTag={(t) => { setEditing(null); setWritingTag(t); }}
        />
      )}
      {writingTag && <TagWriter tag={writingTag} onClose={() => setWritingTag(null)} />}

      <nav className="tabbar">
        {[["home", "🏠", "Home"], ["chores", "🧹", "Chores"], ["house", "👥", "House"], ["me", "⚙️", "Me"]].map(([k, icon, label]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} aria-current={tab === k}>
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function House({ state, members, run }) {
  const link = `${location.origin}/?join=${state.household.inviteCode}`;
  const share = async () => {
    const text = `Join our household on RoomiePet: ${link} (code ${state.household.inviteCode})`;
    if (navigator.share) await navigator.share({ title: "RoomiePet", text, url: link }).catch(() => {});
    else await navigator.clipboard?.writeText(text);
  };
  return (
    <>
      <section className="card">
        <h2>{state.household.name}</h2>
        <p>Invite code: <b className="code">{state.household.inviteCode}</b></p>
        <div className="row">
          <button onClick={() => run(share, navigator.share ? null : "Invite copied")}>Invite a roommate</button>
          <button className="ghost" onClick={() => confirm("Make a new invite code? The old one stops working.") &&
            run(() => api("POST", "/api/household/invite", {}), "New invite code made")}>New code</button>
        </div>
      </section>

      <section className="card">
        <h3>Roommates</h3>
        <ul className="people">
          {members.map((m) => (
            <li key={m.id}>
              <span>{m.name}{m.id === state.me ? " (you)" : ""}</span>
              <small>{m.pet.name} · {m.pet.stage} · {m.pet.xp} xp</small>
            </li>
          ))}
        </ul>
      </section>

      <TagsCard state={state} run={run} />
    </>
  );
}

function Me({ atlas, state, members, run, say, onLeave }) {
  const me = members.find((m) => m.id === state.me);
  const [edit, setEdit] = useState({ name: me.name, petName: me.pet.name, species: me.pet.species, color: me.pet.color });
  const [device, setDevice] = useState(null);
  return (
    <>
      <InstallCard />
      <NotificationsCard prefs={state.notify} run={run} say={say} />

      <form className="card form" onSubmit={(e) => { e.preventDefault(); run(() => api("PATCH", "/api/me", edit), "Saved"); }}>
        <h3>You and your pet</h3>
        <label>Your name<input value={edit.name} maxLength={30} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
        <label>Pet's name<input value={edit.petName} maxLength={24} onChange={(e) => setEdit({ ...edit, petName: e.target.value })} /></label>
        <PetPicker atlas={atlas} value={{ species: edit.species, color: edit.color }} onChange={(v) => setEdit({ ...edit, ...v, color: SPECIES[v.species].colors.includes(v.color) ? v.color : SPECIES[v.species].colors[0] })} />
        <button type="submit">Save</button>
      </form>

      <ShortcutsCard run={run} />

      <section className="card">
        <h3>Add another device</h3>
        <p className="hint">A new phone, a tablet -- or on iPhone, the Home Screen app after using Safari (they keep separate sign-ins).</p>
        {device ? (
          <p>On the other device choose <b>I'm already in</b> and enter <b className="code">{device.code}</b> (works once, for 15 minutes).</p>
        ) : (
          <button className="ghost" onClick={() => run(async () => setDevice(await api("POST", "/api/me/device-code", {})))}>Get a code</button>
        )}
      </section>

      <section className="card">
        <button className="danger" onClick={() => confirm(`Move out of ${state.household.name}? Your pet leaves with you and this can't be undone.`) &&
          run(() => api("DELETE", "/api/me")).then(onLeave)}>Move out</button>
      </section>
    </>
  );
}
