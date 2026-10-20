"""
Writes art/sprites.json, RoomiePet's pixel art as letter grids (the
pixel-art skill renders it: npm run art). The pets are drawn here by hand,
row by row; the regular room pieces (window, bed, plant) are drawn with a
few rectangle helpers so their rows always come out the right width.
Edit this, run it, then `npm run art`.
"""
import json
import os


def canvas(w, h):
    return [["."] * w for _ in range(h)]


def rect(g, x, y, w, h, ch):
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            g[yy][xx] = ch


def rows(g):
    return ["".join(r) for r in g]


# -- faces (8 x 5), put on each body with "onto": "bl" ----------------------
FACES = {
    "face_open":  ["........", ".e....e.", ".e....e.", "c......c", "...mm..."],
    "face_blink": ["........", "........", "ee....ee", "c......c", "...mm..."],
    "face_happy": ["........", ".e....e.", "e.e..e.e", "c.m..m.c", "...mm..."],
    "face_sad":   ["e......e", ".e....e.", ".e....e.", "...mm...", "..m..m.."],
    "face_sleep": ["........", "........", "ee....ee", "........", "....m..."],
    "face_eat":   ["........", ".e....e.", "e.e..e.e", "c..mm..c", "...mm..."],
    "face_poorly": ["e.e..e.e", ".e....e.", "e.e..e.e", "........", "..mmmm.."],
}

CAT = [
    "................",
    "..oo........oo..",
    ".obpo......opbo.",
    ".obbboooooobbbo.",
    ".obbbbbbbbbbbbo.",
    "obblbbbbbbbbbbbo",
    "oblbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbbbwwwwbbbbbo",
    ".obbbwwwwwwbbbo.",
    ".odbbwwwwwwbbdo.",
    "..oddddddddddo..",
    "...oo......oo...",
    "................",
]
BUNNY = [
    "....oo....oo....",
    "...obpo..opbo...",
    "...obpo..opbo...",
    "...obpo..opbo...",
    "...obbo..obbo...",
    "..obbbbbbbbbbo..",
    ".obblbbbbbbbbbo.",
    ".oblbbbbbbbbbbo.",
    ".obbbbbbbbbbbbo.",
    ".obbbbbbbbbbbbo.",
    ".obbbbbbbbbbbbo.",
    ".obbbbwwwwbbbbo.",
    "..obbwwwwwwbbo..",
    "..oddddddddddo..",
    "...oo......oo...",
    "................",
]
CHICK = [
    "................",
    ".......oo.......",
    "......obbo......",
    "....oooooooo....",
    "...obbbbbbbbo...",
    "..obblbbbbbbbo..",
    ".oblbbbbbbbbbbo.",
    ".obbbbbbbbbbbbo.",
    "odbbbbbbbbbbbbdo",
    "odbbbbbbbbbbbbdo",
    ".obbbbbbbbbbbbo.",
    ".obbbbbbbbbbbbo.",
    "..odbbbbbbbbdo..",
    "...oddddddddo...",
    "....yy....yy....",
    "................",
]

