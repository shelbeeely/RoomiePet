// The room builder's panel, under the room it arranges: what's picked up
// (its colour, a quarter turn, out it goes), the catalog to add from, and the
// wallpaper and floor. Moving pieces is done on the room itself, by dragging.
// Every change is checked as shared/home.js checks it on the server, so what
// can be saved is what the room shows.
import { useEffect, useRef, useState } from "react";
import { CATALOG, COLORWAYS, FLOORS, GRID, ROOMS, WALLPAPERS, freeSpot, layoutProblem, turned } from "@shared/home.js";
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
                  className={`swatch${picked.color === c ? " on" : ""}`} style={{ background: COLORWAYS[c] }}
                  onClick={() => onChange({ ...draft, items: draft.items.map((it, k) => (k === sel ? { ...it, color: c } : it)) })} />
              ))}
            </div>
          </div>
          {pc.layer !== "wall" && <button className="ghost small" onClick={turn}>↻ Turn</button>}
          <button className="ghost small" onClick={() => onChange({ ...draft, items: draft.items.filter((_, k) => k !== sel) }, null)}>🗑 Remove</button>
          <button className="ghost small" aria-label="Put it down" onClick={() => onSelect(null)}>✓</button>
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
