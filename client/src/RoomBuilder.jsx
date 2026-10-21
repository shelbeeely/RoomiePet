// The room builder's panel, under the room it arranges: what's picked up
// (its colour, a quarter turn, out it goes), the catalog to add from, and the
// wallpaper and floor. Moving pieces is done on the room itself, by dragging.
// Every change is checked as shared/home.js checks it on the server, so what
// can be saved is what the room shows.
import { useEffect, useRef, useState } from "react";
import {
  CATALOG, COLORWAYS, FLOORS, PILLOWS, GRID, ROOMS, TAPES_PER_CUBE, TAPE_COLORS, TAPE_TITLE_MAX, WALLPAPERS,
  COVER_URL_MAX, PALE_SPINES, TAPE_ART, coverOk, freeSpot, layoutProblem, moveTape, tapesOf, turned,
} from "@shared/home.js";
import { dollCamera, pieceSprite } from "./dollhouse.js";

const GROUPS = [
  ["bedroom", "🛏️ Bedroom"], ["living", "🛋️ Living"], ["kitchen", "🍳 Kitchen"], ["bath", "🛁 Bath"],
  ["pets", "🐾 Pets"], ["floor", "🧶 Rugs"], ["wall", "🖼️ Walls"],
];
const thumbCam = dollCamera("bedB", 0);

/** A piece drawn small, as the room would show it. */
export function Thumb({ item, size = 48 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const dpr = window.devicePixelRatio || 1;
    el.width = size * dpr;
    el.height = size * dpr;
    const ctx = el.getContext("2d");
    const sp = pieceSprite(item, thumbCam);
    const k = Math.min((size * dpr) / sp.w, (size * dpr) / sp.h);
    const s = k >= 1 ? Math.floor(k) : k;
    ctx.imageSmoothingEnabled = s < 1;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(sp.canvas, (el.width - sp.w * s) / 2, (el.height - sp.h * s) / 2, sp.w * s, sp.h * s);
  }, [JSON.stringify(item), size]);
  return <canvas ref={ref} className="thumb" style={{ width: size, height: size }} aria-hidden="true" />;
}

const sample = (kind, color) => (CATALOG[kind].layer === "wall"
  ? { kind, color: color || CATALOG[kind].colors[0], side: "n", line: 0, at: 0 }
  : { kind, color: color || CATALOG[kind].colors[0], x: 0, y: 0, rot: 0 });

/** A turned piece, nudged to the nearest place it fits, or null. */
function turnIn(room, draft, index) {
  const t = turned(draft.items[index]);
  for (let r = 0; r <= 8; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const it = { ...t, x: t.x + dx * GRID, y: t.y + dy * GRID };
        const items = draft.items.map((x, k) => (k === index ? it : x));
        if (!layoutProblem(room, { ...draft, items })) return items;
      }
    }
  }
  return null;
}

/**
 * The wall cubes' VHS tapes, spine out as on the shelf: tap one to pick it up, then tap another
 * to put it there (or a cube's end to put it last in that cube); ◀ ▶ nudge it along, across into
 * the next cube at the ends; rename it, recolour its spine, take it out or add another.
 */
