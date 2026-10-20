// The room builder's blueprint: the room seen straight down, in feet, every piece a labelled
// footprint -- walls, doors and their swings, windows, the built-in closet -- so a room can be
// laid out to measure (the plan drawn to check Bedroom 2 against the real one was liked enough
// to keep). Pieces are picked up and dragged here as in the dollhouse, by the same rules.
import { useRef, useState } from "react";
import { CATALOG, COLORWAYS, DOORS, ROOMS, bounds, footprint, layoutProblem, place, postBox, roomAt, snap, wallSpotNear, wallsOf } from "@shared/home.js";

const INK = "#2b2238";
const DOOR = "#c0564a";

const short = (label) => label.replace(" (built in)", "").replace("Kitchen counter", "counter").replace("Laundry basket", "basket").toLowerCase();

/** A quarter-circle swing: hinge at h, leaf from a (shut) to b (open), radius r. */
function swing(h, a, b, r) {
  const sweep = (a[0] - h[0]) * (b[1] - h[1]) - (a[1] - h[1]) * (b[0] - h[0]) > 0 ? 1 : 0;
  return `M ${a[0]} ${a[1]} A ${r} ${r} 0 0 ${sweep} ${b[0]} ${b[1]}`;
}

/** A room door's swing, into this room, hinged at its `from` end. */
function doorSwing(room, d) {
  const w = d.to - d.from;
  if (d.axis === "x") {
    const into = roomAt(d.at - 0.5, (d.from + d.to) / 2) === room ? -1 : 1;
    const h = [d.at, d.from];
    return { h, shut: [d.at, d.to], open: [d.at + into * w, d.from], r: w };
  }
  const into = roomAt((d.from + d.to) / 2, d.at - 0.5) === room ? -1 : 1;
  const h = [d.from, d.at];
  return { h, shut: [d.to, d.at], open: [d.from, d.at + into * w], r: w };
}

/** A closet's two leaves, hinged at each end of its front, swinging into the room. */
function closetSwings(bi) {
  const ns = bi.doors === "n" || bi.doors === "s";
  const len = ns ? bi.x1 - bi.x0 : bi.y1 - bi.y0;
  const leaf = (len - 0.3) / 2;
  const face = { n: bi.y0, s: bi.y1, w: bi.x0, e: bi.x1 }[bi.doors];
  const out = bi.doors === "n" || bi.doors === "w" ? -1 : 1;
  const a0 = ns ? bi.x0 : bi.y0;
  const pt = (along, across) => (ns ? [along, face + out * across] : [face + out * across, along]);
  return [
    { h: pt(a0 + 0.1, 0), shut: pt(a0 + 0.1 + leaf, 0), open: pt(a0 + 0.1, leaf), r: leaf },
    { h: pt(a0 + len - 0.1, 0), shut: pt(a0 + len - 0.1 - leaf, 0), open: pt(a0 + len - 0.1, leaf), r: leaf },
  ];
}

