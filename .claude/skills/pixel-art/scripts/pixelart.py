#!/usr/bin/env python3
"""
pixelart.py -- pixel art from letter grids. Standard library only.

A spec (JSON) describes sprites as rows of letters, each letter a palette
colour. Frames can be built from other frames (shifted, flipped, patched
with reusable parts such as faces; a frame named "_..." is only a template
for others), and variants recolour a sprite by
swapping palette entries -- shades derived from a base colour follow it.

    python pixelart.py validate spec.json
    python pixelart.py render   spec.json --out build/ [--scale 1] [--preview-scale 8] [--frames] [--gif]
    python pixelart.py ascii    spec.json cat/idle_0

render writes:
    sheet.png     every frame of every sprite (and variant), a row each
    sheet.json    an atlas: frame rectangles, animations and their fps
                  (TexturePacker "hash" layout, which Phaser, PixiJS and
                  most engines load directly)
    preview.png   the sheet blown up on a checkerboard, frames spaced
                  apart, tiles repeated 3x3 so seams show -- for looking at
    frames/       one PNG per frame (--frames)
    *.gif         one per animation (--gif, needs Pillow)

Spec format: see SKILL.md and examples/.
"""
import argparse
import colorsys
import json
import os
import struct
import sys
import zlib

TRANSPARENT = (".", " ")
CLEAR = "_"  # in a patch: make this pixel transparent


class SpecError(Exception):
    pass


# -- colours ---------------------------------------------------------------

def parse_hex(value, where):
    v = value.lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) not in (6, 8):
        raise SpecError(f"{where}: {value!r} is not a #rgb, #rrggbb or #rrggbbaa colour")
    try:
        rgba = tuple(int(v[i:i + 2], 16) for i in range(0, len(v), 2))
    except ValueError:
        raise SpecError(f"{where}: {value!r} is not a hex colour")
    return rgba if len(rgba) == 4 else rgba + (255,)


def derive(base, shade=1.0, hue=0.0, sat=1.0):
    """
    A colour from another: shade < 1 darker, > 1 lighter; hue in degrees
    (shadows a little toward blue/purple and highlights toward yellow read
    better than plain darkening); sat multiplies saturation.
    """
    r, g, b, a = base
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    h = (h + hue / 360.0) % 1.0
    s = max(0.0, min(1.0, s * sat))
    if shade <= 1:
        v *= shade
    else:
        t = min(1.0, shade - 1)
        v = v + (1 - v) * t
        s = s * (1 - t * 0.6)
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return (round(r * 255), round(g * 255), round(b * 255), a)


def resolve_palette(entries, where):
    """{letter: "#hex" | {"from": letter, "shade", "hue", "sat"}} -> {letter: rgba}."""
    out, busy = {}, set()

    def get(key):
        if key in out:
            return out[key]
        if key not in entries:
            raise SpecError(f"{where}: palette entry {key!r} is used but not defined")
        if key in busy:
            raise SpecError(f"{where}: palette entry {key!r} is derived from itself")
        busy.add(key)
        value = entries[key]
        if isinstance(value, str):
            rgba = parse_hex(value, f"{where} palette {key!r}")
        elif isinstance(value, dict) and "from" in value:
            rgba = derive(get(value["from"]), float(value.get("shade", 1.0)),
                          float(value.get("hue", 0.0)), float(value.get("sat", 1.0)))
        else:
            raise SpecError(f"{where}: palette {key!r} must be \"#hex\" or {{\"from\": ...}}")
        busy.discard(key)
        out[key] = rgba
        return rgba

    for key in entries:
        if len(key) != 1 or key in TRANSPARENT or key == CLEAR:
            raise SpecError(f"{where}: palette keys are single letters (not '.', ' ' or '_'): {key!r}")
        get(key)
    return out


# -- frames ----------------------------------------------------------------

def _grid(rows, where):
    if not isinstance(rows, list) or not rows or not all(isinstance(r, str) for r in rows):
        raise SpecError(f"{where}: expected a list of row strings")
    width = len(rows[0])
    for i, r in enumerate(rows):
        if len(r) != width:
            raise SpecError(f"{where}: row {i} is {len(r)} wide, row 0 is {width}: {r!r}")
    return [list(r) for r in rows]


