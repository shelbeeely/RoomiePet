// The pieces of the app around the house: a pet on its own, its card, the
// chore list and form, the feed, signing up and the household settings.
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, EFFORTS, NEEDS, PAT_COOLDOWN_MS, SPECIES, STAGES, sayHow } from "@shared/pet.js";
import { ASSIGNMENTS, RECURRENCES, addDays } from "@shared/chores.js";
import { animFor, draw, frameAt, petKey } from "./sprites.js";

export const NEED_LABEL = { food: "🍖 Food", clean: "🫧 Clean", fun: "🎈 Fun" };

/** One pet, animated, on its own little canvas. */
export function PetSprite({ atlas, species, color, stage = "grown", cond = { state: "ok", flags: {} }, size = 64 }) {
  const ref = useRef(null);
  // Drawn at the screen's real resolution, in whole pixels per art pixel, so it stays crisp.
  const dpr = typeof window !== "undefined" ? Math.min(3, Math.round(window.devicePixelRatio || 1)) : 1;
  const px = size * dpr;
  useEffect(() => {
    if (!atlas) return;
    const ctx = ref.current.getContext("2d");
    let raf;
    const loop = (ms) => {
      ctx.clearRect(0, 0, px, px);
      const key = stage === "egg" ? "egg" : petKey(species, color);
      const art = atlas.frames[`${key}/idle_0`]?.frame.w || atlas.frames["egg/egg_0"]?.frame.w || 64;
      const full = Math.max(1, Math.floor(px / art));
      const scale = stage === "baby" || stage === "egg" ? Math.max(1, Math.floor(full * 0.75)) : full;
      const bottom = px - (px - art * scale) / 2;
      draw(ctx, atlas, frameAt(atlas, key, animFor(cond), ms / 1000), px / 2, bottom, scale);
      if (stage === "star") draw(ctx, atlas, "crown/crown", px / 2, bottom - (art - 14) * scale, scale);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [atlas, species, color, stage, cond.state, px]);
  return <canvas ref={ref} width={px} height={px} style={{ width: size, height: size }} className="pet-sprite" />;
}

function Bar({ label, value }) {
  const tone = value < 25 ? "low" : value < 50 ? "mid" : "ok";
  return (
    <div className="bar">
      <span>{label}</span>
      <div className={`track ${tone}`} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function PetCard({ atlas, member, mine, onPat, now }) {
  const { pet, cond } = member;
  const stage = STAGES.find((s) => s.id === pet.stage);
  const wait = pet.patAt + PAT_COOLDOWN_MS - now;
  const into = pet.next ? Math.round(((pet.xp - stage.xp) / (pet.next.xp - stage.xp)) * 100) : 100;
  return (
    <section className="card pet-card">
      <PetSprite atlas={atlas} species={pet.species} color={pet.color} stage={pet.stage} cond={cond} size={112} />
      <div className="pet-info">
        <h2>
          {pet.name} <small>{mine ? "your pet" : `${member.name}'s pet`}</small>
        </h2>
        <p className="say">{sayHow(pet.name, cond)}</p>
        {pet.stage !== "egg" && NEEDS.map((n) => <Bar key={n} label={NEED_LABEL[n]} value={pet.stats[n]} />)}
        <div className="grow">
          <span>{stage.label}</span>
          <div className="track xp"><div style={{ width: `${into}%` }} /></div>
          <span>{pet.next ? `${pet.next.xp - pet.xp} xp to ${STAGES.find((s) => s.id === pet.next.stage).label}` : "fully grown ⭐"}</span>
        </div>
        {mine && pet.stage !== "egg" && (
          <button className="ghost" onClick={onPat} disabled={wait > 0}>
            {wait > 0 ? `Patted ✓ (${Math.ceil(wait / 60000)} min)` : "✋ Pat"}
          </button>
        )}
      </div>
    </section>
  );
}

function dueText(c) {
  if (c.overdue) return c.daysLeft === -1 ? "1 day late" : `${-c.daysLeft} days late`;
  if (c.dueToday) return "today";
  if (c.daysLeft === 1) return "tomorrow";
  return `in ${c.daysLeft} days`;
}

function whoText(c, names, me) {
  const n = (id) => (id === me ? "you" : names[id] || "someone");
  if (c.assignment === "anyone") return "anyone";
  if (c.assignment === "rotate") return c.assigneeId === me ? "your turn" : `${n(c.assigneeId)}'s turn`;
  return n(c.assigneeId);
}

export function ChoreList({ chores, names, me, onDone, onEdit, busy, flat = false }) {
  const groups = flat ? [["", chores]] : [
    ["Late", chores.filter((c) => c.overdue)],
    ["Today", chores.filter((c) => c.dueToday)],
    ["This week", chores.filter((c) => !c.overdue && !c.dueToday && c.daysLeft <= 7)],
    ["Later", chores.filter((c) => c.daysLeft > 7)],
  ].filter(([, list]) => list.length);
  if (!chores.length) return <p className="empty">No chores yet. Add the first one!</p>;
  return groups.map(([title, list]) => (
    <section key={title} className="chore-group">
      {title && <h3 className={title === "Late" ? "late" : ""}>{title}</h3>}
      <ul>
        {list.map((c) => {
          const mine = c.assignment === "anyone" || c.assigneeId === me;
          return (
            <li key={c.id} className={`chore${c.overdue ? " late" : ""}${mine ? " mine" : ""}`}>
              <button className="chore-main" onClick={() => onEdit(c)} aria-label={`Edit ${c.title}`}>
                <span className="icon">{CATEGORIES[c.category]?.icon}</span>
                <span>
                  <strong>{c.title}</strong>
                  <small>
                    {whoText(c, names, me)} · {dueText(c)} · {"●".repeat(c.effort)}
                    {c.recurrence !== "once" ? ` · ${c.recurrence === "every_n" ? `every ${c.everyDays} days` : RECURRENCES[c.recurrence].toLowerCase()}` : ""}
                  </small>
                </span>
              </button>
              <button className="done" disabled={busy === c.id} onClick={() => onDone(c)}>
                {mine ? "Done" : "Cover"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  ));
}

export function ChoreForm({ chore, members, me, today, onSave, onDelete, onClose, tags = [], onAddTag, onSetUpTag }) {
  const [f, setF] = useState(() => ({
    title: chore?.title ?? "",
    category: chore?.category ?? "cleaning",
    effort: chore?.effort ?? 1,
    recurrence: chore?.recurrence ?? "weekly",
    everyDays: chore?.everyDays ?? 3,
    assignment: chore?.assignment ?? "anyone",
    assigneeId: chore?.assigneeId ?? me,
    rotation: chore?.rotation?.length ? chore.rotation : members.map((m) => m.id),
    dueDate: chore?.dueDate ?? today,
  }));
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await onSave({ ...f, effort: Number(f.effort), everyDays: Number(f.everyDays) });
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={chore ? "Edit chore" : "New chore"} onClick={onClose}>
      <form className="card form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{chore ? "Edit chore" : "New chore"}</h2>
        <label>
          What
          <input value={f.title} onChange={set("title")} maxLength={80} placeholder="Take out the bins" autoFocus required />
        </label>
        <label>
          Kind
          <select value={f.category} onChange={set("category")}>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <option key={k} value={k}>{c.icon} {c.label} — feeds {c.need}</option>
            ))}
          </select>
        </label>
        <fieldset className="seg">
          <legend>Effort</legend>
          {Object.entries(EFFORTS).map(([k, label]) => (
            <label key={k} className={String(f.effort) === k ? "on" : ""}>
              <input type="radio" name="effort" value={k} checked={String(f.effort) === k} onChange={set("effort")} />
              {label}
            </label>
          ))}
        </fieldset>
        <label>
          Repeats
          <select value={f.recurrence} onChange={set("recurrence")}>
            {Object.entries(RECURRENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {f.recurrence === "every_n" && (
          <label>
            Every how many days
            <input type="number" min={1} max={365} value={f.everyDays} onChange={set("everyDays")} />
          </label>
        )}
        <label>
          Who
          <select value={f.assignment} onChange={set("assignment")}>
            {Object.entries(ASSIGNMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {f.assignment === "fixed" && (
          <select value={f.assigneeId} onChange={set("assigneeId")} aria-label="Who does it">
            {members.map((m) => <option key={m.id} value={m.id}>{m.id === me ? `${m.name} (you)` : m.name}</option>)}
          </select>
        )}
        {f.assignment === "rotate" && (
          <div className="checks">
            {members.map((m) => (
              <label key={m.id}>
                <input
                  type="checkbox"
                  checked={f.rotation.includes(m.id)}
                  onChange={(e) => setF({ ...f, rotation: e.target.checked ? [...f.rotation, m.id] : f.rotation.filter((id) => id !== m.id) })}
                />
                {m.name}
              </label>
            ))}
          </div>
        )}
        <label>
          {chore ? "Due" : "First due"}
          <input type="date" value={f.dueDate} min={addDays(today, -365)} onChange={set("dueDate")} required />
        </label>
        {chore && onAddTag && (
          <div className="tag-row">
            {tags.map((t) => (
              <button type="button" key={t.id} className="ghost small" onClick={() => onSetUpTag(t)}>📎 {t.label}</button>
            ))}
            <button type="button" className="ghost small" onClick={onAddTag}>📎 Add an NFC tag</button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row">
          {chore && (
            <button type="button" className="danger" onClick={() => confirm(`Remove "${chore.title}"?`) && onDelete()}>
              Remove
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}

const ago = (at, now) => {
  const m = Math.round((now - at) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

export function Feed({ feed, me, names, onKudos, now }) {
  if (!feed.length) return null;
  const line = (e) => {
    const d = e.data;
    switch (e.kind) {
      case "done":
        return (
          <>
            <b>{e.who}</b> did <b>{d.title}</b>
            {d.coveredFor ? <> for {d.coveredFor === me ? "you" : names[d.coveredFor] || "someone"} 💪</> : ""}
            {d.late ? " (late)" : ""}
          </>
        );
      case "joined": return <><b>{e.who}</b> moved in with {d.petName} 🏠</>;
      case "hatched": return <><b>{d.petName}</b> hatched! 🐣</>;
      case "grew": return <><b>{d.petName}</b> grew up into a {d.stage === "star" ? "star ⭐" : "grown pet"}!</>;
      case "left": return <><b>{e.who}</b> moved out. Bye, {d.petName}! 👋</>;
      default: return null;
    }
  };
  return (
    <section className="card feed">
      <h3>What's been happening</h3>
      <ul>
        {feed.map((e) => (
          <li key={e.id}>
            <span>{line(e)} <small>{ago(e.at, now)}</small></span>
            {e.kind === "done" && e.memberId !== me && (
              <button
                className={`kudos${e.kudos.includes(me) ? " given" : ""}`}
                disabled={e.kudos.includes(me)}
                onClick={() => onKudos(e)}
                aria-label="Cheer"
              >
                💖{e.kudos.length ? ` ${e.kudos.length}` : ""}
              </button>
            )}
            {e.kind === "done" && e.memberId === me && e.kudos.length > 0 && <span className="kudos given">💖 {e.kudos.length}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Choosing a pet: species, then colour, with the pet shown as it will look. */
export function PetPicker({ atlas, value, onChange }) {
  return (
    <div className="picker">
      <div className="species">
        {Object.entries(SPECIES).map(([s, info]) => (
          <button
            type="button"
            key={s}
            className={value.species === s ? "on" : ""}
            onClick={() => onChange({ species: s, color: SPECIES[s].colors[0] })}
          >
            <PetSprite atlas={atlas} species={s} color={value.species === s ? value.color : info.colors[0]} size={64} />
            {info.label}
          </button>
        ))}
      </div>
      <div className="colors">
        {SPECIES[value.species].colors.map((c) => (
          <button type="button" key={c} className={value.color === c ? "on" : ""} onClick={() => onChange({ ...value, color: c })}>
            <PetSprite atlas={atlas} species={value.species} color={c} cond={{ state: "happy", flags: {} }} size={44} />
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