export default function Blueprint({ room, draft, sel, open, onSelect, onMove, onMoveEnd, onToggleCloset }) {
  const svg = useRef(null);
  const drag = useRef(null);
  const [ghost, setGhost] = useState(null);
  const b = bounds(room);
  const pad = 2;
  const vb = [b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2];

  const toFeet = (e) => {
    const p = svg.current.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(svg.current.getScreenCTM().inverse());
    return [q.x, q.y];
  };

  const down = (e, index) => {
    e.stopPropagation();
    onSelect(index);
    const [x, y] = toFeet(e);
    const it = draft.items[index];
    drag.current = { index, start: it, grab: CATALOG[it.kind].layer === "wall" ? [0, 0] : [x - it.x, y - it.y] };
    svg.current.setPointerCapture?.(e.pointerId);
  };

  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = toFeet(e);
    const it = draft.items[d.index];
    const next = CATALOG[it.kind].layer === "wall"
      ? wallSpotNear(room, it, x, y)
      : { ...it, x: snap(x - d.grab[0]), y: snap(y - d.grab[1]) };
    if (JSON.stringify(next) === JSON.stringify(it)) return;
    const items = draft.items.map((p, k) => (k === d.index ? next : p));
    if (!layoutProblem(room, { ...draft, items })) {
      setGhost(null);
      onMove(d.index, next);
    } else setGhost(next);
  };

  const up = () => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (d) onMoveEnd(d.index, d.start);
  };

  const rect = (f, props) => <rect x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} {...props} />;
  const fill = (it) => `color-mix(in srgb, ${COLORWAYS[it.color] || "#ccc"} 55%, #fff)`;
  const order = draft.items.map((it, k) => [it, k]).sort(([a], [c]) => (CATALOG[a.kind].layer === "rug" ? 0 : 1) - (CATALOG[c.kind].layer === "rug" ? 0 : 1));
  const wallBar = (it) => {
    const f = footprint(it);
    const t = 0.3;
    return it.side === "n" || it.side === "s"
      ? { ...f, y0: it.line - t / 2, y1: it.line + t / 2 }
      : { ...f, x0: it.line - t / 2, x1: it.line + t / 2 };
  };

  return (
    <div className="blueprint">
      <svg ref={svg} viewBox={vb.join(" ")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerDown={() => onSelect(null)}
        role="img" aria-label={`${ROOMS[room].label} from above`}>
        <defs>
          <pattern id="bp-grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e7e3ef" strokeWidth="0.03" />
          </pattern>
        </defs>
        {ROOMS[room].areas.map((a, k) => rect(a, { key: `a${k}`, fill: "url(#bp-grid)" }))}
        {ROOMS[room].areas.map((a, k) => rect(a, { key: `w${k}`, fill: "#fff", fillOpacity: 0.6 }))}
        {(ROOMS[room].builtins || []).map((bi) => {
          const id = `${room}:${bi.kind}`;
          const isOpen = open.includes(id);
          return (
            <g key={id} className="bp-closet" onPointerDown={(e) => { e.stopPropagation(); onToggleCloset(id); }}>
              {rect(bi, { fill: "#ece8e1" })}
              <line x1={bi.x0 + 0.3} x2={bi.x1 - 0.3} y1={(bi.y0 + bi.y1) / 2} y2={(bi.y0 + bi.y1) / 2} stroke="#9a94a8" strokeWidth="0.06" />
              <text x={(bi.x0 + bi.x1) / 2} y={(bi.y0 + bi.y1) / 2 + 0.75} className="bp-label">{bi.style === "sliding" ? "closet (sliding doors)" : bi.style === "louvered" ? "closet (bifold)" : "closet (built in)"}</text>
              {bi.style !== "boards" && bi.style ? null : closetSwings(bi).map((s, k) => (
                <g key={k}>
                  <path d={swing(s.h, s.shut, s.open, s.r)} fill="none" stroke={DOOR} strokeWidth="0.05" strokeDasharray={isOpen ? "" : "0.2 0.15"} />
                  <line x1={s.h[0]} y1={s.h[1]} x2={(isOpen ? s.open : s.shut)[0]} y2={(isOpen ? s.open : s.shut)[1]} stroke={DOOR} strokeWidth="0.12" />
                </g>
              ))}
            </g>
          );
        })}
        {(ROOMS[room].posts || []).map((p, k) => rect(postBox(p), { key: `post${k}`, fill: "#e8e5df", stroke: INK, strokeWidth: 0.06 }))}
        {order.map(([it, k]) => {
          const c = CATALOG[it.kind];
          if (c.layer === "wall") return null;
          const f = footprint(it);
          const picked = k === sel;
          return (
            <g key={k} className="bp-piece" onPointerDown={(e) => down(e, k)}>
              {rect(f, { fill: c.layer === "rug" ? "none" : fill(it), stroke: picked ? "#f0a030" : c.layer === "rug" ? "#9fc49a" : "#5a5468",
                strokeWidth: picked ? 0.14 : 0.06, strokeDasharray: c.layer === "rug" ? "0.25 0.15" : "", rx: 0.08 })}
              {c.bed && (() => {
                const [ax, ay] = place(it, 0, 0);
                const [bx, by] = place(it, c.w, 0.3);
                return <rect x={Math.min(ax, bx)} y={Math.min(ay, by)} width={Math.abs(bx - ax)} height={Math.abs(by - ay)} fill="#7a4f2e" />;
              })()}
              <text x={(f.x0 + f.x1) / 2} y={(f.y0 + f.y1) / 2 + 0.15} className="bp-label"
                style={{ fontSize: `${Math.min(0.42, ((f.x1 - f.x0) * 0.9) / (short(c.label).length * 0.58))}px` }}>{short(c.label)}</text>
            </g>
          );
        })}
        {wallsOf(room).map((wl, k) => (wl.side === "n" || wl.side === "s"
          ? <line key={k} x1={wl.from} x2={wl.to} y1={wl.line} y2={wl.line} stroke={INK} strokeWidth="0.25" strokeLinecap="square" />
          : <line key={k} y1={wl.from} y2={wl.to} x1={wl.line} x2={wl.line} stroke={INK} strokeWidth="0.25" strokeLinecap="square" />))}
        {DOORS.filter((d) => d.rooms.includes(room)).map((d, k) => {
          const s = doorSwing(room, d);
          return (
            <g key={`d${k}`}>
              <path d={swing(s.h, s.shut, s.open, s.r)} fill="none" stroke={DOOR} strokeWidth="0.05" />
              <line x1={s.h[0]} y1={s.h[1]} x2={s.open[0]} y2={s.open[1]} stroke={DOOR} strokeWidth="0.12" />
            </g>
          );
        })}
        {draft.items.map((it, k) => {
          if (CATALOG[it.kind].layer !== "wall") return null;
          const f = wallBar(it);
          const color = it.kind.includes("window") ? "#7fbde3" : COLORWAYS[it.color] || "#999";
          return (
            <g key={`p${k}`} className="bp-piece" onPointerDown={(e) => down(e, k)}>
              {rect(f, { fill: color, stroke: k === sel ? "#f0a030" : "none", strokeWidth: 0.12 })}
            </g>
          );
        })}
        {ghost && CATALOG[ghost.kind].layer !== "wall" && rect(footprint(ghost), { fill: "#e64a5a", fillOpacity: 0.25, stroke: "#e64a5a", strokeWidth: 0.1, strokeDasharray: "0.2 0.12" })}
        <text x={(b.x0 + b.x1) / 2} y={b.y1 + 1.3} className="bp-dim">{b.x1 - b.x0} ft</text>
        <text x={b.x0 - 1.1} y={(b.y0 + b.y1) / 2} className="bp-dim" transform={`rotate(-90 ${b.x0 - 1.1} ${(b.y0 + b.y1) / 2})`}>{b.y1 - b.y0} ft</text>
      </svg>
    </div>
  );
}