def build_frames(name, sprite, parts, include_templates=False):
    """Every frame of one sprite as a grid of letters, building derived frames from their bases."""
    defs = sprite.get("frames") or {}
    if not defs:
        raise SpecError(f"sprite {name!r} has no frames")
    built, busy = {}, set()

    def make(fname):
        if fname in built:
            return built[fname]
        if fname not in defs:
            raise SpecError(f"sprite {name!r}: frame {fname!r} is used but not defined")
        if fname in busy:
            raise SpecError(f"sprite {name!r}: frame {fname!r} is built from itself")
        busy.add(fname)
        d = defs[fname]
        where = f"{name}/{fname}"
        if isinstance(d, list):
            grid = _grid(d, where)
        elif isinstance(d, dict):
            if "rows" in d:
                grid = _grid(d["rows"], where)
            elif "base" in d:
                grid = [row[:] for row in make(d["base"])]
            else:
                raise SpecError(f"{where}: a frame is rows, or {{\"base\": ...}} with changes")
            grid = apply_ops(grid, d, parts, where)
        else:
            raise SpecError(f"{where}: a frame is a list of rows or an object")
        busy.discard(fname)
        built[fname] = grid
        return grid

    for fname in defs:
        make(fname)
    sizes = {(len(g[0]), len(g)) for g in built.values()}
    if len(sizes) > 1:
        raise SpecError(f"sprite {name!r}: frames differ in size {sorted(sizes)} -- pad them to one size")
    # Frames named "_..." are templates: other frames build on them, nothing exports them.
    kept = {f: g for f, g in built.items() if not f.startswith("_")}
    if not kept:
        raise SpecError(f"sprite {name!r}: every frame is a template (starts with '_')")
    return kept if not include_templates else built


def apply_ops(grid, d, parts, where):
    """The changes a derived frame makes, in this order: replace, patches, shift, flip."""
    h, w = len(grid), len(grid[0])
    for old, new in (d.get("replace") or {}).items():
        grid = [[new if c == old else c for c in row] for row in grid]
    for i, patch in enumerate(d.get("patch") or []):
        at = patch.get("at") or [0, 0]
        if "part" in patch:
            if patch["part"] not in parts:
                raise SpecError(f"{where}: part {patch['part']!r} is not defined")
            rows = parts[patch["part"]]
        else:
            rows = patch.get("rows")
        prows = _grid(rows, f"{where} patch {i}")
        x0, y0 = int(at[0]), int(at[1])
        only = patch.get("onto")  # only paint over these letters, e.g. "bld" keeps a face inside the body
        for y, prow in enumerate(prows):
            for x, c in enumerate(prow):
                X, Y = x0 + x, y0 + y
                if c in TRANSPARENT or not (0 <= X < w and 0 <= Y < h):
                    continue
                if only and grid[Y][X] not in only:
                    continue
                grid[Y][X] = "." if c == CLEAR else c
    shift = d.get("shift")
    if shift:
        dx, dy = int(shift[0]), int(shift[1])
        out = [["."] * w for _ in range(h)]
        for y in range(h):
            for x in range(w):
                if 0 <= x - dx < w and 0 <= y - dy < h:
                    out[y][x] = grid[y - dy][x - dx]
        grid = out
    flip = d.get("flip")
    if flip in ("x", "xy"):
        grid = [row[::-1] for row in grid]
    if flip in ("y", "xy"):
        grid = grid[::-1]
    return grid


# -- the spec --------------------------------------------------------------

def load(path):
    try:
        with open(path, encoding="utf-8") as fh:
            spec = json.load(fh)
    except json.JSONDecodeError as e:
        raise SpecError(f"{path}: not valid JSON ({e})")
    if not isinstance(spec.get("sprites"), dict) or not spec["sprites"]:
        raise SpecError(f"{path}: needs a \"sprites\" object")
    return spec


