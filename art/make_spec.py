"""
Writes art/sprites.json: RoomiePet's pixel art for the pixel-art skill to
render (npm run art). Pets are 64 x 64 animals drawn from shapes in pets.py;
this file gives them their colours: each species' colour variants recolour
the whole pet, shading included. The flat and its furniture aren't sprites:
the app draws them from the room model (shared/home.js, client/src/iso.js).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", ".claude", "skills", "pixel-art", "scripts"))
import pets  # noqa: E402
from painter import Painter  # noqa: E402

# Letters every pet shares: outline, eyes and their shine, mouth and its
# inside, cheeks, inner ears, chest, nose, a crumb, beaks and chick feet, tears, a fluffy tail.
PALETTE = {
    "o": "#2b2238", "e": "#2b2238", "h": "#ffffff", "m": "#6a2a40", "k": "#ff8fa8", "c": "#ffb3c1",
    "p": "#ff9fb2", "w": "#fff8ee", "n": "#e0849c", "F": "#c08a50", "y": "#f4a23a", "Y": "#c97a1c",
    "s": "#8fd0ef", "W": "#ffffff",
}
# Shadow, light, and the far side (legs and ears beyond the body), all from the body colour.
SHADES = {"d": {"from": "b", "shade": 0.78, "hue": -8}, "l": {"from": "b", "shade": 1.28},
          "a": {"from": "b", "shade": 0.86, "hue": -4}}

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
    "lop": ("honey", "#e2b77a", {"p": "#f4a6b8"}, {
        "snow": ("#f3eee8", {"p": "#f7b6c6"}),
        "smoke": ("#8e8a98", {}),
        "choc": ("#7a553c", {"w": "#f1e2cf"}),
    }),
    "raccoon": ("grey", "#a9a6b2", {"j": {"from": "b", "shade": 0.5, "hue": -6}, "w": "#f4f1ec"}, {
        "cinnamon": ("#b88a64", {}),
        "silver": ("#cfccd6", {}),
        "midnight": ("#6c6878", {"w": "#d9d6e0", "j": "#3a3644"}),
    }),
    "ferret": ("sable", "#8a6a4f", {"j": {"from": "b", "shade": 0.72, "hue": -4}, "w": "#f6ead2", "p": "#f4a6b8"}, {
        "albino": ("#f1e6d4", {"j": "#e3d2bc", "e": "#c2405a"}),
        "cinnamon": ("#c08850", {}),
        "silver": ("#a29da8", {}),
    }),
    "possum": ("grey", "#9c98a3", {"K": "#3a3540", "p": "#f2a6b8", "w": "#f6f3ee", "r": "#b4afbd", "t": "#f0b8c6"}, {
        "smoky": ("#6f6a78", {}),
        "cream": ("#d8cfc0", {}),
        "blossom": ("#c9a3b5", {}),
    }),
    # Kuromi: the hood is the colour that changes; her face and body stay white, the skull pink.
    "kuromi": ("black", "#3a3442", {"w": "#ffffff", "S": "#f48fb6", "p": "#f48fb6", "c": "#f7b3cf", "n": "#f48fb6"}, {
        "violet": ("#5b4380", {}),
        "pink": ("#f29ac0", {"S": "#ffffff", "p": "#ffffff"}),
        "midnight": ("#2b3150", {}),
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
        "frames": pets.SPECIES[name].frames(),
        "animations": pets.ANIMATIONS,
        "variants": {v: {"b": c, **extra} for v, (c, extra) in variants.items()},
    }


def bowl():
    """A full food bowl, for the Chores shortcut's icon."""
    p = Painter(32, 22)
    p.ellipse(16, 9, 10, 5, "F")
    p.ellipse(12, 7, 3, 2, "f")
    p.ellipse(20, 8, 2.5, 1.6, "f")
    p.ellipse(16, 15, 13, 5, "q")
    p.rect(3, 11, 27, 4, "q")
    p.ellipse(16, 11, 13, 2.2, "Q")
    p.ellipse(16, 10.5, 10, 1.4, "F")
    p.outline("o")
    return p.rows()


spec = {
    "palette": PALETTE,
    "sprites": {
        **{name: pet_sprite(name) for name in PETS},
        "egg": {
            "palette": {"w": "#fff6e6", "s": "#f4a6b8", "d": "#e8d8c0", "l": "#ffffff"},
            "frames": pets.egg_frames(),
            "animations": {"wobble": {"frames": ["egg_0", "egg_1", "egg_0", "egg_2", "egg_0", "egg_0"], "fps": 4}},
        },
        "crown": {"palette": {"y": "#ffd166", "Y": "#e9a93a", "r": "#e05d5d"}, "frames": {"crown": pets.crown()}},
        "bowl": {"palette": {"q": "#7fa8d8", "Q": "#a9c6ea", "F": "#c08a50", "f": "#dba872"}, "frames": {"full": bowl()}},
    },
}

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sprites.json")
with open(out, "w") as fh:
    json.dump(spec, fh, separators=(",", ":"))
print("wrote", out)