# The raccoon: grey, a dark mask across the eyes, white brows and muzzle.
RACCOON = [
    "................",
    "..oo........oo..",
    ".okko......okko.",
    ".obbboooooobbbo.",
    ".obbbbbbbbbbbbo.",
    "obblbbbbbbbbbbbo",
    "obbwwbbbbbbwwbbo",
    "obkkkkkbbkkkkkbo",
    "okkkkkkbbkkkkkko",
    "obbbbbwwwwbbbbbo",
    "obbbbwwwwwwbbbbo",
    ".obbbwwwwwwbbbo.",
    ".odbbbwwwwbbbdo.",
    "..oddddddddddo..",
    "...oo......oo...",
    "................",
]
# The ferret: narrower than the rest, little round ears, a cream face with a dark band over the eyes.
FERRET = [
    "................",
    "................",
    "...oo......oo...",
    "..obpo....opbo..",
    "..obbboooobbbo..",
    "..obbbbbbbbbbo..",
    ".obwwbbbbbbwwbo.",
    ".obkkkbbbbkkkbo.",
    ".obkkkwwwwkkkbo.",
    ".obwwwwwwwwwwbo.",
    "..obwwwwwwwwbo..",
    "..obbwwwwwwbbo..",
    "..obbbbbbbbbbo..",
    "..oddddddddddo..",
    "...oo......oo...",
    "................",
]
# The possum: big round dark ears, pink inside, a white face with dark rings round the eyes.
POSSUM = [
    ".ooo........ooo.",
    "okkko......okkko",
    "okppko....okppko",
    "okppk" + "oooooo" + "kppko",
    ".okko" + "wwwwww" + "okko.",
    ".obwwwwwwwwwwbo.",
    "obwwwwwwwwwwwwbo",
    "obwrrrwwwwrrrwbo",
    "obwrrrwwwwrrrwbo",
    "obwwwwwwwwwwwwbo",
    "obbwwwwwwwwwwbbo",
    ".obbbwwwwwwbbbo.",
    ".odbbbbbbbbbbdo.",
    "..oddddddddddo..",
    "...oo......oo...",
    "................",
]
# The lop bunny: ears hanging down beside its face instead of standing up.
LOP = [
    "................",
    "................",
    ".....oooooo.....",
    "...oobbbbbboo...",
    "..obblbbbbbbbo..",
    ".ooobbbbbbbbooo.",
    "odpobbbbbbbbopdo",
    "odpobbbbbbbbopdo",
    "odpobbbbbbbbopdo",
    "odpobbbbbbbbopdo",
    "odpobbwwwwbbopdo",
    ".oo.obwwwwbo.oo.",
    "....odbbbbdo....",
    "....oddddddo....",
    ".....oo..oo.....",
    "................",
]

# The stitched bunny: a creepy-cute plush. Its left eye is sewn shut with an X
# (x stitches; n is body-coloured filling the X's gaps, so no face is drawn
# there); stuffing (W) puffs out of a split seam on top of its head; its right
# ear is bandaged (B, a darker fold C, a loose end hanging off); and its tummy
# has a patch (q) sewn on one side and a shaded heart (h light, r, R dark) on
# the other, below the mouth. Its right eye is a sewn-on button (u, holes v),
# so neither eye moves: its feelings show in its mouth, cheeks and brows.
STITCHED = [
    "....oo....oo....",
    "...obpo..opbo...",
    "...obpo.BBBCB...",
    "...obpo.Copbo...",
    "...obbo" + "WW" + "obbo...",
    "..obbbxWWxbbbo..",
    ".oblxnxbbuuubbo.",
    ".obbnxnbbvUvbbo.",
    ".obbxnxbbuuubbo.",
    ".obbbbbbbbbbbbo.",
    ".obbbbbbbbbbbbo.",
    ".obxqbwwwhrbrro.",
    "..oqqwwwwrrrRo..",
    "..odddddddrRdo..",
    "...oo......oo...",
    "................",
]

SHADES = {"d": {"from": "b", "shade": 0.78, "hue": -8}, "l": {"from": "b", "shade": 1.4}}


def pet(body, face_at, walk_row, walk, base_color, variants, extra_palette=None, onto="bl"):
    """onto: the letters a face may be drawn over -- a masked face (raccoon, ferret) or a white one (possum) adds its own."""
    x, y = face_at
    face = lambda part: {"at": [x, y], "part": part, "onto": onto}
    return {
        "palette": {"b": base_color, **SHADES, **(extra_palette or {})},
        "frames": {
            "_body": body,
            "idle_0": {"base": "_body", "patch": [face("face_open")]},
            "idle_1": {"base": "idle_0", "shift": [0, 1]},
            "blink": {"base": "_body", "patch": [face("face_blink")]},
            "walk_0": {"base": "idle_0", "patch": [{"at": [0, walk_row], "rows": [walk]}]},
            "happy": {"base": "_body", "patch": [face("face_happy")]},
            "happy_1": {"base": "happy", "shift": [0, -1]},
            "sad": {"base": "_body", "patch": [face("face_sad")], "shift": [0, 1]},
            "sleep_0": {"base": "_body", "patch": [face("face_sleep")], "shift": [0, 1]},
            "sleep_1": {"base": "_body", "patch": [face("face_sleep")]},
            "eat": {"base": "_body", "patch": [face("face_eat")]},
            "poorly": {"base": "_body", "patch": [face("face_poorly")], "shift": [0, 1]},
        },
        "animations": {
            "idle": {"frames": ["idle_0", "idle_1", "idle_0", "idle_1", "blink"], "fps": 3},
            "walk": {"frames": ["walk_0", "idle_1"], "fps": 6},
            "happy": {"frames": ["happy", "happy_1"], "fps": 4},
            "sad": {"frames": ["sad"], "fps": 1},
            "sleep": {"frames": ["sleep_0", "sleep_1"], "fps": 1.5},
            "eat": {"frames": ["eat", "idle_0"], "fps": 4},
            "poorly": {"frames": ["poorly", "sad"], "fps": 1},
        },
        "variants": {name: {"b": color, **extra} for name, (color, extra) in variants.items()},
    }