def compile_spec(spec):
    """
    [(key, frames {name: rgba grid}, info)] for every sprite and variant,
    in spec order. key is "sprite" or "sprite@variant".
    """
    parts = {k: v for k, v in (spec.get("parts") or {}).items()}
    for k, rows in parts.items():
        _grid(rows, f"part {k!r}")
    base_palette = spec.get("palette") or {}
    out = []
    for name, sprite in spec["sprites"].items():
        letters = build_frames(name, sprite, parts)
        used = {c for g in letters.values() for row in g for c in row} - set(TRANSPARENT)
        variants = {"": {}}
        variants.update(sprite.get("variants") or {})
        for vname, vpal in variants.items():
            key = name + (f"@{vname}" if vname else "")
            entries = {**base_palette, **(sprite.get("palette") or {}), **(vpal or {})}
            colors = resolve_palette(entries, key)
            missing = sorted(used - set(colors))
            if missing:
                raise SpecError(f"{key}: letters {missing} are drawn but not in the palette")
            frames = {f: [[None if c in TRANSPARENT else colors[c] for c in row] for row in g]
                      for f, g in letters.items()}
            out.append((key, frames, {
                "animations": sprite.get("animations") or {},
                "tile": bool(sprite.get("tile")),
            }))
    return out


# -- PNG and GIF -----------------------------------------------------------

def png_bytes(pixels):
    """Rows of rgba tuples (None transparent) as PNG bytes."""
    h, w = len(pixels), len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for p in row:
            raw += bytes(p) if p else b"\0\0\0\0"

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def scaled(grid, s):
    return [[p for p in row for _ in range(s)] for row in grid for _ in range(s)]


def blank(w, h, fill=None):
    return [[fill] * w for _ in range(h)]


def paste(dst, src, x0, y0, over=False):
    for y, row in enumerate(src):
        for x, p in enumerate(row):
            if p is None:
                continue
            if over and p[3] < 255 and dst[y0 + y][x0 + x]:
                a = p[3] / 255
                q = dst[y0 + y][x0 + x]
                p = tuple(round(p[i] * a + q[i] * (1 - a)) for i in range(3)) + (255,)
            dst[y0 + y][x0 + x] = p


def write(path, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data)


# -- render ----------------------------------------------------------------

