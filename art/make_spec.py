"""
Writes art/sprites.json: RoomiePet's pixel art for the pixel-art skill to
render (npm run art). Pets are 64 x 64, drawn from shapes in pets64.py; the
apartment's furniture is drawn the same way in house64.py, at 16 pixels to
the foot. This file gives them their colours: each species' colour variants
recolour the whole pet, shading included.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", ".claude", "skills", "pixel-art", "scripts"))
import house64  # noqa: E402
import pets64  # noqa: E402

# Letters every pet shares: outline, eyes and their shine, mouth and its
# inside, cheeks, inner ears, tummy, nose, a crumb, beaks and chick feet.
PALETTE = {
    "o": "#2b2238", "e": "#2b2238", "h": "#ffffff", "m": "#6a2a40", "k": "#ff8fa8", "c": "#ffb3c1",
    "p": "#ff9fb2", "w": "#fff8ee", "n": "#e0849c", "F": "#c08a50", "y": "#f4a23a", "Y": "#c97a1c",
}
SHADES = {"d": {"from": "b", "shade": 0.8, "hue": -8}, "l": {"from": "b", "shade": 1.3}}

# species: (base colour name, its body colour, its own letters, {variant: (body, extra letters)})
# The names match SPECIES in shared/pet.js; the first is the plain sprite.
PETS = {
    "cat": ("cream", "#f4d9b0", {}, {
        "ginger": ("#f0a04b", {}),
        "charcoal": ("#5b5b6e", {"w": "#d8d8e0"}),
        "mint": ("#9de0c8", {}),
    }),
    "bunny": ("snow", "#f3eee8", {"w": "#ffffff"}, {
        "cocoa": ("#b98a62", {}),
        "pebble": ("#a7a7b8", {}),
        "blush": ("#f5b5c8", {"p": "#ff7f9f"}),
    }),
    "chick": ("sunny", "#ffd95a", {"c": "#ff9a7a"}, {
        "sky": ("#9cc8f0", {}),
        "rose": ("#f7a8c4", {}),
        "sprout": ("#a8dc8a", {}),
    }),
    "lop": ("honey", "#e2b77a", {"a": {"from": "b", "shade": 0.88}, "p": "#f4a6b8"}, {
        "snow": ("#f3eee8", {"p": "#f7b6c6"}),
        "smoke": ("#8e8a98", {}),
        "choc": ("#7a553c", {"w": "#f1e2cf"}),
    }),
    "raccoon": ("grey", "#a9a6b2", {"j": {"from": "b", "shade": 0.42, "hue": -6}, "w": "#f4f1ec", "i": "#d8d4de"}, {
        "cinnamon": ("#b88a64", {}),
        "silver": ("#cfccd6", {}),
        "midnight": ("#6c6878", {"w": "#d9d6e0", "j": "#2e2a36"}),
    }),
    "ferret": ("sable", "#8a6a4f", {"j": {"from": "b", "shade": 0.75, "hue": -4}, "w": "#f6ead2", "p": "#f4a6b8"}, {
        "albino": ("#f1e6d4", {"j": "#e3d2bc", "e": "#c2405a"}),
        "cinnamon": ("#c08850", {}),
        "silver": ("#a29da8", {}),
    }),
    "possum": ("grey", "#9c98a3", {"K": "#3a3540", "p": "#f2a6b8", "w": "#f6f3ee", "r": "#b4afbd", "t": "#f0b8c6"}, {
        "smoky": ("#6f6a78", {}),
        "cream": ("#d8cfc0", {}),
        "blossom": ("#c9a3b5", {}),
    }),
    "stitched": ("lilac", "#c9b6e8", {
        "x": "#4a2c4a", "u": "#2b2238", "U": "#4a3a5e", "v": "#a99bc4", "W": "#fffaf0",
        "q": {"from": "b", "hue": 70, "shade": 0.85, "sat": 1.3}, "r": "#d64560", "H": "#ff8fa8", "R": "#9a2a40",
        "B": "#f4ecd8", "C": {"from": "B", "shade": 0.82},
    }, {
        "mint": ("#a8e6cf", {}),
        "bubblegum": ("#f7b2cf", {"r": "#b8264a"}),
        "bone": ("#e8e4dc", {"x": "#2b2238", "q": "#9fb4c8"}),
    }),
}


def pet_sprite(name):
    _base, body, own, variants = PETS[name]
    return {
        "palette": {"b": body, **SHADES, **own},
        "frames": pets64.SPECIES[name].frames(),
        "animations": pets64.ANIMATIONS,
        "variants": {v: {"b": c, **extra} for v, (c, extra) in variants.items()},
    }


def piece(fn, *args, frames=None, variants=None):
    rows, palette = fn(*args)
    return {"palette": palette, "frames": {**{"main": rows}, **(frames or {})}, **({"variants": variants} if variants else {})}


paper, base, wood, check, tilewall = house64.surfaces()
spec = {
    "palette": PALETTE,
    "sprites": {
        **{name: pet_sprite(name) for name in PETS},
        "egg": {
            "palette": {"w": "#fff6e6", "s": "#f4a6b8", "d": "#e8d8c0", "l": "#ffffff"},
            "frames": pets64.egg_frames(),
            "animations": {"wobble": {"frames": ["egg_0", "egg_1", "egg_0", "egg_2", "egg_0", "egg_0"], "fps": 4}},
        },
        "crown": {"palette": {"y": "#ffd166", "Y": "#e9a93a", "r": "#e05d5d"}, "frames": {"crown": pets64.crown()}},

        # Walls and floors, tiled.
        "wall": {
            "tile": True,
            "palette": {"a": "#8fa8c8", "A": {"from": "a", "shade": 0.92}, "t": {"from": "a", "shade": 0.62},
                        "T": {"from": "a", "shade": 0.48}},
            "frames": {"paper": paper, "base": base},
            "variants": {"rose": {"a": "#e7b8c6"}, "lilac": {"a": "#c3b3e0"}, "butter": {"a": "#f0dc9c"}},
        },
        "floor": {"tile": True, "palette": {"k": "#c08a5c", "K": "#ad7a4e", "s": "#8a5d3a"}, "frames": {"wood": wood}},
        "tile": {
            "tile": True,
            "palette": {"a": "#f4efe6", "g": {"from": "a", "shade": 0.8}, "A": "#e0d2bd"},
            "frames": {"check": check, "wall": tilewall},
            "variants": {"aqua": {"a": "#d8f0ee", "A": "#9fd3cf"}},
        },

        # The furniture.
        "bed": piece(house64.bed, variants={"blue": {"q": "#7fa8d8"}}),
        "nightstand": piece(house64.nightstand, frames={"off": {"base": "main", "replace": {"L": "s", "l": "s"}}}),
        "window": piece(house64.window, frames={"night": {"base": "main", "replace": {"g": "n", "G": "N"}}}),
        "picture": piece(house64.picture, variants={"sea": {"g": "#5a8ad8", "G": "#3d6fbf"}}),
        "rug": piece(house64.rug, variants={"pink": {"r": "#e7a1b6"}, "sage": {"r": "#a8c99a"}}),
        "fridge": piece(house64.fridge),
        "counter": piece(house64.counter),
        "table": piece(house64.table),
        "sofa": piece(house64.sofa_back),
        "tv": piece(house64.tv),
        "bookshelf": piece(house64.bookshelf),
        "plant": piece(house64.plant),
        "bathtub": piece(house64.bathtub),
        "toilet": piece(house64.toilet),
        "washer": piece(house64.washer),
        "basket": piece(house64.basket),
        "bowl": {"palette": house64.bowl(False)[1],
                 "frames": {"empty": house64.bowl(False)[0], "full": house64.bowl(True)[0]}},
        "door": piece(house64.door),
        "mat": piece(house64.mat),
    },
}

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sprites.json")
with open(out, "w") as fh:
    json.dump(spec, fh, separators=(",", ":"))
print("wrote", out)
