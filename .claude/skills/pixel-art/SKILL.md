---
name: pixel-art
description: Make pixel art -- character and pet sprites, animation frames, colour variants, items, icons and seamless tiles -- by writing letter-grid specs and rendering them to PNG sprite sheets with a JSON atlas, then looking at an enlarged preview and refining. Use this whenever a project needs sprites, game or app art, a tamagotchi/virtual pet, a tileset, pixel icons, a favicon or retro-style graphics, even if the user only says "make me a little character", "I need art for my pet game", "add an animation for when it sleeps", "make a blue version" or "the walk cycle looks off" -- and whenever existing art defined as character grids needs changing.
---

# Pixel art from letter grids

Small pixel art is easiest to make well as text: every pixel is a letter in a
grid, every letter a palette colour. You can read and edit it exactly, diff
it, build frames from other frames, and recolour a whole sprite by changing
one palette entry. `scripts/pixelart.py` (Python 3, standard library only)
turns a spec into images; you look at the preview, fix the grid, render again.

## The loop

1. **Agree what is needed.** Which sprites, what size (16x16 suits pets and
   characters, 8x8 or 16x16 items and icons, 16x16 or 32x32 tiles), which
   frames and animations, which colour variants, and where the files go in
   the project (and what loads them -- an engine atlas, CSS, a canvas, Tk).
   If the project already has art or a palette, match it.
2. **Write the spec** as JSON (format below). Start from
   `examples/pet.json` when it is close -- a pet with idle, blink, walk,
   happy and sleep, four colour variants, a floor tile and an item.
3. **Validate and render**:
   ```bash
   python <skill>/scripts/pixelart.py validate art/pets.json
   python <skill>/scripts/pixelart.py render art/pets.json --out assets/sprites [--frames] [--gif]
   ```
4. **Look at `preview.png`** (open it with your image-reading tool). It shows
   every frame enlarged on a checkerboard, a row per sprite and variant, and
   each tile repeated 3x3 so seams show. Check it as an artist would: does
   the silhouette read at 1x, are the eyes level and the face centred, does
   each animation frame differ only in what should move, do variants keep
   enough contrast against the outline? `ascii spec.json sprite/frame`
   prints what a derived frame came out as, letter by letter.
5. **Fix and re-render** until it looks right, then wire `sheet.png` and
   `sheet.json` (or the per-frame PNGs) into the project. Show the user the
   preview -- art is theirs to judge.

Read `references/craft.md` before drawing anything new: sizes, outlines,
shading, faces and animation, the things that make 16 pixels look alive.

## Bigger sprites: draw with shapes

Typing rows works up to about 24 x 24. Beyond that (32 x 32, 64 x 64 pets,
furniture at 16 px to the foot) draw with `scripts/painter.py` in a small
Python script that writes the spec's rows:

```python
from painter import Painter            # sys.path: <skill>/scripts
p = Painter(64, 64)
p.ellipse(32, 13, 5, 14, "b")          # ears, body, feet: shapes in palette letters
p.ellipse(32, 40, 21, 17, "b")
p.shade(body="b", dark="d", light="l") # light from the top-left, worked out from the shape
p.ellipse(32, 50, 11, 7, "w", only="bld")  # markings only where there is body
p.ellipse(23, 39, 3.2, 4.2, "e")       # then the face by hand
p.outline("o")                         # the dark line round everything
rows = p.rows()
```

Also `rect`, `poly`, `line`, `ring` (an ellipse's rim, or its top or bottom
half -- closed eyes, smiles), `path` (thick strokes: tails), `blit` (paste
typed rows: small details), `shift`. Build each frame from parameters (pose,
expression) so every animation and every species shares them; colour
variants still come from the spec's palette. Render with `--no-preview` when
iterating on a big sheet, and look at the preview at the end.

## Spec format