def render(spec, out_dir, scale=1, preview_scale=None, frames_too=False, gif=False):
    compiled = compile_spec(spec)
    cell_w = max(len(next(iter(f.values()))[0]) for _, f, _ in compiled)
    cell_h = max(len(next(iter(f.values()))) for _, f, _ in compiled)
    cols = max(len(f) for _, f, _ in compiled)

    # The sheet: a row per sprite/variant, a cell per frame, each frame at its own size.
    sheet = blank(cols * cell_w * scale, len(compiled) * cell_h * scale)
    atlas = {"frames": {}, "animations": {}, "meta": {
        "app": "pixelart.py", "image": "sheet.png", "format": "RGBA8888", "scale": scale,
        "size": {"w": cols * cell_w * scale, "h": len(compiled) * cell_h * scale}, "fps": {}}}
    for r, (key, frames, info) in enumerate(compiled):
        for c, (fname, grid) in enumerate(frames.items()):
            w, h = len(grid[0]) * scale, len(grid) * scale
            x, y = c * cell_w * scale, r * cell_h * scale
            paste(sheet, scaled(grid, scale), x, y)
            atlas["frames"][f"{key}/{fname}"] = {
                "frame": {"x": x, "y": y, "w": w, "h": h}, "rotated": False, "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h}, "sourceSize": {"w": w, "h": h}}
            if frames_too:
                write(os.path.join(out_dir, "frames", key.replace("@", "_"), f"{fname}.png"),
                      png_bytes(scaled(grid, scale)))
        for aname, anim in info["animations"].items():
            names = anim.get("frames") if isinstance(anim, dict) else anim
            missing = [f for f in names if f not in frames]
            if missing:
                raise SpecError(f"{key}: animation {aname!r} names frames that do not exist: {missing}")
            atlas["animations"][f"{key}/{aname}"] = [f"{key}/{f}" for f in names]
            atlas["meta"]["fps"][f"{key}/{aname}"] = (anim.get("fps", 4) if isinstance(anim, dict) else 4)
    write(os.path.join(out_dir, "sheet.png"), png_bytes(sheet))
    with open(os.path.join(out_dir, "sheet.json"), "w", encoding="utf-8") as fh:
        json.dump(atlas, fh, indent=1)

    # The preview: big, on a checkerboard, frames apart; a tile shown 3x3 so its seams show.
    ps = preview_scale or max(2, min(12, 96 // max(cell_w, cell_h)))
    gap = 2
    wide = [3 if info["tile"] else 1 for _, _, info in compiled]
    pcols = max(len(f) * k for (_, f, _), k in zip(compiled, wide))
    pw = gap + pcols * (cell_w + gap) * ps
    ph = gap + sum((cell_h * k + gap) * ps for k in wide)
    preview = blank(pw, ph, (40, 40, 46, 255))
    y = gap
    for (key, frames, info), k in zip(compiled, wide):
        for c, grid in enumerate(frames.values()):
            gh, gw = len(grid), len(grid[0])
            x0 = gap + c * k * (cell_w + gap) * ps
            for yy in range(gh * k * ps):
                for xx in range(gw * k * ps):
                    light = ((xx // (ps * 2)) + (yy // (ps * 2))) % 2
                    preview[y + yy][x0 + xx] = (200, 200, 208, 255) if light else (168, 168, 178, 255)
            big = scaled(grid, ps)
            for ty in range(k):
                for tx in range(k):
                    paste(preview, big, x0 + tx * gw * ps, y + ty * gh * ps, over=True)
        y += (cell_h * k + gap) * ps
    write(os.path.join(out_dir, "preview.png"), png_bytes(preview))

    made = ["sheet.png", "sheet.json", "preview.png"]
    if gif:
        made += write_gifs(compiled, out_dir, max(4, ps // 2))
    return made, compiled


def write_gifs(compiled, out_dir, s):
    try:
        from PIL import Image
    except ImportError:
        print("--gif needs Pillow (pip install pillow); skipped", file=sys.stderr)
        return []
    made = []
    for key, frames, info in compiled:
        for aname, anim in info["animations"].items():
            names = anim.get("frames") if isinstance(anim, dict) else anim
            fps = anim.get("fps", 4) if isinstance(anim, dict) else 4
            images = []
            for f in names:
                grid = scaled(frames[f], s)
                img = Image.new("RGBA", (len(grid[0]), len(grid)), (200, 200, 208, 255))
                img.putdata([p if p else (200, 200, 208, 255) for row in grid for p in row])
                images.append(img.convert("P"))
            name = f"{key.replace('@', '_')}_{aname}.gif"
            images[0].save(os.path.join(out_dir, name), save_all=True, append_images=images[1:],
                           duration=int(1000 / fps), loop=0, disposal=2)
            made.append(name)
    return made


def ascii_frame(spec, ref):
    """One frame's letters, for reading back what a derived frame came out as."""
    name, _, fname = ref.partition("/")
    sprite = spec["sprites"].get(name.split("@")[0])
    if sprite is None:
        raise SpecError(f"no sprite {name!r}")
    frames = build_frames(name, sprite, spec.get("parts") or {}, include_templates=True)
    if fname not in frames:
        raise SpecError(f"{name} has no frame {fname!r}; it has {list(frames)}")
    return "\n".join("".join(row) for row in frames[fname])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate", help="check a spec and say what is in it")
    v.add_argument("spec")
    r = sub.add_parser("render", help="write sheet.png, sheet.json and preview.png")
    r.add_argument("spec")
    r.add_argument("--out", default="pixelart-out")
    r.add_argument("--scale", type=int, default=1, help="pixels per art pixel in the sheet and frames")
    r.add_argument("--preview-scale", type=int, default=None)
    r.add_argument("--frames", action="store_true", help="also one PNG per frame")
    r.add_argument("--gif", action="store_true", help="also a GIF per animation (Pillow)")
    a = sub.add_parser("ascii", help="print one frame's letters, e.g. cat/blink")
    a.add_argument("spec")
    a.add_argument("frame")
    args = ap.parse_args(argv)
    try:
        spec = load(args.spec)
        if args.cmd == "validate":
            for key, frames, info in compile_spec(spec):
                size = next(iter(frames.values()))
                print(f"{key}: {len(frames)} frames {len(size[0])}x{len(size)}"
                      + (f", animations {list(info['animations'])}" if info["animations"] else "")
                      + (", tile" if info["tile"] else ""))
            print("ok")
        elif args.cmd == "render":
            made, _ = render(spec, args.out, args.scale, args.preview_scale, args.frames, args.gif)
            for m in made:
                print(os.path.join(args.out, m))
        else:
            print(ascii_frame(spec, args.frame))
    except SpecError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