# -- the room ------------------------------------------------------------------

def window():
    g = canvas(32, 28)
    rect(g, 0, 0, 32, 25, "f")
    for px, py in ((2, 2), (17, 2)):
        for qy in (py, py + 11):
            rect(g, px, qy, 13, 9, "g")
            for i in range(4):  # a glint on each pane
                g[qy + 1 + i][px + 8 - i] = "G"
                g[qy + 1 + i][px + 9 - i] = "G"
    rect(g, 0, 25, 32, 3, "s")
    rect(g, 0, 27, 32, 1, "S")
    return rows(g)


def bed():
    g = canvas(32, 16)
    rect(g, 0, 2, 32, 14, "h")
    rect(g, 1, 3, 30, 11, "m")
    rect(g, 2, 4, 8, 8, "w")
    rect(g, 2, 11, 8, 1, "W")
    rect(g, 12, 3, 19, 11, "q")
    rect(g, 12, 3, 2, 11, "Q")
    rect(g, 0, 0, 3, 16, "h")  # headboard
    return rows(g)


def ellipse(g, cx, cy, rx, ry, ch):
    for y in range(len(g)):
        for x in range(len(g[0])):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                g[y][x] = ch


def outline(g, ch="o"):
    """A dark line round everything drawn, where it meets nothing."""
    h, w = len(g), len(g[0])
    edge = [(x, y) for y in range(h) for x in range(w) if g[y][x] == "." and any(
        0 <= x + dx < w and 0 <= y + dy < h and g[y + dy][x + dx] not in ".o"
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        g[y][x] = ch


# -- the house's rooms ---------------------------------------------------------
# Drawn front-on like the pets: a back wall, a floor, things standing against
# the wall or on the floor. Letters per piece; o is the shared outline.

def counter():
    """Kitchen counter with a sink and a hob, 32 x 22."""
    g = canvas(32, 22)
    rect(g, 1, 4, 30, 3, "T")          # worktop
    rect(g, 1, 7, 30, 14, "c")          # cupboards
    for x in (1, 11, 21):
        rect(g, x, 7, 1, 14, "C")       # cupboard joins
        rect(g, x + 7, 12, 1, 3, "h")   # handles
    rect(g, 4, 5, 8, 2, "S")            # sink
    rect(g, 7, 1, 2, 4, "S")            # tap
    rect(g, 7, 1, 4, 1, "S")
    for x in (20, 26):                  # hob rings
        rect(g, x, 5, 4, 1, "k")
    outline(g)
    return rows(g)


def fridge():
    g = canvas(16, 32)
    rect(g, 1, 1, 14, 30, "f")
    rect(g, 1, 11, 14, 1, "F")          # freezer door line
    rect(g, 12, 4, 1, 5, "h")
    rect(g, 12, 14, 1, 8, "h")
    rect(g, 2, 2, 2, 8, "W")            # shine
    rect(g, 3, 15, 4, 3, "m")           # a magnet / note
    outline(g)
    return rows(g)


def table():
    """Kitchen table with two stools, 32 x 18."""
    g = canvas(32, 18)
    rect(g, 2, 3, 28, 4, "t")
    rect(g, 2, 6, 28, 1, "u")
    rect(g, 4, 7, 2, 9, "u")
    rect(g, 26, 7, 2, 9, "u")
    rect(g, 12, 1, 4, 2, "r")           # a little fruit bowl
    rect(g, 13, 0, 2, 1, "R")
    outline(g)
    return rows(g)


def sofa():
    g = canvas(48, 22)
    rect(g, 3, 2, 42, 10, "a")          # back
    rect(g, 1, 8, 5, 12, "A")           # arms
    rect(g, 42, 8, 5, 12, "A")
    rect(g, 6, 11, 36, 7, "a")          # seat
    rect(g, 6, 11, 36, 1, "s")
    rect(g, 24, 3, 1, 15, "s")          # cushion seam
    rect(g, 3, 19, 2, 2, "u")           # feet
    rect(g, 43, 19, 2, 2, "u")
    rect(g, 9, 4, 8, 6, "p")            # a cushion
    outline(g)
    return rows(g)


def shelf():
    """A low bookcase with a TV on it, 24 x 26."""
    g = canvas(24, 26)
    rect(g, 2, 10, 20, 15, "u")
    for y in (14, 19):
        rect(g, 3, y, 18, 1, "U")
    books = "rgbyrbg"
    for i, ch in enumerate(books):
        rect(g, 4 + i * 2, 15 + (i % 2), 1, 4 - (i % 2), ch)
        rect(g, 5 + i * 2, 20, 1, 4, books[(i + 3) % len(books)])
    rect(g, 3, 0, 18, 10, "k")          # TV
    rect(g, 4, 1, 16, 8, "v")
    rect(g, 5, 2, 4, 2, "V")
    outline(g)
    return rows(g)


def rug(w=48, h=20):
    g = canvas(w, h)
    ellipse(g, w / 2, h / 2, w / 2 - 0.5, h / 2 - 0.5, "r")
    ellipse(g, w / 2, h / 2, w / 2 - 3, h / 2 - 3, "R")
    ellipse(g, w / 2, h / 2, w / 2 - 6, h / 2 - 5, "r")
    return rows(g)


def bathtub():
    g = canvas(34, 20)
    rect(g, 1, 4, 32, 12, "w")
    rect(g, 3, 5, 28, 4, "B")           # water
    rect(g, 4, 5, 8, 1, "b")            # ripple
    rect(g, 18, 6, 6, 1, "b")
    rect(g, 1, 9, 32, 1, "W")
    rect(g, 3, 16, 3, 3, "S")           # feet
    rect(g, 28, 16, 3, 3, "S")
    rect(g, 28, 0, 2, 4, "S")           # tap
    rect(g, 26, 0, 4, 1, "S")
    for x, y in ((6, 3), (9, 2), (13, 3), (20, 2)):   # bubbles
        rect(g, x, y, 2, 2, "q")
    outline(g)
    return rows(g)


def toilet():
    g = canvas(14, 20)
    rect(g, 2, 0, 10, 7, "w")           # cistern
    rect(g, 2, 6, 10, 1, "W")
    rect(g, 1, 8, 12, 4, "w")           # seat
    rect(g, 3, 9, 8, 2, "W")
    rect(g, 4, 12, 6, 7, "w")           # base
    rect(g, 10, 2, 1, 1, "S")
    outline(g)
    return rows(g)


def washer():
    g = canvas(18, 22)
    rect(g, 1, 1, 16, 20, "w")
    rect(g, 1, 1, 16, 4, "W")           # control strip
    rect(g, 3, 2, 2, 2, "k")
    rect(g, 12, 2, 3, 2, "g")
    ellipse(g, 9, 13, 6, 6, "S")        # door
    ellipse(g, 9, 13, 4.5, 4.5, "g")
    rect(g, 6, 11, 2, 2, "G")           # glint
    outline(g)
    return rows(g)


def basket():
    g = canvas(16, 14)
    rect(g, 2, 5, 12, 8, "t")
    for y in (7, 10):
        rect(g, 2, y, 12, 1, "u")
    rect(g, 3, 2, 4, 3, "p")            # clothes
    rect(g, 7, 1, 4, 4, "b")
    rect(g, 10, 3, 3, 2, "y")
    outline(g)
    return rows(g)


def nightstand():
    g = canvas(14, 24)
    rect(g, 2, 13, 10, 10, "t")
    rect(g, 2, 17, 10, 1, "u")
    rect(g, 6, 15, 2, 1, "h")
    rect(g, 6, 20, 2, 1, "h")
    rect(g, 6, 7, 2, 6, "u")            # lamp
    rect(g, 3, 1, 8, 6, "L")
    rect(g, 4, 2, 2, 3, "l")
    outline(g)
    return rows(g)


def doorway():
    """An open door in a wall, 18 x 30."""
    g = canvas(18, 30)
    rect(g, 0, 0, 18, 30, "f")
    rect(g, 2, 2, 14, 28, "k")
    rect(g, 3, 3, 12, 27, "K")
    return rows(g)


def picture(w=14, h=11, art="g"):
    g = canvas(w, h)
    rect(g, 0, 0, w, h, "f")
    rect(g, 1, 1, w - 2, h - 2, "s")
    rect(g, 2, h - 4, w - 4, 2, art)    # a little landscape
    rect(g, w - 5, 2, 2, 2, "y")
    return rows(g)


def plant():
    g = canvas(16, 24)
    leaves = [(7, 0, 2, 12, "g"), (3, 3, 4, 3, "g"), (9, 2, 4, 3, "g"), (2, 7, 5, 2, "G"),
              (9, 6, 5, 2, "G"), (4, 10, 3, 3, "g"), (9, 10, 3, 3, "G")]
    for x, y, w, h, ch in leaves:
        rect(g, x, y, w, h, ch)
    rect(g, 3, 14, 10, 2, "t")
    rect(g, 4, 16, 8, 7, "T")
    rect(g, 5, 23, 6, 1, "t")
    return rows(g)


spec = {
    "palette": {"o": "#2b2238", "e": "#2b2238", "m": "#a04060", "c": "#ffb3c1", "p": "#ff9fb2",
                "w": "#fff8ee", "y": "#f4a23a"},
    "parts": FACES,
    "sprites": {
        "cat": pet(CAT, (4, 5), 14, "..oo_......_oo..", "#f4d9b0", {
            "ginger": ("#f0a04b", {}),
            "charcoal": ("#5b5b6e", {"w": "#d8d8e0", "o": "#17131c", "e": "#f6e27a"}),
            "mint": ("#9de0c8", {}),
        }),
        "bunny": pet(BUNNY, (4, 7), 14, "..oo_......_oo..", "#f3eee8", {
            "cocoa": ("#b98a62", {}),
            "pebble": ("#a7a7b8", {}),
            "blush": ("#f5b5c8", {"p": "#ff7f9f"}),
        }, {"w": "#ffffff"}),
        "chick": pet(CHICK, (4, 6), 14, "...yy_...._yy...", "#ffd95a", {
            "sky": ("#9cc8f0", {}),
            "rose": ("#f7a8c4", {}),
            "sprout": ("#a8dc8a", {}),
        }, {"m": "#f4a23a", "c": "#ff9a7a"}),
        "lop": pet(LOP, (4, 6), 14, ".....oo_.._oo...", "#e2b77a", {
            "snow": ("#f3eee8", {"p": "#f7b6c6"}),
            "smoke": ("#8e8a98", {}),
            "choc": ("#7a553c", {"w": "#f1e2cf"}),
        }, {"p": "#f4a6b8"}, onto="blw"),
        "stitched": pet(STITCHED, (4, 6), 14, "..oo_......_oo..", "#c9b6e8", {
            "mint": ("#a8e6cf", {}),
            "bubblegum": ("#f7b2cf", {"r": "#b8264a"}),
            "bone": ("#e8e4dc", {"x": "#2b2238", "q": "#9fb4c8"}),
        }, {
            "x": "#4a2c4a", "n": {"from": "b"}, "W": "#fffaf0",
            "u": "#2b2238", "v": "#8c7aa6", "U": "#2b2238",
            "r": "#d64560", "h": {"from": "r", "shade": 1.35}, "R": {"from": "r", "shade": 0.68},
            "B": "#f4ecd8", "C": {"from": "B", "shade": 0.82},
            "q": {"from": "b", "hue": 70, "shade": 0.85, "sat": 1.3}, "p": "#f2a6b8",
        }),
        "raccoon": pet(RACCOON, (4, 6), 14, "..oo_......_oo..", "#a9a6b2", {
            "cinnamon": ("#b88a64", {}),
            "silver": ("#cfccd6", {}),
            "midnight": ("#6c6878", {"w": "#d9d6e0", "k": "#2e2a36"}),
        }, {"k": {"from": "b", "shade": 0.42, "hue": -6}, "w": "#f4f1ec", "e": "#fff6e0"}, onto="blkw"),
        "ferret": pet(FERRET, (4, 6), 14, "..oo_......_oo..", "#8a6a4f", {
            "albino": ("#f1e6d4", {"k": "#e3d2bc", "e": "#c2405a"}),
            "cinnamon": ("#c08850", {}),
            "silver": ("#a29da8", {}),
        }, {"k": {"from": "b", "shade": 0.8, "hue": -4, "sat": 0.85}, "w": "#f6ead2", "p": "#f4a6b8"}, onto="blkw"),
        "possum": pet(POSSUM, (4, 6), 14, "..oo_......_oo..", "#9c98a3", {
            "smoky": ("#6f6a78", {}),
            "cream": ("#d8cfc0", {}),
            "blossom": ("#c9a3b5", {}),
        }, {"k": "#3a3540", "r": "#b4afbd", "p": "#f2a6b8", "w": "#f6f3ee", "m": "#e0849c"}, onto="blrw"),
        "egg": {
            "palette": {"w": "#fff6e6", "s": "#f4a6b8", "d": "#e8d8c0"},
            "frames": {
                "egg_0": [
                    "................", "................", "................",
                    "......oooo......",
                    ".....owwwwo.....",
                    "....owwwwwwo....",
                    "....owwsswwo....",
                    "...owwwsswwwo...",
                    "...owwwwwwwwo...",
                    "...owsswwwwwo...",
                    "...owsswwsswo...",
                    "...odwwwwwwdo...",
                    "....oddddddo....",
                    ".....oooooo.....",
                    "................", "................",
                ],
                "egg_1": {"base": "egg_0", "shift": [1, 0]},
                "egg_2": {"base": "egg_0", "shift": [-1, 0]},
            },
            "animations": {"wobble": {"frames": ["egg_0", "egg_1", "egg_0", "egg_2", "egg_0", "egg_0"], "fps": 4}},
        },
        "floor": {
            "tile": True,
            "palette": {"k": "#c08a5c", "K": "#ad7a4e", "s": "#8a5d3a"},
            "frames": {"wood": [
                "kkkkkkkkkkkkkkks", "kkkkkkkkkkkkkkks", "kkkkkkkkkkkkkkks", "ssssssssssssssss",
                "KKKKKKKsKKKKKKKK", "KKKKKKKsKKKKKKKK", "KKKKKKKsKKKKKKKK", "ssssssssssssssss",
                "kkkskkkkkkkkkkkk", "kkkskkkkkkkkkkkk", "kkkskkkkkkkkkkkk", "ssssssssssssssss",
                "KKKKKKKKKKKsKKKK", "KKKKKKKKKKKsKKKK", "KKKKKKKKKKKsKKKK", "ssssssssssssssss",
            ]},
        },
        "wall": {
            "tile": True,
            "palette": {"a": "#8fa8c8", "A": {"from": "a", "shade": 0.9}, "t": {"from": "a", "shade": 0.62},
                        "T": {"from": "a", "shade": 0.48}},
            "frames": {
                "paper": ["aaAaaaAaaaAaaaAa"] * 16,
                "base": ["aaAaaaAaaaAaaaAa"] * 11 + ["tttttttttttttttt"] * 3 + ["TTTTTTTTTTTTTTTT"] * 2,
            },
            # One colour per room: rose and lilac bedrooms, a butter kitchen.
            "variants": {"rose": {"a": "#e7b8c6"}, "lilac": {"a": "#c3b3e0"}, "butter": {"a": "#f0dc9c"}},
        },
        # Tiles: the kitchen floor and the bathroom's walls and floor.
        "tile": {
            "tile": True,
            "palette": {"a": "#f4efe6", "g": {"from": "a", "shade": 0.8}, "A": "#e0d2bd"},
            "frames": {
                "check": ["aaaaaaaAAAAAAAAg"] * 7 + ["gggggggggggggggg"] + ["AAAAAAAaaaaaaaag"] * 7 + ["gggggggggggggggg"],
                "wall": (["aaaaaaagaaaaaaag"] * 7 + ["gggggggggggggggg"]) * 2,
            },
            "variants": {"aqua": {"a": "#d8f0ee", "A": "#9fd3cf"}},
        },
        "window": {
            "palette": {"f": "#f2ede4", "g": "#9fd3f0", "G": "#e6f6ff", "s": "#d9cdb8", "S": "#b8aa92"},
            "frames": {"day": window(), "night": {"base": "day", "replace": {"g": "n", "G": "N"}}},
            "variants": {},
        },
        "counter": {"palette": {"T": "#d9d2c5", "c": "#8fc1b5", "C": "#6f9f94", "h": "#3d5a52", "S": "#b8c0c8", "k": "#3a3540"},
                    "frames": {"counter": counter()}},
        "fridge": {"palette": {"f": "#eef1f4", "F": "#c9d0d8", "h": "#8a94a0", "W": "#ffffff", "m": "#f08a8a"},
                   "frames": {"fridge": fridge()}},
        "table": {"palette": {"t": "#c08a5c", "u": "#8a5d3a", "r": "#e2c34a", "R": "#e05d5d"}, "frames": {"table": table()}},
        "sofa": {"palette": {"a": "#e08a6a", "A": "#c8705a", "s": "#b8604c", "u": "#5a3a2a", "p": "#f2d36b"},
                 "frames": {"sofa": sofa()}},
        "shelf": {"palette": {"u": "#8a5d3a", "U": "#6a4428", "k": "#2b2238", "v": "#4a6b9a", "V": "#8fb8e8",
                              "r": "#e05d5d", "g": "#5ab86a", "b": "#5a8ad8", "y": "#e8c84a"},
                  "frames": {"shelf": shelf()}},
        "rug": {"palette": {"r": "#7fa8c8", "R": "#f1ece2"}, "frames": {"oval": rug()},
                "variants": {"pink": {"r": "#e7a1b6"}}},
        "mat": {"palette": {"r": "#7fcac2", "R": "#f1ece2"}, "frames": {"mat": rug(26, 12)},
                "variants": {"rose": {"r": "#e7a1b6"}}},
        "bathtub": {"palette": {"w": "#f7f7f7", "W": "#dcdcdc", "B": "#8fd0ef", "b": "#c8ecfb", "S": "#a8b0b8", "q": "#ffffff"},
                    "frames": {"tub": bathtub()}},
        "toilet": {"palette": {"w": "#f7f7f7", "W": "#dcdcdc", "S": "#a8b0b8"}, "frames": {"toilet": toilet()}},
        "washer": {"palette": {"w": "#f2f4f6", "W": "#d7dce2", "k": "#3a3540", "g": "#8fb8d8", "G": "#e6f6ff", "S": "#b8c0c8"},
                   "frames": {"washer": washer()}},
        "basket": {"palette": {"t": "#d2a86e", "u": "#a87c48", "p": "#f2a6b8", "b": "#8fb8e8", "y": "#f2d36b"},
                   "frames": {"basket": basket()}},
        "nightstand": {"palette": {"t": "#a87652", "u": "#7a4b2e", "h": "#e8c84a", "L": "#f6d98a", "l": "#fff3c4", "s": "#b8b0a0"},
                       "frames": {"lamp": nightstand(), "lamp_off": {"base": "lamp", "replace": {"L": "s", "l": "s"}}},
                       "variants": {}},
        "door": {"palette": {"f": "#f2ede4", "k": "#2b2238", "K": "#3a2f48"}, "frames": {"open": doorway()}},
        "picture": {"palette": {"f": "#8a5d3a", "s": "#bfe0f2", "g": "#5ab86a", "y": "#ffd166", "b": "#5a8ad8"},
                    "frames": {"hills": picture(), "sea": picture(art="b")}, "variants": {}},
        "bed": {
            "palette": {"h": "#7a4b2e", "m": "#f1ece2", "W": "#ddd5c5", "q": "#e07a8a", "Q": "#c25d6e"},
            "frames": {"bed": bed()},
        },
        "plant": {
            "palette": {"g": "#3a9d4a", "G": "#5ab86a", "t": "#9a4d2a", "T": "#c4683b"},
            "frames": {"plant": plant()},
        },
        "bowl": {
            "palette": {"r": "#e05d5d", "F": "#c08a50"},
            "frames": {
                "empty": ["................"] * 9 + [
                    "..oooooooooooo..", "..o..........o..", "..orrrrrrrrrro..",
                    "...orrrrrrrro...", "....oooooooo....", "................", "................"],
                "full": {"base": "empty", "patch": [{"at": [0, 8], "rows": ["....FF.FF.F.....", "..oFFFFFFFFFFo.."]}]},
            },
        },
        "crown": {
            "palette": {"y": "#ffd166", "Y": "#e9a93a", "r": "#e05d5d"},
            "frames": {"crown": ["y..y..y.", "yy.yy.yy", "yyyyyyyy", "YYrYYrYY", "YYYYYYYY"]},
        },
    },
}
# The window at night: the same panes, dark, with a star.
spec["sprites"]["window"]["palette"].update({"n": "#26305c", "N": "#3b4a80"})

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sprites.json")
with open(out, "w") as fh:
    json.dump(spec, fh, indent=1)
print("wrote", out)