```json
{
  "palette": {"o": "#2b2238", "e": "#2b2238", "w": "#fff8ee"},
  "parts": {
    "face_open": [".e....e.", ".e....e.", "c......c", "...mm..."]
  },
  "sprites": {
    "cat": {
      "palette": {
        "b": "#f4d9b0",
        "d": {"from": "b", "shade": 0.78, "hue": -8},
        "l": {"from": "b", "shade": 1.4}
      },
      "frames": {
        "_body":  ["................", "..oo........oo..", "..."],
        "idle_0": {"base": "_body", "patch": [{"at": [4, 6], "part": "face_open", "onto": "bl"}]},
        "idle_1": {"base": "idle_0", "shift": [0, 1]},
        "walk_0": {"base": "idle_0", "patch": [{"at": [0, 14], "rows": ["..oo_......_oo.."]}]}
      },
      "animations": {"idle": {"frames": ["idle_0", "idle_1"], "fps": 3}},
      "variants": {"ginger": {"b": "#f0a04b"}}
    },
    "floor": {"tile": true, "palette": {"k": "#b07d4f"}, "frames": {"wood": ["kkkk", "..."]}}
  }
}
```

- **Rows** are strings of equal length; each character is a palette letter.
  `.` (or a space) is transparent. All frames of one sprite are one size.
- **Palette**: single-letter keys. A value is `"#rgb"`, `"#rrggbb"`,
  `"#rrggbbaa"`, or derived from another entry: `{"from": "b", "shade":
  0.78, "hue": -8, "sat": 1.0}` (shade < 1 darker, > 1 lighter; hue in
  degrees). The top-level palette is shared; a sprite's adds to or
  overrides it; a variant's overrides both.
- **Derived frames**: `{"base": frame, ...}` then, in order: `replace`
  (`{"e": "o"}` swaps letters), `patch` (a list of `{"at": [x, y],
  "rows": [...]}` or `{"at": [x, y], "part": name}`; in a patch `.` keeps
  what is under it and `_` clears it; `"onto": "bl"` paints only over those
  letters, which keeps a face inside a round body), `shift` (`[dx, dy]`,
  what moves off the edge is lost), `flip` (`"x"`, `"y"` or `"xy"`).
- **Templates**: a frame whose name starts with `_` is built and can be a
  base, but is not exported.
- **Parts** are reusable row blocks (faces, accessories) shared by all sprites.
- **Animations**: `{"frames": [...], "fps": n}` or just a list (4 fps).
- **Variants** recolour the whole sprite. Derive shades from the base colour
  (as `d` and `l` above) so one changed entry recolours the shading too.
- **Tiles**: `"tile": true` previews 3x3 so you can see whether edges meet.

## What render writes

- `sheet.png` -- a row per sprite and variant (`cat`, `cat@ginger`, ...), a
  cell per frame; `--scale n` enlarges it (keep 1 and scale in the engine
  with nearest-neighbour filtering, unless the target cannot).
- `sheet.json` -- TexturePacker "JSON hash" atlas: `frames["cat@ginger/idle_0"]`
  rectangles, `animations["cat@ginger/idle"]` frame lists, and
  `meta.fps`. Phaser (`load.atlas`), PixiJS (`Assets.load`) and most engines
  read it directly.
- `preview.png` -- for looking at, not for shipping.
- `frames/<sprite>[_<variant>]/<frame>.png` with `--frames`; a GIF per
  animation with `--gif` (needs Pillow; skipped with a note otherwise).

Wherever the art is shown, keep it crisp: `image-rendering: pixelated` in
CSS, `imageSmoothingEnabled = false` on a canvas, `Image.NEAREST` in
Pillow, `PhotoImage.zoom` in Tk.

## Notes

- Keep the spec in the project (e.g. `art/sprites.json`) next to the rendered
  output, so the art can be changed later by editing text and re-rendering.
  Re-render after every spec change rather than hand-editing PNGs.
- Errors name the sprite, frame and row (`cat/_body: row 4 is 15 wide,
  row 0 is 16`). A row one character short is the most common mistake --
  count, or build rows from equal-width pieces.
- If the project draws art in code (Python, JS) rather than loading PNGs,
  the same grids and palette can be pasted in as data; the spec stays the
  source of truth.
