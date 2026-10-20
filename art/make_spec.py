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

SHADES = {"d": {"from": "b", "shade": 0.78, "hue": -8}, "l": {"from": "b", "shade": 1.4}}


def pet(body, face_at, walk_row, walk, base_color, variants, extra_palette=None):
    x, y = face_at
    face = lambda part: {"at": [x, y], "part": part, "onto": "bl"}
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
            "palette": {"a": "#8fa8c8", "A": "#7f98b8", "t": "#5a6d8c", "T": "#46566f"},
            "frames": {
                "paper": ["aaAaaaAaaaAaaaAa"] * 16,
                "base": ["aaAaaaAaaaAaaaAa"] * 11 + ["tttttttttttttttt"] * 3 + ["TTTTTTTTTTTTTTTT"] * 2,
            },
        },
        "window": {
            "palette": {"f": "#f2ede4", "g": "#9fd3f0", "G": "#e6f6ff", "s": "#d9cdb8", "S": "#b8aa92"},
            "frames": {"day": window(), "night": {"base": "day", "replace": {"g": "n", "G": "N"}}},
            "variants": {},
        },
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