function TapeShelf({ tapes, onChange }) {
  const [held, setHeld] = useState(null);
  const [note, setNote] = useState(null);
  const tape = held && tapes[held.cube]?.[held.i];
  const put = (to) => {
    const next = moveTape(tapes, held, to);
    if (!next) return setNote(`That cube is full: it holds ${TAPES_PER_CUBE}.`);
    setNote(null);
    onChange(next);
    setHeld({ cube: to.cube, i: Math.min(to.i, next[to.cube].length - 1) });
  };
  const nudge = (dir) => {
    const { cube, i } = held;
    if (dir < 0 && i > 0) return put({ cube, i: i - 1 });
    if (dir > 0 && i < tapes[cube].length - 1) return put({ cube, i: i + 1 });
    const next = cube + dir;
    if (next < 0 || next >= tapes.length) return;
    put({ cube: next, i: dir > 0 ? 0 : tapes[next].length });
  };
  const edit = (patch) => onChange(tapes.map((c, k) => (k === held.cube ? c.map((t, j) => {
    if (j !== held.i) return t;
    const { a, cover, ...rest } = { ...t, ...patch };
    return { ...rest, ...(a ? { a } : {}), ...(cover ? { cover } : {}) };
  }) : c)));
  const add = (cube) => {
    if (tapes[cube].length >= TAPES_PER_CUBE) return setNote(`That cube is full: it holds ${TAPES_PER_CUBE}.`);
    onChange(tapes.map((c, k) => (k === cube ? [...c, { t: "New tape", c: "black" }] : c)));
    setHeld({ cube, i: tapes[cube].length });
  };
  return (
    <div className="tape-shelf">
      <div className="cubes">
        {tapes.map((cube, k) => (
          <div key={k} className="cube" aria-label={`Cube ${k + 1}`}>
            {cube.map((t, i) => {
              const on = held && held.cube === k && held.i === i;
              return (
                <button key={i} className={`tape${on ? " on" : ""}${t.a ? " art" : ""}`} aria-pressed={on}
                  style={{ "--spine": TAPE_COLORS[t.c], "--ink": PALE_SPINES.has(t.c) ? "#1f1c26" : "#f6f3ec", ...spineBg(t.a) }}
                  aria-label={`${t.t}, cube ${k + 1}, ${i + 1} of ${cube.length}`}
                  onClick={() => (on ? setHeld(null) : held ? put({ cube: k, i }) : setHeld({ cube: k, i }))}>
                  {!t.a && <span>{t.t}</span>}
                </button>
              );
            })}
            <button className="tape-end" aria-label={held ? `Put it last in cube ${k + 1}` : `Add a tape to cube ${k + 1}`}
              onClick={() => (held ? put({ cube: k, i: tapes[k].length }) : add(k))}>{held ? "↓" : "＋"}</button>
          </div>
        ))}
      </div>
      {tape ? (
        <div className="tape-edit">
          <button className="ghost small" aria-label="Move it left" onClick={() => nudge(-1)}>◀</button>
          <button className="ghost small" aria-label="Move it right" onClick={() => nudge(1)}>▶</button>
          <input value={tape.t} maxLength={TAPE_TITLE_MAX} aria-label="Title" onChange={(e) => edit({ t: e.target.value })} />
          <div className="swatches" role="radiogroup" aria-label="Spine colour">
            {Object.entries(TAPE_COLORS).map(([c, hex]) => (
              <button key={c} role="radio" aria-checked={tape.c === c} aria-label={c} title={c}
                className={`swatch${tape.c === c ? " on" : ""}`} style={{ background: hex }} onClick={() => edit({ c })} />
            ))}
          </div>
          <div className="cover">
            {tape.cover && coverOk(tape.cover)
              ? <img src={tape.cover} alt={`The box of ${tape.t}`} referrerPolicy="no-referrer" />
              : <span className="hint">No box art yet</span>}
            <input type="url" inputMode="url" placeholder="Paste a link to a picture of its box" maxLength={COVER_URL_MAX}
              aria-label="Box art link" value={tape.cover || ""} onChange={(e) => edit({ cover: e.target.value.trim() || undefined })} />
            {tape.cover && !coverOk(tape.cover) && <span className="hint warn">That needs to be an https:// link.</span>}
          </div>
          <div className="spine-art" role="radiogroup" aria-label="Spine art">
            <button role="radio" aria-checked={!tape.a} className={`plain${!tape.a ? " on" : ""}`} onClick={() => edit({ a: undefined })}>Plain</button>
            {Object.entries(TAPE_ART).map(([id, art]) => (
              <button key={id} role="radio" aria-checked={tape.a === id} aria-label={art.label} title={art.label}
                className={tape.a === id ? "on" : ""} style={spineBg(id)} onClick={() => edit({ a: id })} />
            ))}
          </div>
          <button className="ghost small" onClick={() => {
            onChange(tapes.map((c, k) => (k === held.cube ? c.filter((_, j) => j !== held.i) : c)));
            setHeld(null);
          }}>🗑 Take out</button>
        </div>
      ) : (
        <p className="hint">Tap a tape to pick it up, then tap where it goes. ＋ adds one to a cube.</p>
      )}
      {note && <p className="hint warn">{note}</p>}
    </div>
  );
}

/** A spine's picture as a CSS background: her photo's spine, or the spine strip of an archive sleeve. */
function spineBg(id) {
  const art = TAPE_ART[id];
  if (!art) return {};
  if (!art.spine) return { backgroundImage: `url(${art.img})`, backgroundSize: "100% 100%" };
  const [x, w] = art.spine;
  return { backgroundImage: `url(${art.img})`, backgroundSize: `${100 / w}% 100%`, backgroundPosition: `${(x / (1 - w)) * 100}% 0` };
}

export default function RoomBuilder({ edit, saving, onChange, onSelect, onUndo, onCancel, onSave }) {
  const { room, draft, sel } = edit;
  const [tab, setTab] = useState("furniture");
  const [group, setGroup] = useState(room === "bath" ? "bath" : room === "main" ? "living" : "bedroom");
  const [note, setNote] = useState(null);
  const picked = sel != null ? draft.items[sel] : null;
  const pc = picked && CATALOG[picked.kind];

  const add = (kind) => {
    const item = freeSpot(room, draft, kind);
    if (!item) {
      setNote(`There's no room for a ${CATALOG[kind].label.toLowerCase()} — move something first.`);
      return;
    }
    setNote(null);
    onChange({ ...draft, items: [...draft.items, item] }, draft.items.length);
  };

  const turn = () => {
    const items = turnIn(room, draft, sel);
    if (!items) setNote(`No room to turn the ${pc.label.toLowerCase()} here.`);
    else {
      setNote(null);
      onChange({ ...draft, items });
    }
  };

  return (
    <section className="card builder" aria-label="Room builder">
      <div className="builder-head">
        <strong>Arranging {ROOMS[room].label.toLowerCase()}</strong>
        <div className="row">
          <button className="ghost small" onClick={onUndo} disabled={!edit.history.length}>↶ Undo</button>
          <button className="ghost small" onClick={onCancel}>Cancel</button>
          <span className="spacer" />
          <button className="small" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save room"}</button>
        </div>
      </div>
      {picked ? (
        <div className="picked">
          <Thumb item={picked} size={44} />
          <div className="picked-info">
            <b>{pc.label}</b>
            <div className="swatches" role="radiogroup" aria-label="Colour">
              {pc.colors.map((c) => (
                <button key={c} role="radio" aria-checked={picked.color === c} aria-label={c} title={c}
                  className={`swatch${picked.color === c ? " on" : ""}`} style={{ background: PILLOWS[c] ? `linear-gradient(135deg, ${COLORWAYS[c]} 55%, ${PILLOWS[c].case} 55%)` : COLORWAYS[c] }}
                  onClick={() => onChange({ ...draft, items: draft.items.map((it, k) => (k === sel ? { ...it, color: c } : it)) })} />
              ))}
            </div>
          </div>
          {pc.layer !== "wall" && <button className="ghost small" onClick={turn}>↻ Turn</button>}
          <button className="ghost small" onClick={() => onChange({ ...draft, items: draft.items.filter((_, k) => k !== sel) }, null)}>🗑 Remove</button>
          <button className="ghost small" aria-label="Put it down" onClick={() => onSelect(null)}>✓</button>
          {pc.shelves && (
            <TapeShelf tapes={tapesOf(picked)}
              onChange={(tapes) => onChange({ ...draft, items: draft.items.map((it, k) => (k === sel ? { ...it, tapes } : it)) })} />
          )}
        </div>
      ) : (
        <p className="hint">Drag furniture to move it, tap a piece to recolour, turn or remove it. ⟲ ⟳ turn the room.</p>
      )}
      {note && <p className="hint warn">{note}</p>}
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === "furniture"} className={tab === "furniture" ? "on" : ""} onClick={() => setTab("furniture")}>Furniture</button>
        <button role="tab" aria-selected={tab === "style"} className={tab === "style" ? "on" : ""} onClick={() => setTab("style")}>Walls &amp; floor</button>
      </div>
      {tab === "furniture" ? (
        <>
          <div className="room-chips small">
            {GROUPS.map(([g, label]) => (
              <button key={g} className={group === g ? "on" : ""} onClick={() => setGroup(g)}>{label}</button>
            ))}
          </div>
          <div className="catalog">
            {Object.entries(CATALOG).filter(([, c]) => c.group === group).map(([kind, c]) => (
              <button key={kind} className="catalog-item" onClick={() => add(kind)} aria-label={`Add ${c.label.toLowerCase()}`}>
                <Thumb item={sample(kind)} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="style-pick">
          <h4>Wallpaper</h4>
          <div className="swatches big">
            {Object.entries(WALLPAPERS).map(([id, w]) => (
              <button key={id} className={`swatch paper-${w.pattern}${draft.wall === id ? " on" : ""}`} style={{ "--c": w.base }}
                aria-label={w.label} title={w.label} onClick={() => onChange({ ...draft, wall: id })}><span>{w.label}</span></button>
            ))}
          </div>
          <h4>Floor</h4>
          <div className="swatches big">
            {Object.entries(FLOORS).map(([id, f]) => (
              <button key={id} className={`swatch floor-${f.pattern}${draft.floor === id ? " on" : ""}`} style={{ "--c": f.base }}
                aria-label={f.label} title={f.label} onClick={() => onChange({ ...draft, floor: id })}><span>{f.label}</span></button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
